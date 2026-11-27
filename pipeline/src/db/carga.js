// Carga de una fuente: staging (texto tal cual llegó) -> modelo (tipado, con rechazos y upsert).
// Todo en SQL y en una sola transacción por fuente.

const STAGING = { indec_series: 'staging.indec_series', bcra_monetarias: 'staging.bcra_monetarias' };
const ORGANISMO = { indec_series: 'INDEC', bcra_monetarias: 'BCRA' };

function tablaStaging(fuente) {
  const tabla = STAGING[fuente.tipo];
  if (!tabla) throw new Error(`Tipo de fuente desconocido: ${fuente.tipo}`);
  return tabla;
}

export async function sincronizarIndicadores(cliente, fuentes) {
  for (const f of fuentes) {
    await cliente.query(
      `insert into modelo.dim_indicador (indicador_id, nombre, unidad, fuente, periodicidad, serie_origen)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (indicador_id) do update set
         nombre = excluded.nombre, unidad = excluded.unidad, fuente = excluded.fuente,
         periodicidad = excluded.periodicidad, serie_origen = excluded.serie_origen`,
      [f.id, f.nombre, f.unidad, ORGANISMO[f.tipo] ?? f.tipo, f.periodicidad, f.serie ?? `variable ${f.variable}`],
    );
  }
}

// Reemplaza el staging de la fuente con las filas nuevas.
async function reemplazarStaging(cliente, tabla, { fuente, sha256, filas }) {
  await cliente.query(`delete from ${tabla} where fuente_id = $1`, [fuente.id]);
  await cliente.query(
    `insert into ${tabla} (fuente_id, sha256, fila, fecha, valor)
     select $1, $2, f.fila, f.fecha, f.valor
     from unnest($3::int[], $4::text[], $5::text[]) as f(fila, fecha, valor)`,
    [fuente.id, sha256, filas.map((f) => f.fila), filas.map((f) => f.fecha), filas.map((f) => f.valor)],
  );
}

// Tipa el staging en una tabla temporal y marca el motivo de cada fila que no se puede usar.
// Una fecha repetida (o un mes repetido, en series mensuales) conserva la fila de menor número.
async function clasificar(cliente, tabla, fuente) {
  await cliente.query(
    `create temp table carga_actual on commit drop as
     select fila, fecha, valor,
       case when not staging.fecha_valida(fecha) then 'fecha_invalida'
            when not staging.valor_valido(valor) then 'valor_invalido' end as motivo,
       case when staging.fecha_valida(fecha) then fecha::date end as fecha_tipada,
       case when staging.valor_valido(valor) then valor::numeric end as valor_tipado
     from ${tabla} where fuente_id = $1`,
    [fuente.id],
  );
  const clave = fuente.periodicidad === 'mensual' ? `date_trunc('month', fecha_tipada)` : 'fecha_tipada';
  await cliente.query(
    `update carga_actual set motivo = 'fecha_repetida'
     where fila in (
       select fila from (
         select fila, row_number() over (partition by ${clave} order by fila) as orden
         from carga_actual where motivo is null
       ) x where orden > 1
     )`,
  );
}

async function registrarRechazos(cliente, fuente, ejecucionId) {
  const { rowCount } = await cliente.query(
    `insert into control.fila_rechazada (ejecucion_id, fuente_id, fila, fecha_texto, valor_texto, motivo)
     select $1, $2, fila, fecha, valor, motivo from carga_actual where motivo is not null`,
    [ejecucionId, fuente.id],
  );
  return rowCount;
}

// Agrega a dim_fecha los días que faltan, desde el primer día del mes de la fecha más vieja.
async function extenderDimFecha(cliente) {
  await cliente.query(
    `insert into modelo.dim_fecha (fecha, anio, mes, dia, primer_dia_mes, dia_semana, es_fin_de_semana)
     select d::date, extract(year from d), extract(month from d), extract(day from d),
            date_trunc('month', d)::date, extract(isodow from d), extract(isodow from d) in (6, 7)
     from (select min(fecha_tipada) as desde, max(fecha_tipada) as hasta from carga_actual where motivo is null) r,
          generate_series(date_trunc('month', r.desde), r.hasta, interval '1 day') as d
     on conflict (fecha) do nothing`,
  );
}

// Upsert en el hecho que corresponde. Devuelve cuántas filas se insertaron y cuántas se actualizaron.
async function upsertHechos(cliente, fuente, sha256) {
  const diaria = fuente.periodicidad === 'diaria';
  const sql = diaria
    ? `insert into modelo.hecho_diario as h (indicador_id, fecha, valor, sha256)
       select $1, fecha_tipada, valor_tipado, $2 from carga_actual where motivo is null
       on conflict (indicador_id, fecha) do update
         set valor = excluded.valor, sha256 = excluded.sha256, actualizado_en = now()
         where h.valor is distinct from excluded.valor
       returning (xmax = 0) as insertada`
    : `insert into modelo.hecho_mensual as h (indicador_id, mes, valor, dias_con_dato, origen)
       select $1, date_trunc('month', fecha_tipada)::date, valor_tipado, null, 'fuente'
       from carga_actual where motivo is null
       on conflict (indicador_id, mes) do update
         set valor = excluded.valor, actualizado_en = now()
         where h.valor is distinct from excluded.valor
       returning (xmax = 0) as insertada`;
  const { rows } = await cliente.query(sql, diaria ? [fuente.id, sha256] : [fuente.id]);
  const insertadas = rows.filter((r) => r.insertada).length;
  return { insertadas, actualizadas: rows.length - insertadas };
}

// Promedio mensual y días con dato de toda la serie diaria (#45). No crea meses sin datos.
async function recalcularPromedios(cliente, fuente) {
  await cliente.query(
    `insert into modelo.hecho_mensual as h (indicador_id, mes, valor, dias_con_dato, origen)
     select indicador_id, date_trunc('month', fecha)::date, avg(valor), count(*), 'promedio_diario'
     from modelo.hecho_diario where indicador_id = $1
     group by 1, 2
     on conflict (indicador_id, mes) do update
       set valor = excluded.valor, dias_con_dato = excluded.dias_con_dato, actualizado_en = now()
       where (h.valor, h.dias_con_dato) is distinct from (excluded.valor, excluded.dias_con_dato)`,
    [fuente.id],
  );
}

export async function cargarFuente(cliente, { fuente, sha256, filas, ejecucionId }) {
  const tabla = tablaStaging(fuente);
  await cliente.query('begin');
  try {
    await reemplazarStaging(cliente, tabla, { fuente, sha256, filas });
    await clasificar(cliente, tabla, fuente);
    const filasRechazadas = await registrarRechazos(cliente, fuente, ejecucionId);
    await extenderDimFecha(cliente);
    const { insertadas, actualizadas } = await upsertHechos(cliente, fuente, sha256);
    if (fuente.periodicidad === 'diaria') await recalcularPromedios(cliente, fuente);
    await cliente.query('commit');

    const validas = filas.length - filasRechazadas;
    return {
      filasLeidas: filas.length,
      filasInsertadas: insertadas,
      filasActualizadas: actualizadas,
      filasSinCambios: validas - insertadas - actualizadas,
      filasRechazadas,
    };
  } catch (err) {
    await cliente.query('rollback');
    throw err;
  }
}
