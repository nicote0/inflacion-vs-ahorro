// Lee de Postgres la foto completa de los datos (unas 5000 filas). Abre una conexión, lee y la cierra:
// en serverless no conviene mantener un pool vivo por instancia.
import pg from 'pg';

const SQL_INDICADORES = `
  select i.indicador_id as id, i.nombre, i.unidad, i.fuente, i.periodicidad,
         to_char(r.desde, 'YYYY-MM-DD') as desde, to_char(r.hasta, 'YYYY-MM-DD') as hasta
  from modelo.dim_indicador i
  left join (
    select indicador_id, min(fecha) as desde, max(fecha) as hasta from modelo.hecho_diario group by 1
    union all
    select indicador_id, min(mes), max(mes) from modelo.hecho_mensual where origen = 'fuente' group by 1
  ) r using (indicador_id)
  order by i.indicador_id`;

const SQL_DIARIAS = `
  select indicador_id, to_char(fecha, 'YYYY-MM-DD') as fecha, valor::text as valor
  from modelo.hecho_diario order by indicador_id, fecha`;

const SQL_MENSUALES = `
  select indicador_id, to_char(mes, 'YYYY-MM') as mes, valor::text as valor, dias_con_dato
  from modelo.hecho_mensual order by indicador_id, mes`;

const SQL_FRESCURA = `
  select fuente_id, estado,
         to_char(ultima_observacion, 'YYYY-MM-DD') as ultima_observacion,
         to_char(ultima_fecha_declarada, 'YYYY-MM-DD') as ultima_fecha_declarada,
         to_char(fecha_chequeo, 'YYYY-MM-DD') as fecha_chequeo,
         dias_desde_fin_del_periodo
  from control.frescura order by fuente_id`;

function agrupar(filas, armar) {
  const mapa = new Map();
  for (const f of filas) {
    if (!mapa.has(f.indicador_id)) mapa.set(f.indicador_id, []);
    mapa.get(f.indicador_id).push(armar(f));
  }
  return mapa;
}

export async function leerFotoDeLaBase(url) {
  const cliente = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15000 });
  await cliente.connect();
  try {
    const indicadores = (await cliente.query(SQL_INDICADORES)).rows;
    const diarias = (await cliente.query(SQL_DIARIAS)).rows;
    const mensuales = (await cliente.query(SQL_MENSUALES)).rows;
    const frescura = (await cliente.query(SQL_FRESCURA)).rows;
    return {
      indicadores,
      diarias: agrupar(diarias, (f) => ({ fecha: f.fecha, valor: Number(f.valor) })),
      mensuales: agrupar(mensuales, (f) => ({ mes: f.mes, valor: Number(f.valor), diasConDato: f.dias_con_dato })),
      frescura: new Map(frescura.map((f) => [f.fuente_id, {
        estado: f.estado,
        ultimaObservacion: f.ultima_observacion,
        ultimaFechaDeclarada: f.ultima_fecha_declarada,
        fechaChequeo: f.fecha_chequeo,
        diasDesdeFinDelPeriodo: f.dias_desde_fin_del_periodo,
      }])),
    };
  } finally {
    await cliente.end();
  }
}
