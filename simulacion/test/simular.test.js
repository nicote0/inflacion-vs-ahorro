import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simular, ErrorSimulacion } from '../src/index.js';

// Compara con tolerancia relativa, para no depender del redondeo binario.
function cerca(real, esperado, mensaje) {
  const tolerancia = 1e-9 * Math.max(1, Math.abs(esperado));
  assert.ok(Math.abs(real - esperado) <= tolerancia, `${mensaje}: ${real} != ${esperado}`);
}
const redondear = (n) => Math.round(n * 100) / 100;

// Caso A, calculado a mano:
// - IPC 100 -> 150 -> 200. Factor de inflación = 200 / 100 = 2.
// - Pesos quietos: 1000 nominal; real = 1000 / 2 = 500; resultado = -50 %.
// - Dólar: 1000 / 10 = 100 USD; en marzo 100 x 30 = 3000; real 1500; resultado +50 %.
// - Plazo fijo con TNA 36,5 %: cada tramo rinde 36,5/100 x 30/365 = 0,03.
//   Tramo 1: 2020-01-02 -> 2020-02-01 (cobrado). Tramo 2: 2020-02-01 -> 2020-03-02 (cobrado).
//   Tramo 3: 2020-03-02 -> 2020-04-01, vence después del 31/03: no se cobra.
//   1000 x 1,03 x 1,03 = 1060,9; real 530,45; resultado -46,955 %.
// - Evolución en pesos de marzo (x IPC marzo / IPC del mes):
//   enero:   plazo fijo 1000 x 2 = 2000; dólar 100 x 10 x 2 = 2000; quietos 1000 x 2 = 2000.
//   febrero: plazo fijo 1030 x 200/150 = 1373,33; dólar 2000 x 200/150 = 2666,67; quietos 1333,33.
//   marzo:   plazo fijo 1060,9; dólar 3000; quietos 1000.
const casoA = () => ({
  desde: '2020-01',
  hasta: '2020-03',
  monto: 1000,
  ipcMensual: new Map([['2020-01', 100], ['2020-02', 150], ['2020-03', 200]]),
  dolarMensual: new Map([['2020-01', 10], ['2020-02', 20], ['2020-03', 30]]),
  tasasDiarias: [{ fecha: '2020-01-02', valor: 36.5 }],
});

test('caso A: factor, tres opciones y evolución', () => {
  const r = simular(casoA());
  cerca(r.factorInflacion, 2, 'factor');

  cerca(r.opciones.pesosQuietos.valorFinalNominal, 1000, 'quietos nominal');
  cerca(r.opciones.pesosQuietos.valorReal, 500, 'quietos real');
  cerca(r.opciones.pesosQuietos.resultadoRealPct, -50, 'quietos %');

  cerca(r.opciones.dolar.valorFinalNominal, 3000, 'dólar nominal');
  cerca(r.opciones.dolar.valorReal, 1500, 'dólar real');
  cerca(r.opciones.dolar.resultadoRealPct, 50, 'dólar %');

  cerca(r.opciones.plazoFijo.valorFinalNominal, 1060.9, 'plazo fijo nominal');
  cerca(r.opciones.plazoFijo.valorReal, 530.45, 'plazo fijo real');
  cerca(r.opciones.plazoFijo.resultadoRealPct, -46.955, 'plazo fijo %');

  const evolucion = r.evolucion.map((e) => ({
    mes: e.mes, plazoFijo: redondear(e.plazoFijo), dolar: redondear(e.dolar), pesosQuietos: redondear(e.pesosQuietos),
  }));
  assert.deepEqual(evolucion, [
    { mes: '2020-01', plazoFijo: 2000, dolar: 2000, pesosQuietos: 2000 },
    { mes: '2020-02', plazoFijo: 1373.33, dolar: 2666.67, pesosQuietos: 1333.33 },
    { mes: '2020-03', plazoFijo: 1060.9, dolar: 3000, pesosQuietos: 1000 },
  ]);
});

