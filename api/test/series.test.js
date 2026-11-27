import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appDePrueba } from './fixtures.js';

const pedir = async (url) => (await appDePrueba()).inject(url);

test('/series/dolar_minorista devuelve la serie ordenada', async () => {
  const r = await pedir('/series/dolar_minorista');
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json().indicador, { id: 'dolar_minorista', nombre: 'Dólar minorista', unidad: 'pesos por dólar', periodicidad: 'diaria' });
  assert.deepEqual(r.json().datos, [
    { fecha: '2020-01-02', valor: 10 }, { fecha: '2020-02-03', valor: 20 }, { fecha: '2020-03-02', valor: 30 },
  ]);
});

test('/series filtra por desde y hasta, inclusivos', async () => {
  const r = await pedir('/series/dolar_minorista?desde=2020-02-03&hasta=2020-03-02');
  assert.deepEqual(r.json().datos.map((d) => d.fecha), ['2020-02-03', '2020-03-02']);
});

test('/series/ipc_nacional usa el primer día del mes', async () => {
  const r = await pedir('/series/ipc_nacional');
  assert.deepEqual(r.json().datos[0], { fecha: '2019-12-01', valor: 90 });
  assert.equal(r.json().datos.length, 4);
});

test('indicador inexistente da 404', async () => {
  for (const id of ['no_existe', 'DOLAR_MINORISTA', 'dolar%20minorista']) {
    const r = await pedir(`/series/${id}`);
    assert.equal(r.statusCode, 404, id);
    assert.equal(r.json().error.codigo, 'INDICADOR_DESCONOCIDO');
  }
});

test('rango invertido da 400 RANGO_INVERTIDO', async () => {
  const r = await pedir('/series/dolar_minorista?desde=2020-03-01&hasta=2020-01-01');
  assert.equal(r.statusCode, 400);
  assert.equal(r.json().error.codigo, 'RANGO_INVERTIDO');
});

test('fecha mal escrita da 400 PARAMETRO_INVALIDO', async () => {
  const r = await pedir('/series/dolar_minorista?desde=2020-1-1');
  assert.equal(r.statusCode, 400);
  assert.equal(r.json().error.codigo, 'PARAMETRO_INVALIDO');
});
