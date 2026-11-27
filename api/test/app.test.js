import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appDePrueba } from './fixtures.js';
import { ErrorApi } from '../src/errores.js';

const CACHE_PUBLICA = 'public, s-maxage=3600, stale-while-revalidate=86400';

async function conRutasExtra() {
  return appDePrueba({
    origenesCors: ['https://front.example'],
    registrarRutasExtra(app) {
      app.get('/explota', async () => { throw new Error('postgres://u:clave@host/db'); });
      app.get('/caida', async () => { throw new ErrorApi(503, 'DATOS_NO_DISPONIBLES', 'x'); });
      app.get('/ok', async () => ({ ok: true }));
      app.get('/estricta', { schema: { querystring: { type: 'object', properties: { a: { type: 'string' } }, additionalProperties: false } } }, async () => ({ ok: true }));
      app.get('/monto', {
        config: { codigosDeValidacion: { monto: 'MONTO_INVALIDO' } },
        schema: { querystring: { type: 'object', properties: { monto: { type: 'number' } } } },
      }, async () => ({ ok: true }));
    },
  });
}

test('una ruta inexistente da 404 RUTA_INEXISTENTE con el formato común', async () => {
  const app = await conRutasExtra();
  const r = await app.inject('/no-existe');
  assert.equal(r.statusCode, 404);
  assert.equal(r.json().error.codigo, 'RUTA_INEXISTENTE');
  assert.equal(typeof r.json().error.mensaje, 'string');
  assert.equal(r.headers['cache-control'], 'no-store');
});

test('un error inesperado da 500 sin filtrar el mensaje', async () => {
  const app = await conRutasExtra();
  const r = await app.inject('/explota');
  assert.equal(r.statusCode, 500);
  assert.deepEqual(r.json(), { error: { codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error interno' } });
  assert.ok(!r.body.includes('clave'));
});

test('un ErrorApi usa su status y código', async () => {
  const app = await conRutasExtra();
  const r = await app.inject('/caida');
  assert.equal(r.statusCode, 503);
  assert.equal(r.json().error.codigo, 'DATOS_NO_DISPONIBLES');
});

test('un parámetro de más da 400 PARAMETRO_INVALIDO', async () => {
  const app = await conRutasExtra();
  const r = await app.inject('/estricta?b=1');
  assert.equal(r.statusCode, 400);
  assert.equal(r.json().error.codigo, 'PARAMETRO_INVALIDO');
  assert.match(r.json().error.mensaje, /b/);
});

test('un parámetro repetido da 400 PARAMETRO_INVALIDO', async () => {
  const app = await conRutasExtra();
  const r = await app.inject('/estricta?a=1&a=2');
  assert.equal(r.statusCode, 400);
  assert.equal(r.json().error.codigo, 'PARAMETRO_INVALIDO');
});

test('codigosDeValidacion cambia el código del 400', async () => {
  const app = await conRutasExtra();
  const r = await app.inject('/monto?monto=abc');
  assert.equal(r.statusCode, 400);
  assert.equal(r.json().error.codigo, 'MONTO_INVALIDO');
});

test('una respuesta exitosa lleva caché pública', async () => {
  const app = await conRutasExtra();
  const r = await app.inject('/ok');
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers['cache-control'], CACHE_PUBLICA);
});

test('CORS permite localhost y los orígenes configurados', async () => {
  const app = await conRutasExtra();
  for (const origin of ['http://localhost:5173', 'https://front.example']) {
    const r = await app.inject({ url: '/ok', headers: { origin } });
    assert.equal(r.headers['access-control-allow-origin'], origin);
  }
  const r = await app.inject({ url: '/ok', headers: { origin: 'https://otro.example' } });
  assert.equal(r.headers['access-control-allow-origin'], undefined);
});

test('/docs/json devuelve el documento OpenAPI', async () => {
  const app = await conRutasExtra();
  const r = await app.inject('/docs/json');
  assert.equal(r.statusCode, 200);
  assert.match(r.json().openapi, /^3\./);
});

test('una URL mal codificada da 400 con el formato común', async () => {
  const app = await conRutasExtra();
  const r = await app.inject('/series/%E0%A4%A');
  assert.equal(r.statusCode, 400);
  assert.equal(r.json().error.codigo, 'PARAMETRO_INVALIDO');
  assert.equal(r.headers['cache-control'], 'no-store');
});
