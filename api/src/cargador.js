// Foto de los datos en memoria, para no consultar la base en cada pedido (protege el plan gratuito de Neon).
// - Se relee después de ttlMs (1 hora).
// - Los pedidos simultáneos comparten una sola lectura en curso.
// - Si la lectura falla y hay una foto anterior, se sigue usando y se reintenta pasado reintentoMs (1 minuto).
// - Si falla y no hay foto, 503 DATOS_NO_DISPONIBLES.
import { ErrorApi } from './errores.js';

export function crearCargadorDeFoto({ leerFoto, ahora = Date.now, ttlMs = 3600000, reintentoMs = 60000, alFallar = () => {} }) {
  let foto = null;
  let proximaLectura = 0;
  let enCurso = null;

  async function leer() {
    try {
      foto = await leerFoto();
      proximaLectura = ahora() + ttlMs;
    } catch (err) {
      alFallar(err);
      proximaLectura = ahora() + reintentoMs;
      if (!foto) {
        throw new ErrorApi(503, 'DATOS_NO_DISPONIBLES', 'Los datos no están disponibles en este momento. Probá de nuevo en unos minutos.');
      }
    } finally {
      enCurso = null;
    }
    return foto;
  }

  return async function obtenerFoto() {
    if (foto && ahora() < proximaLectura) return foto;
    if (!foto && ahora() < proximaLectura) {
      throw new ErrorApi(503, 'DATOS_NO_DISPONIBLES', 'Los datos no están disponibles en este momento. Probá de nuevo en unos minutos.');
    }
    enCurso ??= leer();
    return enCurso;
  };
}
