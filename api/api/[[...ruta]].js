// Función de Vercel: todo /api/* llega acá y lo atiende la app Fastify de M3.
import { crearApp } from '../src/app.js';
import { crearManejador } from '../src/vercel.js';

export default crearManejador({ crearAppFn: crearApp });
