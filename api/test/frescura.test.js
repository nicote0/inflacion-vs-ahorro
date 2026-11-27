import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appDePrueba } from './fixtures.js';
import { mesesDeAtraso } from '../src/rutas/frescura.js';

test('mesesDeAtraso cuenta meses calendario entre la observación y el chequeo', () => {
  assert.equal(mesesDeAtraso('2026-10-01', '2026-11-26'), 1); // IPC de octubre chequeado en noviembre
  assert.equal(mesesDeAtraso('2026-11-25', '2026-11-26'), 0); // dólar de ayer
  assert.equal(mesesDeAtraso('2025-12-01', '2026-02-10'), 2); // cruza el año
  assert.equal(mesesDeAtraso(null, '2026-02-10'), null);
  assert.equal(mesesDeAtraso('2025-12-01', null), null);
});

test('/frescura lista todas las fuentes, también las no verificadas', async () => {
  const r = await (await appDePrueba()).inject('/frescura');
  assert.equal(r.statusCode, 200);
  const fuentes = r.json().fuentes;
  assert.deepEqual(fuentes.map((f) => f.id), ['ipc_nacional', 'dolar_minorista', 'tasa_plazo_fijo_30d']);

  const [ipc, , tasa] = fuentes;
  assert.deepEqual(ipc, {
    id: 'ipc_nacional', nombre: 'IPC nacional', estado: 'vigente',
    ultimaObservacion: '2020-03-01', ultimaFechaDeclarada: '2020-03-01', fechaChequeo: '2020-04-20',
    diasDesdeFinDelPeriodo: 20, mesesDeAtraso: 1,
  });
  assert.deepEqual(tasa, {
    id: 'tasa_plazo_fijo_30d', nombre: 'Tasa a 30 días', estado: 'sin_verificar',
    ultimaObservacion: null, ultimaFechaDeclarada: null, fechaChequeo: null,
    diasDesdeFinDelPeriodo: null, mesesDeAtraso: null,
  });
});
