import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exigirBaseDeTest } from '../test-db/ayuda.js';

test('rechaza una URL de tests cuya base no termina en _test', () => {
  assert.throws(() => exigirBaseDeTest('postgres://u:p@ep-algo.neon.tech/neondb?sslmode=verify-full'), /_test/);
  assert.throws(() => exigirBaseDeTest('postgres://u:p@localhost:5432/inflacion'), /_test/);
});

test('acepta una base de tests', () => {
  assert.doesNotThrow(() => exigirBaseDeTest('postgres://u:p@localhost:5432/inflacion_test'));
});
