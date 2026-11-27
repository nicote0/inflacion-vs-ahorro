import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { crearApp } from '../src/app.js';
import { crearManejador, quitarPrefijo } from '../src/vercel.js';
import { fotoDePrueba } from './fixtures.js';

test('quitarPrefijo saca /api y conserva la consulta', () => {
  assert.equal(quitarPrefijo('/api/simulacion?desde=2020-01&monto=1'), '/simulacion?desde=2020-01&monto=1');
  assert.equal(quitarPrefijo('/api'), '/');
  assert.equal(quitarPrefijo('/api/'), '/');
  assert.equal(quitarPrefijo('/api?x=1'), '/?x=1');
});

async function conServidor(manejador, fn) {
  const servidor = http.createServer(manejador);
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    return await fn(base);
  } finally {
    await new Promise((r) => servidor.close(r));
  }
}

test('el manejador sirve la API bajo /api', async () => {
  const foto = fotoDePrueba();
  const manejador = crearManejador({ crearAppFn: crearApp, obtenerFoto: async () => foto, entorno: {} });
  await conServidor(manejador, async (base) => {
    const r = await fetch(`${base}/api/indicadores`);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).indicadores.length, 3);
    const s = await fetch(`${base}/api/simulacion?desde=2020-01&hasta=2020-03&monto=1000`);
    assert.equal(s.status, 200);
  });
});

test('sin variables de base responde 503 con el formato común', async () => {
  const manejador = crearManejador({ crearAppFn: crearApp, entorno: {} });
  await conServidor(manejador, async (base) => {
    const r = await fetch(`${base}/api/indicadores`);
    assert.equal(r.status, 503);
    assert.equal((await r.json()).error.codigo, 'DATOS_NO_DISPONIBLES');
  });
});
