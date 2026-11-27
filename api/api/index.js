// Función de Vercel: el rewrite de vercel.json manda todo /api/* acá y la app Fastify de M3 lo atiende.
import { crearApp } from '../src/app.js';
import { crearManejador } from '../src/vercel.js';

export default crearManejador({ crearAppFn: crearApp });
