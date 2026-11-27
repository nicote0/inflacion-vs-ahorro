import { INDICADOR } from '../foto.js';

export default async function rutasIndicadores(app) {
  app.get('/indicadores', {
    schema: {
      summary: 'Indicadores disponibles, con unidad, fuente, periodicidad y rango de fechas con datos',
      response: { 200: { type: 'object', properties: { indicadores: { type: 'array', items: INDICADOR } } } },
    },
  }, async (req) => {
    const foto = await req.server.obtenerFoto();
    return { indicadores: foto.indicadores };
  });
}
