import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ejecutarIngesta } from '../src/ingesta.js';
import { guardarCrudo } from '../src/almacen.js';

const fuente = (id) => ({ id, nombre: id, tipo: 'falso', desde: '2016-12-01', periodicidad: 'diaria', toleranciaDias: 5 });
const AHORA = new Date('2026-11-26T15:00:00Z');

// Adaptador falso: el contenido es una lista de fechas separadas por coma.
const adaptadorFalso = ({ falla = false, contenido = '2026-11-24,2026-11-25', parseoInvalido = false } = {}) => ({
  descargar: async () => {
    if (falla) throw new Error('timeout');
    return { contenido, extension: 'txt' };
  },
  parsear: (texto) => {
    if (parseoInvalido) throw new Error('Formato inesperado');
    return { observaciones: texto.split(',').map((fecha) => ({ fecha, valor: 1 })), descartadas: 0 };
  },
  declarado: async () => ({ ultimaFecha: '2026-11-25', detalle: {} }),
});

async function conDirTemporal(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'ingesta-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('una fuente caída no frena a las demás', () =>
  conDirTemporal(async (dir) => {
    const adaptadores = { a: adaptadorFalso(), b: adaptadorFalso({ falla: true }), c: adaptadorFalso() };
    const r = await ejecutarIngesta({
      fuentes: [fuente('a'), fuente('b'), fuente('c')], dirBase: dir, fetch: null, ahora: AHORA,
      obtenerAdaptador: (f) => adaptadores[f.id],
    });

    assert.equal(r.ok, false);
    assert.deepEqual(r.resultados.map((x) => x.ok), [true, false, true]);
    assert.match(r.resultados[1].error, /timeout/);
    assert.equal(r.resultados[0].filas, 2);
    assert.equal(r.resultados[0].frescura.estado, 'vigente');
    assert.equal(r.resultados[0].frescura.ultimaObservacion, '2026-11-25');
    assert.equal(r.resultados[0].frescura.ultimaFechaDeclarada, '2026-11-25');
    assert.equal(r.resultados[0].frescura.fechaChequeo, '2026-11-26');
  }));

test('contenido inválido no se guarda', () =>
  conDirTemporal(async (dir) => {
    const r = await ejecutarIngesta({
      fuentes: [fuente('a')], dirBase: dir, fetch: null, ahora: AHORA,
      obtenerAdaptador: () => adaptadorFalso({ parseoInvalido: true }),
    });

    assert.equal(r.ok, false);
    assert.equal(r.resultados[0].archivo, null);
    await assert.rejects(readFile(path.join(dir, 'manifest.json'), 'utf8'), { code: 'ENOENT' });
  }));

test('fuente caída con copia previa calcula frescura con la copia', () =>
  conDirTemporal(async (dir) => {
    await guardarCrudo({ dirBase: dir, fuenteId: 'a', contenido: '2026-11-10,2026-11-13', extension: 'txt', ahora: AHORA });
    const r = await ejecutarIngesta({
      fuentes: [fuente('a')], dirBase: dir, fetch: null, ahora: AHORA,
      obtenerAdaptador: () => adaptadorFalso({ falla: true }),
    });

    assert.equal(r.resultados[0].ok, false);
    assert.equal(r.resultados[0].frescura.ultimaObservacion, '2026-11-13');
    assert.equal(r.resultados[0].frescura.estado, 'desactualizado');
  }));

test('segunda corrida sin cambios', () =>
  conDirTemporal(async (dir) => {
    const args = { fuentes: [fuente('a')], dirBase: dir, fetch: null, ahora: AHORA, obtenerAdaptador: () => adaptadorFalso() };
    await ejecutarIngesta(args);
    const r = await ejecutarIngesta(args);

    assert.equal(r.ok, true);
    assert.equal(r.resultados[0].sinCambios, true);
    assert.equal(r.resultados[0].frescura.estado, 'vigente');
  }));

test('si falla la fecha declarada la fuente sigue ok y se anota el error', () =>
  conDirTemporal(async (dir) => {
    const adaptador = { ...adaptadorFalso(), declarado: async () => { throw new Error('catálogo caído'); } };
    const r = await ejecutarIngesta({ fuentes: [fuente('a')], dirBase: dir, fetch: null, ahora: AHORA, obtenerAdaptador: () => adaptador });

    assert.equal(r.resultados[0].ok, true);
    assert.equal(r.resultados[0].frescura.ultimaFechaDeclarada, null);
    assert.match(r.resultados[0].error, /catálogo caído/);
  }));
