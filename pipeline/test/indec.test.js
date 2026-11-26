import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indec, urlDatos, urlMetadatos } from '../src/fuentes/indec.js';

const fuente = {
  id: 'ipc_nacional', tipo: 'indec_series', serie: '148.3_INIVELNAL_DICI_M_26',
  desde: '2016-12-01', periodicidad: 'mensual', toleranciaDias: 45,
};

const respuesta = (cuerpo, { ok = true, status = 200 } = {}) => async () => ({
  ok, status,
  text: async () => (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)),
  json: async () => (typeof cuerpo === 'string' ? JSON.parse(cuerpo) : cuerpo),
});

test('urlDatos arma la URL de la serie', () => {
  assert.equal(
    urlDatos(fuente),
    'https://apis.datos.gob.ar/series/api/series/?ids=148.3_INIVELNAL_DICI_M_26&format=csv&start_date=2016-12-01&limit=1000',
  );
  assert.equal(
    urlMetadatos(fuente),
    'https://apis.datos.gob.ar/series/api/series/?ids=148.3_INIVELNAL_DICI_M_26&limit=1&metadata=full',
  );
});

test('parsear lee el CSV real', () => {
  const r = indec.parsear('indice_tiempo,ipc_nivel_general_nacional\n2016-12-01,100.0\n2017-01-01,101.5859\n');
  assert.deepEqual(r.observaciones, [
    { fecha: '2016-12-01', valor: 100 },
    { fecha: '2017-01-01', valor: 101.5859 },
  ]);
  assert.equal(r.descartadas, 0);
});

test('parsear descarta valores vacíos sin inventarlos', () => {
  const r = indec.parsear('indice_tiempo,ipc_nivel_general_nacional\n2016-12-01,100.0\n2017-02-01,\n');
  assert.deepEqual(r.observaciones, [{ fecha: '2016-12-01', valor: 100 }]);
  assert.equal(r.descartadas, 1);
});

test('parsear rechaza contenido que no es el CSV esperado', () => {
  assert.throws(() => indec.parsear('<html>error</html>'), /indice_tiempo/);
});

test('parsear rechaza un CSV sin filas', () => {
  assert.throws(() => indec.parsear('indice_tiempo,ipc_nivel_general_nacional\n'), /sin observaciones/);
});

test('descargar lanza error si la respuesta no es 200', async () => {
  await assert.rejects(
    indec.descargar(fuente, { fetch: respuesta('Bad Gateway', { ok: false, status: 502 }) }),
    /502/,
  );
});

test('descargar lanza error si llegan 1000 filas (posible truncado)', async () => {
  const filas = Array.from({ length: 1000 }, (_, i) => `2000-01-${String((i % 28) + 1).padStart(2, '0')},${i}`);
  const csv = ['indice_tiempo,ipc_nivel_general_nacional', ...filas].join('\n') + '\n';
  await assert.rejects(indec.descargar(fuente, { fetch: respuesta(csv) }), /1000/);
});

test('descargar devuelve el CSV tal cual llega', async () => {
  const csv = 'indice_tiempo,ipc_nivel_general_nacional\n2016-12-01,100.0\n';
  assert.deepEqual(await indec.descargar(fuente, { fetch: respuesta(csv) }), { contenido: csv, extension: 'csv' });
});

test('declarado lee time_index_end', async () => {
  const cuerpo = { meta: [{}, { field: { time_index_end: '2026-10-01', is_updated: 'True' } }] };
  assert.deepEqual(await indec.declarado(fuente, { fetch: respuesta(cuerpo) }), {
    ultimaFecha: '2026-10-01',
    detalle: { isUpdated: true },
  });
});
