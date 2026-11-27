import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ejecutarPipeline, CLAVE_LOCK } from '../src/pipeline.js';
import { crearCliente, leerUrl } from '../src/db/conexion.js';
import { conBaseDeTest } from './ayuda.js';

const AHORA = new Date('2026-11-26T15:00:00Z');
const fuente = (id) => ({
  id, nombre: id, unidad: 'u', tipo: 'bcra_monetarias', variable: 1,
  desde: '2026-11-01', periodicidad: 'diaria', toleranciaDias: 5,
});

// Adaptador falso: el contenido es "fecha=valor;fecha=valor".
const adaptadorFalso = ({ contenido = '2026-11-24=10;2026-11-25=20', falla = false } = {}) => {
  const filasCrudas = (texto) => texto.split(';').map((par, i) => {
    const [fecha, valor] = par.split('=');
    return { fila: i + 1, fecha, valor };
  });
  return {
    descargar: async () => {
      if (falla) throw new Error('timeout');
      return { contenido, extension: 'txt' };
    },
    filasCrudas,
    parsear: (texto) => ({ observaciones: filasCrudas(texto).map(({ fecha, valor }) => ({ fecha, valor: Number(valor) })), descartadas: 0 }),
    declarado: async () => ({ ultimaFecha: '2026-11-25', detalle: {} }),
  };
};

async function conDir(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'pipeline-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const correr = (cliente, dirBase, fuentes, adaptadores) =>
  ejecutarPipeline({ fuentes, dirBase, fetch: null, ahora: AHORA, cliente, obtenerAdaptador: (f) => adaptadores[f.id] });

const filasDe = async (cliente, sql) => (await cliente.query(sql)).rows;

test('primera corrida carga y registra', () =>
  conBaseDeTest((cliente) => conDir(async (dir) => {
    const r = await correr(cliente, dir, [fuente('a'), fuente('b')], { a: adaptadorFalso(), b: adaptadorFalso() });
    assert.equal(r.ok, true);
    assert.deepEqual(r.resultados.map((x) => x.estado), ['ok', 'ok']);
    assert.deepEqual(await filasDe(cliente, 'select estado from control.ejecucion'), [{ estado: 'ok' }]);
    const porFuente = await filasDe(cliente, 'select fuente_id, estado, sha256 is not null as con_hash, filas_insertadas from control.ejecucion_fuente order by fuente_id');
    assert.deepEqual(porFuente, [
      { fuente_id: 'a', estado: 'ok', con_hash: true, filas_insertadas: 2 },
      { fuente_id: 'b', estado: 'ok', con_hash: true, filas_insertadas: 2 },
    ]);
    const frescura = await filasDe(cliente, `select fuente_id, to_char(ultima_observacion, 'YYYY-MM-DD') as ultima, estado from control.frescura order by 1`);
    assert.deepEqual(frescura, [
      { fuente_id: 'a', ultima: '2026-11-25', estado: 'vigente' },
      { fuente_id: 'b', ultima: '2026-11-25', estado: 'vigente' },
    ]);
  })));

test('segunda corrida con el mismo contenido queda sin_cambios', () =>
  conBaseDeTest((cliente) => conDir(async (dir) => {
    const adaptadores = { a: adaptadorFalso() };
    await correr(cliente, dir, [fuente('a')], adaptadores);
    const antes = await filasDe(cliente, 'select count(*) from modelo.hecho_diario');
    const r = await correr(cliente, dir, [fuente('a')], adaptadores);
    assert.equal(r.resultados[0].estado, 'sin_cambios');
    assert.deepEqual(await filasDe(cliente, 'select count(*) from modelo.hecho_diario'), antes);
  })));

test('el hash se compara contra la base y no contra el disco', () =>
  conBaseDeTest((cliente) => conDir((dir1) => conDir(async (dir2) => {
    const adaptadores = { a: adaptadorFalso() };
    await correr(cliente, dir1, [fuente('a')], adaptadores);
    const r = await correr(cliente, dir2, [fuente('a')], adaptadores);
    assert.equal(r.resultados[0].estado, 'sin_cambios');
  }))));

test('una fuente que falla queda registrada y las demás cargan', () =>
  conBaseDeTest((cliente) => conDir(async (dir) => {
    const r = await correr(cliente, dir, [fuente('a'), fuente('rota')], { a: adaptadorFalso(), rota: adaptadorFalso({ falla: true }) });
    assert.equal(r.ok, false);
    assert.deepEqual(await filasDe(cliente, 'select estado from control.ejecucion'), [{ estado: 'con_errores' }]);
    const porFuente = await filasDe(cliente, 'select fuente_id, estado, mensaje_error from control.ejecucion_fuente order by fuente_id');
    assert.deepEqual(porFuente, [
      { fuente_id: 'a', estado: 'ok', mensaje_error: null },
      { fuente_id: 'rota', estado: 'error', mensaje_error: 'timeout' },
    ]);
  })));

test('si fallan todas, la ejecución queda fallida', () =>
  conBaseDeTest((cliente) => conDir(async (dir) => {
    await correr(cliente, dir, [fuente('rota')], { rota: adaptadorFalso({ falla: true }) });
    assert.deepEqual(await filasDe(cliente, 'select estado from control.ejecucion'), [{ estado: 'fallida' }]);
  })));

test('frescura con la base cuando falla la descarga', () =>
  conBaseDeTest((cliente) => conDir((dir1) => conDir(async (dir2) => {
    await correr(cliente, dir1, [fuente('a')], { a: adaptadorFalso() });
    const r = await correr(cliente, dir2, [fuente('a')], { a: adaptadorFalso({ falla: true }) });
    assert.equal(r.resultados[0].estado, 'error');
    assert.equal(r.resultados[0].frescura.ultimaObservacion, '2026-11-25');
    const [fila] = await filasDe(cliente, `select to_char(ultima_observacion, 'YYYY-MM-DD') as ultima from control.frescura`);
    assert.equal(fila.ultima, '2026-11-25');
  }))));

test('una segunda conexión con el lock tomado no hace nada', () =>
  conBaseDeTest((cliente) => conDir(async (dir) => {
    const otro = crearCliente(leerUrl('TEST_DATABASE_URL'));
    await otro.connect();
    try {
      await otro.query('select pg_advisory_lock($1)', [CLAVE_LOCK]);
      const r = await correr(cliente, dir, [fuente('a')], { a: adaptadorFalso() });
      assert.deepEqual(r, { ok: false, bloqueado: true, ejecucionId: null, resultados: [] });
      assert.equal(await cliente.query('select to_regclass($1) as t', ['control.ejecucion']).then((x) => x.rows[0].t), null,
        'ni siquiera aplicó las migraciones');
    } finally {
      await otro.end();
    }
  })));
