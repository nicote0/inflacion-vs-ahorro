// Migraciones: aplica en orden los NNN_descripcion.sql pendientes, cada uno en su transacción.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR_MIGRACIONES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'migraciones');
const ARCHIVO = /^(\d{3})_[a-z0-9_]+\.sql$/;

export async function aplicarMigraciones(cliente, dir = DIR_MIGRACIONES) {
  await cliente.query(`create table if not exists public.schema_migrations (
    version text primary key,
    aplicada_en timestamptz not null default now()
  )`);
  const { rows } = await cliente.query('select version from public.schema_migrations');
  const aplicadas = new Set(rows.map((r) => r.version));

  const pendientes = (await readdir(dir))
    .map((archivo) => ({ archivo, version: ARCHIVO.exec(archivo)?.[1] }))
    .filter((m) => m.version && !aplicadas.has(m.version))
    .sort((a, b) => a.version.localeCompare(b.version));

  const nuevas = [];
  for (const { archivo, version } of pendientes) {
    const sql = await readFile(path.join(dir, archivo), 'utf8');
    await cliente.query('begin');
    try {
      await cliente.query(sql);
      await cliente.query('insert into public.schema_migrations (version) values ($1)', [version]);
      await cliente.query('commit');
    } catch (err) {
      await cliente.query('rollback');
      throw new Error(`Falló la migración ${archivo}: ${err.message}`);
    }
    nuevas.push(version);
  }
  return nuevas;
}