test('caso A: renovaciones', () => {
  const { renovaciones } = simular(casoA());
  assert.equal(renovaciones.length, 3);
  assert.deepEqual(
    renovaciones.map(({ inicio, vencimiento, tna, cobrada }) => ({ inicio, vencimiento, tna, cobrada })),
    [
      { inicio: '2020-01-02', vencimiento: '2020-02-01', tna: 36.5, cobrada: true },
      { inicio: '2020-02-01', vencimiento: '2020-03-02', tna: 36.5, cobrada: true },
      { inicio: '2020-03-02', vencimiento: '2020-04-01', tna: 36.5, cobrada: false },
    ],
  );
  cerca(renovaciones[0].capitalInicial, 1000, 'capital inicial tramo 1');
  cerca(renovaciones[0].capitalFinal, 1030, 'capital final tramo 1');
  cerca(renovaciones[2].capitalFinal, 1060.9, 'el tramo no cobrado no suma intereses');
});

// Caso B: igual que A, con una tasa de 73 % el 2020-01-31. El 2020-02-01 no hay tasa:
// el tramo 2 usa la última publicada (73 % -> 73/100 x 30/365 = 0,06).
// 1000 x 1,03 x 1,06 = 1091,8.
test('caso B: un día sin tasa usa la última publicada', () => {
  const entrada = casoA();
  entrada.tasasDiarias = [{ fecha: '2020-01-02', valor: 36.5 }, { fecha: '2020-01-31', valor: 73 }];
  cerca(simular(entrada).opciones.plazoFijo.valorFinalNominal, 1091.8, 'plazo fijo nominal');
});

test('el plazo fijo arranca en la primera fecha con tasa del mes inicial', () => {
  const entrada = casoA();
  entrada.tasasDiarias = [{ fecha: '2020-01-06', valor: 36.5 }];
  assert.equal(simular(entrada).renovaciones[0].inicio, '2020-01-06');
});

test('una tasa anterior al mes inicial no adelanta el arranque', () => {
  const entrada = casoA();
  entrada.tasasDiarias = [{ fecha: '2019-12-30', valor: 10 }, { fecha: '2020-01-03', valor: 36.5 }];
  const { renovaciones } = simular(entrada);
  assert.equal(renovaciones[0].inicio, '2020-01-03');
  assert.equal(renovaciones[0].tna, 36.5);
});

function fallaCon(codigo, cambiar) {
  const entrada = casoA();
  cambiar(entrada);
  assert.throws(() => simular(entrada), (err) => err instanceof ErrorSimulacion && err.codigo === codigo);
}

test('desde igual a hasta da PERIODO_INVALIDO', () => fallaCon('PERIODO_INVALIDO', (e) => { e.hasta = '2020-01'; }));
test('hasta anterior a desde da PERIODO_INVALIDO', () => fallaCon('PERIODO_INVALIDO', (e) => { e.desde = '2020-03'; e.hasta = '2020-01'; }));
test('un mes mal escrito da PERIODO_INVALIDO', () => fallaCon('PERIODO_INVALIDO', (e) => { e.desde = '2020-13'; }));
test('monto 0 da MONTO_INVALIDO', () => fallaCon('MONTO_INVALIDO', (e) => { e.monto = 0; }));
test('monto no numérico da MONTO_INVALIDO', () => fallaCon('MONTO_INVALIDO', (e) => { e.monto = NaN; }));
test('falta el IPC del mes final da FALTA_IPC', () => fallaCon('FALTA_IPC', (e) => { e.ipcMensual.delete('2020-03'); }));
test('falta el IPC de un mes intermedio da FALTA_IPC', () => fallaCon('FALTA_IPC', (e) => { e.ipcMensual.delete('2020-02'); }));
test('falta el dólar del mes inicial da FALTA_DOLAR', () => fallaCon('FALTA_DOLAR', (e) => { e.dolarMensual.delete('2020-01'); }));
test('mes inicial sin tasas da SIN_TASA', () =>
  fallaCon('SIN_TASA', (e) => { e.tasasDiarias = [{ fecha: '2020-02-03', valor: 36.5 }]; }));
