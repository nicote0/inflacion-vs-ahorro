import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerUrl } from '../src/db/conexion.js';

test('leerUrl falla con un mensaje que nombra la variable', () => {
  assert.throws(() => leerUrl('DATABASE_URL', {}), /Falta la variable de entorno DATABASE_URL/);
  assert.throws(() => leerUrl('TEST_DATABASE_URL', { TEST_DATABASE_URL: '  ' }), /TEST_DATABASE_URL/);
});

test('leerUrl devuelve la URL definida', () => {
  assert.equal(leerUrl('DATABASE_URL', { DATABASE_URL: 'postgres://u:p@h/db' }), 'postgres://u:p@h/db');
});
