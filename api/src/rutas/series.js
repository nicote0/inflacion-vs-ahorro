import { ErrorApi } from '../errores.js';
import { ERROR, FECHA, exigirRangoOrdenado, indicadorPorId, serieDe } from '../foto.js';

export default async function rutasSeries(app) {
  app.get('/series/:indicador', {
    schema: {
      summary: 'Serie de un indicador, ordenada por fecha. Las series mensuales usan el primer día del mes',
      params: { type: 'object', properties: { indicador: { type: 'string' } }, required: ['indicador'] },
      querystring: {
        type: 'object', additionalProperties: false,
        properties: { desde: { ...FECHA, description: 'Desde (inclusive)' }, hasta: { ...FECHA, description: 'Hasta (inclusive)' } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            indicador: { type: 'object', properties: { id: { type: 'string' }, nombre: { type: 'string' }, unidad: { type: 'string' }, periodicidad: { type: 'string' } } },
            datos: { type: 'array', items: { type: 'object', properties: { fecha: { type: 'string' }, valor: { type: 'number' } } } },
          },
        },
        400: ERROR, 404: ERROR,
      },
    },
  }, async (req) => {
    const { desde, hasta } = req.query;
    exigirRangoOrdenado(desde, hasta);
    const foto = await req.server.obtenerFoto();
    const indicador = indicadorPorId(foto, req.params.indicador);
    if (!indicador) {
      throw new ErrorApi(404, 'INDICADOR_DESCONOCIDO', `No existe el indicador "${req.params.indicador}". Ver /indicadores.`);
    }
    const datos = serieDe(foto, indicador).filter((d) => (!desde || d.fecha >= desde) && (!hasta || d.fecha <= hasta));
    const { id, nombre, unidad, periodicidad } = indicador;
    return { indicador: { id, nombre, unidad, periodicidad }, datos };
  });
}
