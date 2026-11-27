// Tablas de control: ejecuciones, resultado por fuente y frescura.

export async function iniciarEjecucion(cliente) {
  const { rows } = await cliente.query(
    `insert into control.ejecucion (estado) values ('en_curso') returning ejecucion_id`);
  return Number(rows[0].ejecucion_id);
}

export async function cerrarEjecucion(cliente, ejecucionId, estado) {
  await cliente.query(
    'update control.ejecucion set estado = $2, terminada_en = now() where ejecucion_id = $1', [ejecucionId, estado]);
}

export async function registrarFuente(cliente, ejecucionId, r) {
  await cliente.query(
    `insert into control.ejecucion_fuente (ejecucion_id, fuente_id, iniciada_en, terminada_en, estado, sha256,
       filas_leidas, filas_insertadas, filas_actualizadas, filas_sin_cambios, filas_rechazadas, mensaje_error)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [ejecucionId, r.fuenteId, r.iniciadaEn, r.terminadaEn, r.estado, r.sha256, r.filasLeidas,
      r.filasInsertadas, r.filasActualizadas, r.filasSinCambios, r.filasRechazadas, r.error],
  );
}

// Hash de la última carga exitosa de la fuente. Se compara contra la base y no contra el disco,
// porque en GitHub Actions data/raw arranca vacío en cada corrida.
export async function ultimoHashOk(cliente, fuenteId) {
  const { rows } = await cliente.query(
    `select sha256 from control.ejecucion_fuente
     where fuente_id = $1 and estado = 'ok' order by terminada_en desc limit 1`, [fuenteId]);
  return rows[0]?.sha256 ?? null;
}

// Última fecha con dato cargada en el modelo, como AAAA-MM-DD (o null).
export async function ultimaFechaCargada(cliente, fuente) {
  const sql = fuente.periodicidad === 'diaria'
    ? `select to_char(max(fecha), 'YYYY-MM-DD') as ultima from modelo.hecho_diario where indicador_id = $1`
    : `select to_char(max(mes), 'YYYY-MM-DD') as ultima from modelo.hecho_mensual where indicador_id = $1 and origen = 'fuente'`;
  return (await cliente.query(sql, [fuente.id])).rows[0].ultima;
}

export async function guardarFrescura(cliente, fuenteId, f) {
  await cliente.query(
    `insert into control.frescura (fuente_id, ultima_observacion, ultima_fecha_declarada, estado,
       fin_del_periodo, dias_desde_fin_del_periodo, fecha_chequeo)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (fuente_id) do update set
       ultima_observacion = excluded.ultima_observacion, ultima_fecha_declarada = excluded.ultima_fecha_declarada,
       estado = excluded.estado, fin_del_periodo = excluded.fin_del_periodo,
       dias_desde_fin_del_periodo = excluded.dias_desde_fin_del_periodo, fecha_chequeo = excluded.fecha_chequeo,
       actualizado_en = now()`,
    [fuenteId, f.ultimaObservacion, f.ultimaFechaDeclarada, f.estado, f.finDelPeriodo, f.diasDesdeFinDelPeriodo, f.fechaChequeo],
  );
}
