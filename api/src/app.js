// Arma la app de Fastify sin escuchar en un puerto (la usan los tests, el servidor local y Vercel).
import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { manejarError, rutaInexistente } from './errores.js';
import rutasIndicadores from './rutas/indicadores.js';
import rutasSeries from './rutas/series.js';
import rutasComparativa from './rutas/comparativa.js';
import rutasFrescura from './rutas/frescura.js';

const CACHE_PUBLICA = 'public, s-maxage=3600, stale-while-revalidate=86400';
const LOCALHOST = /^http:\/\/localhost(:\d+)?$/;

export async function crearApp({ obtenerFoto, origenesCors = [], registrarRutasExtra, logger = false }) {
  const app = Fastify({
    logger,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: true } },
  });

  app.decorate('obtenerFoto', obtenerFoto);
  app.setErrorHandler(manejarError);
  app.setNotFoundHandler(rutaInexistente);

  // Los datos cambian una vez por día: las respuestas exitosas se cachean en el CDN.
  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('cache-control', reply.statusCode < 400 ? CACHE_PUBLICA : 'no-store');
    return payload;
  });

  await app.register(cors, {
    origin: (origen, cb) => cb(null, !origen || LOCALHOST.test(origen) || origenesCors.includes(origen)),
  });
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'inflacion-vs-ahorro API',
        description: '¿Qué le ganó a la inflación: un plazo fijo, el dólar oficial o dejar los pesos quietos? Datos oficiales del INDEC y del BCRA.',
        version: '1.0.0',
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  await app.register(rutasIndicadores);
  await app.register(rutasSeries);
  await app.register(rutasComparativa);
  await app.register(rutasFrescura);
  registrarRutasExtra?.(app);
  return app;
}
