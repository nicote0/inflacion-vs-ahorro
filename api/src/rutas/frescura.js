// GET /frescura: hasta cuándo llega cada fuente. Incluye las que nunca se verificaron, sin ocultarlas.

// Meses calendario entre el mes de la última observación y el mes del chequeo.
export function mesesDeAtraso(ultimaObservacion, fechaChequeo) {
  if (!ultimaObservacion || !fechaChequeo) return null;
  const meses = (fecha) => {
    const [a, m] = fecha.split('-').map(Number);
    return a * 12 + m;
  };
  return meses(fechaChequeo) - meses(ultimaObservacion);
}

const SIN_VERIFICAR = {
  estado: 'sin_verificar', ultimaObservacion: null, ultimaFechaDeclarada: null, fechaChequeo: null, diasDesdeFinDelPeriodo: null,
};
const TEXTO_O_NULL = { type: ['string', 'null'] };

export default async function rutasFrescura(app) {
  app.get('/frescura', {
    schema: {
      summary: 'Estado de frescura de cada fuente: último dato real, fecha declarada, último chequeo y atraso',
      response: {
        200: {
          type: 'object',
          properties: {
            fuentes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' }, nombre: { type: 'string' },
                  estado: { type: 'string', enum: ['vigente', 'desactualizado', 'sin_datos', 'sin_verificar'] },
                  ultimaObservacion: TEXTO_O_NULL, ultimaFechaDeclarada: TEXTO_O_NULL, fechaChequeo: TEXTO_O_NULL,
                  diasDesdeFinDelPeriodo: { type: ['integer', 'null'] }, mesesDeAtraso: { type: ['integer', 'null'] },
                },
              },
            },
          },
        },
      },
    },
  }, async (req) => {
    const foto = await req.server.obtenerFoto();
    const fuentes = foto.indicadores.map(({ id, nombre }) => {
      const f = foto.frescura.get(id) ?? SIN_VERIFICAR;
      return {
        id, nombre,
        estado: f.estado,
        ultimaObservacion: f.ultimaObservacion,
        ultimaFechaDeclarada: f.ultimaFechaDeclarada,
        fechaChequeo: f.fechaChequeo,
        diasDesdeFinDelPeriodo: f.diasDesdeFinDelPeriodo,
        mesesDeAtraso: mesesDeAtraso(f.ultimaObservacion, f.fechaChequeo),
      };
    });
    return { fuentes };
  });
}
