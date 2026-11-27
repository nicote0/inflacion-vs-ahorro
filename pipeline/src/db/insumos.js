// Lee del modelo los insumos de la simulación, con la forma que espera simular().

const IDS = { ipc: 'ipc_nacional', dolar: 'dolar_minorista', tasa: 'tasa_plazo_fijo_30d' };

const primerDia = (mes) => `${mes}-01`;

async function serieMensual(cliente, indicadorId, desde, hasta) {
  const { rows } = await cliente.query(
    `select to_char(mes, 'YYYY-MM') as mes, valor::text as valor from modelo.hecho_mensual
     where indicador_id = $1 and mes between $2 and $3 order by mes`,
    [indicadorId, primerDia(desde), primerDia(hasta)]);
  return new Map(rows.map((r) => [r.mes, Number(r.valor)]));
}

// Tasas diarias hasta el último día del mes final, más la última publicada antes de desde
// (la simulación la necesita si el primer tramo empieza un día sin tasa).
async function tasas(cliente, indicadorId, desde, hasta) {
  const { rows } = await cliente.query(
    `(select to_char(fecha, 'YYYY-MM-DD') as fecha, valor::text as valor from modelo.hecho_diario
        where indicador_id = $1 and fecha < $2::date order by modelo.hecho_diario.fecha desc limit 1)
     union all
     (select to_char(fecha, 'YYYY-MM-DD') as fecha, valor::text as valor from modelo.hecho_diario
        where indicador_id = $1 and fecha >= $2::date
          and fecha < ($3::date + interval '1 month'))
     order by fecha`,
    [indicadorId, primerDia(desde), primerDia(hasta)]);
  return rows.map((r) => ({ fecha: r.fecha, valor: Number(r.valor) }));
}

export async function leerInsumos(cliente, { desde, hasta }, ids = IDS) {
  return {
    ipcMensual: await serieMensual(cliente, ids.ipc, desde, hasta),
    dolarMensual: await serieMensual(cliente, ids.dolar, desde, hasta),
    tasasDiarias: await tasas(cliente, ids.tasa, desde, hasta),
  };
}
