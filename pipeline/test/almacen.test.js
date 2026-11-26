import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { guardarCrudo, leerUltimoCrudo, sha256 } from '../src/almacen.js';

async function conDirTemporal(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'almacen-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const leerManifiesto = async (dir) => JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));

test('guarda la primera copia y la registra en el manifiesto', () =>
  conDirTemporal(async (dir) => {
    const contenido = 'indice_tiempo,valor\n2016-12-01,100.0\n';
    const r = await guardarCrudo({ dirBase: dir, fuenteId: 'ipc', contenido, extension: 'csv', ahora: new Date('2026-11-26T15:00:00Z') });

    assert.equal(r.sinCambios, false);
    assert.equal(r.sha256, sha256(contenido));
    assert.equal(await readFile(path.join(dir, r.archivo), 'utf8'), contenido);
    assert.match(r.archivo, /^ipc[\\/]2026-11-26T15-00-00Z_[0-9a-f]{12}\.csv$/);

    const m = await leerManifiesto(dir);
    assert.equal(m.ipc.length, 1);
    assert.equal(m.ipc[0].sha256, sha256(contenido));
    assert.equal(m.ipc[0].bytes, Buffer.byteLength(contenido));
  }));

test('no duplica si el contenido no cambió', () =>
  conDirTemporal(async (dir) => {
    const args = { dirBase: dir, fuenteId: 'ipc', contenido: 'a,b\n1,2\n', extension: 'csv' };
    await guardarCrudo({ ...args, ahora: new Date('2026-11-26T15:00:00Z') });
    const r2 = await guardarCrudo({ ...args, ahora: new Date('2026-11-27T15:00:00Z') });

    assert.equal(r2.sinCambios, true);
    assert.equal(r2.archivo, null);
    assert.equal((await leerManifiesto(dir)).ipc.length, 1);
    assert.equal((await readdir(path.join(dir, 'ipc'))).length, 1);
  }));

test('guarda una copia nueva si el contenido cambió', () =>
  conDirTemporal(async (dir) => {
    const base = { dirBase: dir, fuenteId: 'ipc', extension: 'csv' };
    await guardarCrudo({ ...base, contenido: 'v1', ahora: new Date('2026-11-26T15:00:00Z') });
    const r2 = await guardarCrudo({ ...base, contenido: 'v2', ahora: new Date('2026-11-27T15:00:00Z') });

    assert.equal(r2.sinCambios, false);
    assert.equal((await leerManifiesto(dir)).ipc.length, 2);
    assert.equal((await readdir(path.join(dir, 'ipc'))).length, 2);
  }));

test('leerUltimoCrudo devuelve la última copia o null si no hay ninguna', () =>
  conDirTemporal(async (dir) => {
    assert.equal(await leerUltimoCrudo({ dirBase: dir, fuenteId: 'ipc' }), null);

    const base = { dirBase: dir, fuenteId: 'ipc', extension: 'csv' };
    await guardarCrudo({ ...base, contenido: 'v1', ahora: new Date('2026-11-26T15:00:00Z') });
    const r2 = await guardarCrudo({ ...base, contenido: 'v2', ahora: new Date('2026-11-27T15:00:00Z') });

    const ultimo = await leerUltimoCrudo({ dirBase: dir, fuenteId: 'ipc' });
    assert.equal(ultimo.contenido, 'v2');
    assert.equal(ultimo.archivo, r2.archivo);
  }));
