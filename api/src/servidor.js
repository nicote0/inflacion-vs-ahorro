// `npm run api`: levanta la API local. En M5, Vercel envuelve crearApp en una función.
import { crearApp } from './app.js';
import { leerFotoDeLaBase } from './base.js';
import { crearCargadorDeFoto } from './cargador.js';

// La API no usa advisory locks: puede ir por el pooler de Neon. Si no está, usa la URL directa (o la local).
const url = process.env.DATABASE_URL_POOLED?.trim() || process.env.DATABASE_URL?.trim();
if (!url) {
  console.error('Falta la variable de entorno DATABASE_URL_POOLED o DATABASE_URL. Copiá .env.example a .env y completala.');
  process.exit(1);
}

const origenesCors = (process.env.CORS_ORIGENES ?? '').split(',').map((o) => o.trim()).filter(Boolean);
let app;
const obtenerFoto = crearCargadorDeFoto({
  leerFoto: async () => {
    const inicio = Date.now();
    const foto = await leerFotoDeLaBase(url);
    app.log.info(`Foto de los datos cargada desde la base en ${Date.now() - inicio} ms`);
    return foto;
  },
  alFallar: (err) => app.log.error({ err: err.message }, 'No se pudo leer la foto de los datos'),
});

app = await crearApp({ obtenerFoto, origenesCors, logger: true });
await app.listen({ port: Number(process.env.PORT ?? 3000), host: '127.0.0.1' });
