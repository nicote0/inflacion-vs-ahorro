// Conexión a Postgres. La URL sale solo del entorno, nunca del código.
import pg from 'pg';

export function leerUrl(nombre = 'DATABASE_URL', entorno = process.env) {
  const url = entorno[nombre]?.trim();
  if (!url) {
    throw new Error(`Falta la variable de entorno ${nombre}. Copiá .env.example a .env y completala.`);
  }
  return url;
}

// Neon suspende la base sin uso y tarda unos segundos en despertar: timeout generoso.
export const crearCliente = (url) => new pg.Client({ connectionString: url, connectionTimeoutMillis: 15000 });
