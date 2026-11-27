import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearCargadorDeFoto } from '../src/cargador.js';
import { ErrorApi } from '../src/errores.js';

const HORA = 3600000;
const MINUTO = 60000;

// Reloj y lector falsos: el lector cuenta lecturas y puede fallar o demorarse.
function preparar({ fallar = () => false, demora = 0 } = {}) {
  let ahora = 0;
  let lecturas = 0;
  const leerFoto = async () => {
    lecturas++;
    if (demora) await new Promise((r) => setTimeout(r, demora));
    if (fallar(lecturas)) throw new Error('Neon no responde');
    return { version: lecturas };
  };
  const obtenerFoto = crearCargadorDeFoto({ leerFoto, ahora: () => ahora });
  return {
    obtenerFoto,
    avanzar: (ms) => { ahora += ms; },
    lecturas: () => lecturas,
  };
}

test('no relee antes de 1 hora', async () => {
  const c = preparar();
  await c.obtenerFoto();
  c.avanzar(HORA - 1);
  assert.deepEqual(await c.obtenerFoto(), { version: 1 });
  assert.equal(c.lecturas(), 1);
});

test('relee después de 1 hora', async () => {
  const c = preparar();
  await c.obtenerFoto();
  c.avanzar(HORA);
  assert.deepEqual(await c.obtenerFoto(), { version: 2 });
});

test('pedidos simultáneos comparten una lectura', async () => {
  const c = preparar({ demora: 20 });
  const fotos = await Promise.all([c.obtenerFoto(), c.obtenerFoto(), c.obtenerFoto()]);
  assert.equal(c.lecturas(), 1);
  assert.ok(fotos.every((f) => f.version === 1));
});

test('si falla y hay foto anterior, devuelve la anterior y no reintenta antes de 1 minuto', async () => {
  const c = preparar({ fallar: (n) => n === 2 });
  await c.obtenerFoto();
  c.avanzar(HORA);
  assert.deepEqual(await c.obtenerFoto(), { version: 1 }, 'falla la lectura 2: sigue la foto 1');
  c.avanzar(MINUTO - 1);
  await c.obtenerFoto();
  assert.equal(c.lecturas(), 2, 'no reintenta antes de 1 minuto');
  c.avanzar(1);
  assert.deepEqual(await c.obtenerFoto(), { version: 3 }, 'pasado el minuto reintenta y la lectura 3 funciona');
});

test('si falla sin foto, lanza DATOS_NO_DISPONIBLES con status 503', async () => {
  const c = preparar({ fallar: () => true });
  await assert.rejects(c.obtenerFoto(), (err) => err instanceof ErrorApi && err.status === 503 && err.codigo === 'DATOS_NO_DISPONIBLES');
});
