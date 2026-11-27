// Respuestas falsas de la API para los tests, con los datos del caso A de M2.

export function simulacionCasoA() {
  return {
    factorInflacion: 2,
    opciones: {
      plazoFijo: { valorFinalNominal: 1060.9, valorReal: 530.45, resultadoRealPct: -46.955, leGanoALaInflacion: false },
      dolar: { valorFinalNominal: 3000, valorReal: 1500, resultadoRealPct: 50, leGanoALaInflacion: true },
      pesosQuietos: { valorFinalNominal: 1000, valorReal: 500, resultadoRealPct: -50, leGanoALaInflacion: false },
    },
    evolucion: [
      { mes: '2020-01', plazoFijo: 2000, dolar: 2000, pesosQuietos: 2000 },
      { mes: '2020-02', plazoFijo: 1373.33, dolar: 2666.67, pesosQuietos: 1333.33 },
      { mes: '2020-03', plazoFijo: 1060.9, dolar: 3000, pesosQuietos: 1000 },
    ],
    datosHasta: { ipc: '2020-03-01', dolar: '2020-03-02', tasa: '2020-01-02' },
    rango: { mesMinimo: '2019-12', mesMaximo: '2020-03' },
  };
}

export function frescuraFalsa() {
  return {
    fuentes: [
      { id: 'ipc_nacional', nombre: 'IPC nacional', estado: 'vigente', ultimaObservacion: '2026-10-01', ultimaFechaDeclarada: '2026-10-01', fechaChequeo: '2026-11-27', diasDesdeFinDelPeriodo: 27, mesesDeAtraso: 1 },
      { id: 'dolar_minorista', nombre: 'Dólar minorista', estado: 'vigente', ultimaObservacion: '2026-11-26', ultimaFechaDeclarada: '2026-11-26', fechaChequeo: '2026-11-27', diasDesdeFinDelPeriodo: 1, mesesDeAtraso: 0 },
      { id: 'tasa_plazo_fijo_30d', nombre: 'Tasa a 30 días', estado: 'sin_verificar', ultimaObservacion: null, ultimaFechaDeclarada: null, fechaChequeo: null, diasDesdeFinDelPeriodo: null, mesesDeAtraso: null },
    ],
  };
}
