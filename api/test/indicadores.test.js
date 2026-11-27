import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appDePrueba, fotoDePrueba } from './fixtures.js';

test('/indicadores lista los tres con su rango', async () => {
  const app = await appDePrueba();
  const r = await app.inject('/indicadores');
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json(), { indicadores: fotoDePrueba().indicadores });
});
