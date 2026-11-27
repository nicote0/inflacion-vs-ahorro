import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appDePrueba } from './fixtures.js';

const cerca = (real, esperado, msg) =>
  assert.ok(Math.abs(real - esperado) <= 1e-9 * Math.max(1, Math.abs(esperado)), `${msg}: ${real} != ${esperado}`);
const pedir = async (url) => (await appDePrueba()).inject(url);

// Mismo caso A que simulacion/test/simular.test.js (cuentas a mano allí).
test('simula el caso A', async () => {
  const r = await pedir('/simulacion?desde=2020-01&hasta=2020-03&monto=1000');
  assert.equal(r.statusCode, 200);
  const s = r.json();
  cerca(s.factorInflacion, 2, 'factor');
  cerca(s.opciones.plazoFijo.valorFinalNominal, 1060.9, 'plazo fijo');
  assert.equal(s.opciones.plazoFijo.leGanoALaInflacion, false);
  cerca(s.opciones.dolar.valorFinalNominal, 3000, 'dólar');
  cerca(s.opciones.dolar.resultadoRealPct, 50, 'dólar %');
  assert.equal(s.opciones.dolar.leGanoALaInflacion, true);
  cerca(s.opciones.pesosQuietos.valorReal, 500, 'quietos real');
  assert.equal(s.evolucion.length, 3);
  assert.deepEqual(Object.keys(s.evolucion[0]).sort(), ['dolar', 'mes', 'pesosQuietos', 'plazoFijo']);
  assert.equal(s.renovaciones, undefined);
});

test('informa datosHasta y rango', async () => {
  const s = (await pedir('/simulacion?desde=2020-01&hasta=2020-03&monto=1000')).json();
  assert.deepEqual(s.datosHasta, { ipc: '2020-03-01', dolar: '2020-03-02', tasa: '2020-01-02' });
  assert.deepEqual(s.rango, { mesMinimo: '2019-12', mesMaximo: '2020-03' });
});

test('hasta posterior al último IPC da PERIODO_FUERA_DE_RANGO con el rango en el mensaje', async () => {
  const r = await pedir('/simulacion?desde=2020-01&hasta=2020-04&monto=1000');
  assert.equal(r.statusCode, 400);
  assert.equal(r.json().error.codigo, 'PERIODO_FUERA_DE_RANGO');
  assert.match(r.json().error.mensaje, /2020-03/);
});

test('un mes sin datos de dólar o tasa da PERIODO_FUERA_DE_RANGO', async () => {
  const r = await pedir('/simulacion?desde=2019-12&hasta=2020-02&monto=1000');
  assert.equal(r.statusCode, 400);
  assert.equal(r.json().error.codigo, 'PERIODO_FUERA_DE_RANGO');
});

test('errores de monto y período', async () => {
  const casos = [
    ['/simulacion?desde=2020-01&hasta=2020-03&monto=0', 'MONTO_INVALIDO'],
    ['/simulacion?desde=2020-01&hasta=2020-03&monto=-5', 'MONTO_INVALIDO'],
    ['/simulacion?desde=2020-01&hasta=2020-03&monto=abc', 'MONTO_INVALIDO'],
    ['/simulacion?desde=2020-01&hasta=2020-03&monto=2e12', 'MONTO_INVALIDO'],
    ['/simulacion?desde=2020-01&hasta=2020-03', 'MONTO_INVALIDO'],
    ['/simulacion?desde=2020-02&hasta=2020-02&monto=1', 'PERIODO_INVALIDO'],
    ['/simulacion?desde=2020-03&hasta=2020-01&monto=1', 'PERIODO_INVALIDO'],
    ['/simulacion?desde=2020-13&hasta=2020-03&monto=1', 'PERIODO_INVALIDO'],
    ['/simulacion?hasta=2020-03&monto=1', 'PERIODO_INVALIDO'],
  ];
  for (const [url, codigo] of casos) {
    const r = await pedir(url);
    assert.equal(r.statusCode, 400, url);
    assert.equal(r.json().error.codigo, codigo, url);
  }
});
