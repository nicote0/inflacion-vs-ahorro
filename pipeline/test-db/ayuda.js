// Ayuda para los tests de integración: base de tests limpia en cada test.
import { crearCliente, leerUrl } from '../src/db/conexion.js';

// Los tests borran y recrean el esquema: se niegan a correr contra una base que no sea de tests.
export function exigirBaseDeTest(url) {
  const base = new URL(url).pathname.replace(/^\//, '');
  if (!base.endsWith('_test')) {
    throw new Error(`TEST_DATABASE_URL apunta a la base "${base}". Los tests borran datos: la base tiene que terminar en _test.`);
  }
  return url;
}

export async function conBaseDeTest(fn) {
  const cliente = crearCliente(exigirBaseDeTest(leerUrl('TEST_DATABASE_URL')));
  await cliente.connect();
  try {
    await cliente.query(`
      drop schema if exists staging cascade;
      drop schema if exists modelo cascade;
      drop schema if exists control cascade;
      drop table if exists public.schema_migrations;
    `);
    return await fn(cliente);
  } finally {
    await cliente.end();
  }
}
