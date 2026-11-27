// Ayuda para los tests de integración: base de tests limpia en cada test.
import { crearCliente, leerUrl } from '../src/db/conexion.js';

export async function conBaseDeTest(fn) {
  const cliente = crearCliente(leerUrl('TEST_DATABASE_URL'));
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
