import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarMigraciones } from '../src/db/migrador.js';
import { conBaseDeTest } from './ayuda.js';

const existe = async (cliente, tabla) =>
  (await cliente.query('select to_regclass($1) is not null as existe', [tabla])).rows[0].existe;

test('aplica desde cero y crea las tablas', () =>
  conBaseDeTest(async (cliente) => {
    assert.deepEqual(await aplicarMigraciones(cliente), ['001']);
    for (const tabla of ['modelo.hecho_diario', 'modelo.hecho_mensual', 'control.ejecucion', 'control.fila_rechazada', 'staging.bcra_monetarias']) {
      assert.ok(await existe(cliente, tabla), `falta ${tabla}`);
    }
  }));

test('una segunda corrida no aplica nada', () =>
  conBaseDeTest(async (cliente) => {
    await aplicarMigraciones(cliente);
    assert.deepEqual(await aplicarMigraciones(cliente), []);
  }));

test('fecha_valida y valor_valido', () =>
  conBaseDeTest(async (cliente) => {
    await aplicarMigraciones(cliente);
    const { rows: [r] } = await cliente.query(`select
      staging.fecha_valida('2026-02-30') as f1, staging.fecha_valida('2026-02-28') as f2,
      staging.fecha_valida('28/02/2026') as f3,
      staging.valor_valido('') as v1, staging.valor_valido('1632.65') as v2,
      staging.valor_valido('abc') as v3, staging.valor_valido('1e-7') as v4`);
    assert.deepEqual(r, { f1: false, f2: true, f3: false, v1: false, v2: true, v3: false, v4: true });
  }));
