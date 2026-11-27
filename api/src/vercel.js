// Adaptador para Vercel: una función recibe todo lo que empieza con /api y se lo pasa a Fastify.
// La app se arma una sola vez por instancia; la foto de los datos sigue en memoria entre pedidos.
import { leerFotoDeLaBase } from './base.js';
import { crearCargadorDeFoto } from './cargador.js';
import { ErrorApi } from './errores.js';

export function quitarPrefijo(url) {
  const sinPrefijo = url.replace(/^\/api(?=\/|\?|$)/, '');
  if (sinPrefijo === '' || sinPrefijo.startsWith('?')) return `/${sinPrefijo}`;
  return sinPrefijo;
}

function cargadorDesdeEntorno(entorno) {
  // La API no usa advisory locks: va por el pooler de Neon. Si falta, usa la URL directa.
  const url = entorno.DATABASE_URL_POOLED?.trim() || entorno.DATABASE_URL?.trim();
  if (!url) {
    return async () => {
      throw new ErrorApi(503, 'DATOS_NO_DISPONIBLES', 'Los datos no están disponibles en este momento. Probá de nuevo en unos minutos.');
    };
  }
  return crearCargadorDeFoto({ leerFoto: () => leerFotoDeLaBase(url) });
}

export function crearManejador({ crearAppFn, obtenerFoto, entorno = process.env }) {
  let appLista = null;
  const obtenerApp = () => {
    appLista ??= (async () => {
      const origenesCors = (entorno.CORS_ORIGENES ?? '').split(',').map((o) => o.trim()).filter(Boolean);
      const app = await crearAppFn({ obtenerFoto: obtenerFoto ?? cargadorDesdeEntorno(entorno), origenesCors });
      await app.ready();
      return app;
    })();
    return appLista;
  };

  return async function manejador(req, res) {
    const app = await obtenerApp();
    req.url = quitarPrefijo(req.url);
    app.server.emit('request', req, res);
  };
}
