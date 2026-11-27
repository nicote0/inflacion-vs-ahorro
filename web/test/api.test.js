import { expect, test } from 'vitest';
import { ErrorApi, crearApi } from '../src/api.js';

const BASE = 'http://api.test';

function fetchFalso(respuesta = { status: 200, cuerpo: {} }) {
  const urls = [];
  const fetch = async (url) => {
    urls.push(url);
    if (respuesta === 'red') throw new TypeError('Failed to fetch');
    return { ok: respuesta.status < 300, status: respuesta.status, json: async () => respuesta.cuerpo };
  };
  return { fetch, urls };
}

test('simulacion arma la URL con la consulta', async () => {
  const f = fetchFalso();
  await crearApi({ base: BASE, fetch: f.fetch }).simulacion({ desde: '2020-01', hasta: '2025-01', monto: 100000 });
  expect(f.urls).toEqual([`${BASE}/simulacion?desde=2020-01&hasta=2025-01&monto=100000`]);
});

test('serie sin filtros no agrega parámetros', async () => {
  const f = fetchFalso();
  await crearApi({ base: BASE, fetch: f.fetch }).serie('ipc_nacional', {});
  expect(f.urls).toEqual([`${BASE}/series/ipc_nacional`]);
});

test('un error de la API se convierte en ErrorApi con código, mensaje y status', async () => {
  const f = fetchFalso({ status: 400, cuerpo: { error: { codigo: 'MONTO_INVALIDO', mensaje: 'x' } } });
  const api = crearApi({ base: BASE, fetch: f.fetch });
  await expect(api.simulacion({ desde: '2020-01', hasta: '2025-01', monto: 0 }))
    .rejects.toMatchObject({ name: 'ErrorApi', codigo: 'MONTO_INVALIDO', message: 'x', status: 400 });
});

test('una falla de red da SIN_CONEXION', async () => {
  const api = crearApi({ base: BASE, fetch: fetchFalso('red').fetch });
  const err = await api.frescura().catch((e) => e);
  expect(err).toBeInstanceOf(ErrorApi);
  expect(err).toMatchObject({ codigo: 'SIN_CONEXION', message: 'No se pudo conectar con la API.', status: 0 });
});
