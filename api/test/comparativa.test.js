import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appDePrueba, fotoDePrueba } from './fixtures.js';
import { variacionMensual } from '../src/rutas/comparativa.js';

const cerca = (real, esperado) =>
  assert.ok(Math.abs(real - esperado) <= 1e-9 * Math.max(1, Math.abs(esperado)), `${real} != ${esperado}`);
const pedir = async (url) => (await appDePrueba()).inject(url);
const MESES = ['2020-01', '2020-02', '2020-03'];

// IPC 90 -> 100 -> 150 -> 200:
// enero   = 100/90  - 1 = 11,111...%
// febrero = 150/100 - 1 = 50%
// marzo   = 200/150 - 1 = 33,333...%
test('variación mensual del IPC', () => {
  const v = variacionMensual(fotoDePrueba().mensuales.get('ipc_nacional'), MESES);
  cerca(v[0], (100 / 90 - 1) * 100);
  cerca(v[1], 50);
  cerca(v[2], (200 / 150 - 1) * 100);
});

test('un mes sin el anterior da null', () => {
  const v = variacionMensual(fotoDePrueba().mensuales.get('dolar_minorista'), MESES);
  assert.equal(v[0], null);
  cerca(v[1], 100);
  cerca(v[2], 50);
});

test('/comparativa alinea por mes y avisa unidades distintas con medida=nivel', async () => {
  const r = await pedir('/comparativa?indicadores=ipc_nacional,dolar_minorista&desde=2020-01&hasta=2020-03&medida=nivel');
  assert.equal(r.statusCode, 200);
  const cuerpo = r.json();
  assert.equal(cuerpo.medida, 'nivel');
  assert.deepEqual(cuerpo.meses, MESES);
  assert.deepEqual(cuerpo.series.map((s) => [s.id, s.unidad, s.valores]), [
    ['ipc_nacional', 'índice (dic 2016 = 100)', [100, 150, 200]],
    ['dolar_minorista', 'pesos por dólar', [10, 20, 30]],
  ]);
  assert.equal(cuerpo.unidadesDistintas, true);
});

test('con variacion_mensual todas las unidades son %', async () => {
  const r = await pedir('/comparativa?indicadores=ipc_nacional,dolar_minorista&desde=2020-01&hasta=2020-03');
  const cuerpo = r.json();
  assert.equal(cuerpo.medida, 'variacion_mensual');
  assert.deepEqual(cuerpo.series.map((s) => s.unidad), ['%', '%']);
  assert.equal(cuerpo.unidadesDistintas, false);
  assert.equal(cuerpo.series[1].valores[0], null);
});

test('un mes sin dato es null', async () => {
  const r = await pedir('/comparativa?indicadores=ipc_nacional,tasa_plazo_fijo_30d&desde=2020-01&hasta=2020-03&medida=nivel');
  assert.deepEqual(r.json().series[1].valores, [36.5, null, null]);
});

test('errores de /comparativa', async () => {
  const casos = [
    ['/comparativa?indicadores=ipc_nacional&desde=2020-01&hasta=2020-03', 'PARAMETRO_INVALIDO'],
    ['/comparativa?indicadores=ipc_nacional,no_existe&desde=2020-01&hasta=2020-03', 'INDICADOR_DESCONOCIDO'],
    ['/comparativa?indicadores=ipc_nacional,dolar_minorista&desde=2020-01&hasta=2020-03&medida=otra', 'PARAMETRO_INVALIDO'],
    ['/comparativa?indicadores=ipc_nacional,dolar_minorista&desde=2020-03&hasta=2020-01', 'RANGO_INVERTIDO'],
    ['/comparativa?indicadores=ipc_nacional,dolar_minorista&desde=2020-13&hasta=2020-01', 'PARAMETRO_INVALIDO'],
  ];
  for (const [url, codigo] of casos) {
    const r = await pedir(url);
    assert.equal(r.statusCode, 400, url);
    assert.equal(r.json().error.codigo, codigo, url);
  }
});
