// Simulación: ¿qué le ganó a la inflación entre dos meses?
// Plazo fijo renovado cada 30 días, dólar oficial y pesos quietos.
// Reglas: sección Cálculo de docs/superpowers/specs/2026-11-25-inflacion-vs-ahorro-design.md
// y sección Simulación de docs/superpowers/specs/2026-11-26-m2-base-y-carga-design.md.

const DIAS_TRAMO = 30;
const DIA_MS = 24 * 60 * 60 * 1000;
const MES = /^(\d{4})-(0[1-9]|1[0-2])$/;

export class ErrorSimulacion extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.name = 'ErrorSimulacion';
    this.codigo = codigo;
  }
}

// Fechas como días UTC, para no depender de la zona horaria de la máquina.
const aDia = (fecha) => {
  const [a, m, d] = fecha.split('-').map(Number);
  return Date.UTC(a, m - 1, d) / DIA_MS;
};
const aFecha = (dia) => new Date(dia * DIA_MS).toISOString().slice(0, 10);
const ultimoDiaDelMes = (mes) => {
  const [a, m] = mes.split('-').map(Number);
  return Date.UTC(a, m, 0) / DIA_MS;
};

function mesesEntre(desde, hasta) {
  const meses = [];
  let [a, m] = desde.split('-').map(Number);
  for (let mes = desde; mes <= hasta; ) {
    meses.push(mes);
    m += 1;
    if (m > 12) { m = 1; a += 1; }
    mes = `${a}-${String(m).padStart(2, '0')}`;
  }
  return meses;
}

function validar({ desde, hasta, monto, ipcMensual, dolarMensual }, meses) {
  if (!MES.test(desde ?? '') || !MES.test(hasta ?? '')) {
    throw new ErrorSimulacion('PERIODO_INVALIDO', 'Los meses tienen que tener el formato AAAA-MM');
  }
  if (hasta <= desde) {
    throw new ErrorSimulacion('PERIODO_INVALIDO', 'El mes final tiene que ser posterior al inicial');
  }
  if (typeof monto !== 'number' || !Number.isFinite(monto) || monto <= 0) {
    throw new ErrorSimulacion('MONTO_INVALIDO', 'El monto tiene que ser un número mayor que 0');
  }
  for (const mes of meses) {
    if (!Number.isFinite(ipcMensual.get(mes))) {
      throw new ErrorSimulacion('FALTA_IPC', `No hay IPC publicado para ${mes}`);
    }
    if (!Number.isFinite(dolarMensual.get(mes))) {
      throw new ErrorSimulacion('FALTA_DOLAR', `No hay cotización del dólar para ${mes}`);
    }
  }
}

// Tramos de 30 días desde la primera fecha con tasa del mes inicial. Cada tramo usa la tasa
// de su día de inicio o la última publicada antes. Solo se cobra si vence a más tardar
// el último día del mes final; el primer tramo que vence después queda sin cobrar.
function renovar({ desde, hasta, monto, tasasDiarias }) {
  const tasas = tasasDiarias.map((t) => ({ dia: aDia(t.fecha), valor: t.valor }));
  const primera = tasas.find((t) => t.dia >= aDia(`${desde}-01`));
  if (!primera || primera.dia > ultimoDiaDelMes(desde)) {
    throw new ErrorSimulacion('SIN_TASA', `No hay tasa publicada en ${desde}`);
  }

  const fin = ultimoDiaDelMes(hasta);
  const renovaciones = [];
  let capital = monto;
  let i = 0;
  for (let inicio = primera.dia; ; inicio += DIAS_TRAMO) {
    while (i + 1 < tasas.length && tasas[i + 1].dia <= inicio) i++;
    const tna = tasas[i].valor;
    const vencimiento = inicio + DIAS_TRAMO;
    const cobrada = vencimiento <= fin;
    const capitalFinal = cobrada ? capital * (1 + (tna / 100) * (DIAS_TRAMO / 365)) : capital;
    renovaciones.push({
      inicio: aFecha(inicio), vencimiento: aFecha(vencimiento), tna,
      capitalInicial: capital, capitalFinal, cobrada,
    });
    if (!cobrada) return renovaciones;
    capital = capitalFinal;
  }
}

// Capital del plazo fijo a fin de un mes: el de después del último vencimiento cobrado hasta ese día.
function capitalAFinDe(mes, renovaciones, monto) {
  const finDelMes = aFecha(ultimoDiaDelMes(mes));
  let capital = monto;
  for (const r of renovaciones) {
    if (r.cobrada && r.vencimiento <= finDelMes) capital = r.capitalFinal;
  }
  return capital;
}

export function simular(entrada) {
  const { desde, hasta, monto, ipcMensual, dolarMensual } = entrada;
  const meses = MES.test(desde ?? '') && MES.test(hasta ?? '') && hasta > desde ? mesesEntre(desde, hasta) : [];
  validar(entrada, meses);

  const ipcFinal = ipcMensual.get(hasta);
  const factorInflacion = ipcFinal / ipcMensual.get(desde);
  const dolares = monto / dolarMensual.get(desde);
  const renovaciones = renovar(entrada);

  const opcion = (valorFinalNominal) => {
    const valorReal = valorFinalNominal / factorInflacion;
    return { valorFinalNominal, valorReal, resultadoRealPct: (valorReal / monto - 1) * 100 };
  };

  const evolucion = meses.map((mes) => {
    const aPesosFinales = ipcFinal / ipcMensual.get(mes);
    return {
      mes,
      plazoFijo: capitalAFinDe(mes, renovaciones, monto) * aPesosFinales,
      dolar: dolares * dolarMensual.get(mes) * aPesosFinales,
      pesosQuietos: monto * aPesosFinales,
    };
  });

  return {
    factorInflacion,
    opciones: {
      plazoFijo: opcion(capitalAFinDe(hasta, renovaciones, monto)),
      dolar: opcion(dolares * dolarMensual.get(hasta)),
      pesosQuietos: opcion(monto),
    },
    evolucion,
    renovaciones,
  };
}
