// Foto chica con los datos del caso A de simulacion/test/simular.test.js.
export function fotoDePrueba() {
  return {
    indicadores: [
      { id: 'ipc_nacional', nombre: 'IPC nacional', unidad: 'índice (dic 2016 = 100)', fuente: 'INDEC', periodicidad: 'mensual', desde: '2019-12-01', hasta: '2020-03-01' },
      { id: 'dolar_minorista', nombre: 'Dólar minorista', unidad: 'pesos por dólar', fuente: 'BCRA', periodicidad: 'diaria', desde: '2020-01-02', hasta: '2020-03-02' },
      { id: 'tasa_plazo_fijo_30d', nombre: 'Tasa a 30 días', unidad: '% TNA', fuente: 'BCRA', periodicidad: 'diaria', desde: '2020-01-02', hasta: '2020-01-02' },
    ],
    diarias: new Map([
      ['dolar_minorista', [{ fecha: '2020-01-02', valor: 10 }, { fecha: '2020-02-03', valor: 20 }, { fecha: '2020-03-02', valor: 30 }]],
      ['tasa_plazo_fijo_30d', [{ fecha: '2020-01-02', valor: 36.5 }]],
    ]),
    mensuales: new Map([
      ['ipc_nacional', [
        { mes: '2019-12', valor: 90, diasConDato: null }, { mes: '2020-01', valor: 100, diasConDato: null },
        { mes: '2020-02', valor: 150, diasConDato: null }, { mes: '2020-03', valor: 200, diasConDato: null },
      ]],
      ['dolar_minorista', [
        { mes: '2020-01', valor: 10, diasConDato: 1 }, { mes: '2020-02', valor: 20, diasConDato: 1 }, { mes: '2020-03', valor: 30, diasConDato: 1 },
      ]],
      ['tasa_plazo_fijo_30d', [{ mes: '2020-01', valor: 36.5, diasConDato: 1 }]],
    ]),
    frescura: new Map([
      ['ipc_nacional', { estado: 'vigente', ultimaObservacion: '2020-03-01', ultimaFechaDeclarada: '2020-03-01', fechaChequeo: '2020-04-20', diasDesdeFinDelPeriodo: 20 }],
      ['dolar_minorista', { estado: 'vigente', ultimaObservacion: '2020-03-02', ultimaFechaDeclarada: '2020-03-02', fechaChequeo: '2020-03-03', diasDesdeFinDelPeriodo: 1 }],
    ]),
  };
}

// App armada con la foto de prueba.
export async function appDePrueba(opciones = {}) {
  const { crearApp } = await import('../src/app.js');
  const foto = opciones.foto ?? fotoDePrueba();
  return crearApp({ obtenerFoto: async () => foto, ...opciones });
}
