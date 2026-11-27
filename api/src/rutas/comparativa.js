// GET /comparativa: dos o más indicadores alineados por mes.
// Por defecto compara la variación % mensual (inflación del mes contra suba del dólar del mes),
// porque comparar el nivel del IPC (un índice) con el precio del dólar no dice nada directo.
import { ErrorApi } from '../errores.js';
import { ERROR, MES, exigirRangoOrdenado, indicadorPorId } from '../foto.js';

function mesSiguiente(mes) {
  const [a, m] = mes.split('-').map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
}
function mesAnterior(mes) {
  const [a, m] = mes.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}
export function mesesEntre(desde, hasta) {
  const meses = [];
  for (let m = desde; m <= hasta; m = mesSiguiente(m)) meses.push(m);
  return meses;
}

const porMes = (serie) => new Map(serie.map((p) => [p.mes, p.valor]));

export const nivelMensual = (serie, meses) => {
  const valores = porMes(serie);
  return meses.map((m) => valores.get(m) ?? null);
};

// Variación % contra el mes anterior, aunque ese mes quede fuera del rango pedido.
// null si falta el mes o el anterior: no se rellena.
export function variacionMensual(serie, meses) {
  const valores = porMes(serie);
  return meses.map((m) => {
    const actual = valores.get(m);
    const previo = valores.get(mesAnterior(m));
    return actual == null || previo == null || previo === 0 ? null : (actual / previo - 1) * 100;
  });
}

export default async function rutasComparativa(app) {
  app.get('/comparativa', {
    schema: {
      summary: 'Indicadores alineados por mes: variación % mensual (por defecto) o nivel',
      querystring: {
        type: 'object', additionalProperties: false,
        required: ['indicadores', 'desde', 'hasta'],
        properties: {
          indicadores: { type: 'string', pattern: '^[a-z0-9_]+(,[a-z0-9_]+)+$', description: 'Dos o más ids separados por coma' },
          desde: MES,
          hasta: MES,
          medida: { type: 'string', enum: ['variacion_mensual', 'nivel'], default: 'variacion_mensual' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            medida: { type: 'string' },
            meses: { type: 'array', items: { type: 'string' } },
            series: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' }, nombre: { type: 'string' }, unidad: { type: 'string' },
                  valores: { type: 'array', items: { type: ['number', 'null'] } },
                },
              },
            },
            unidadesDistintas: { type: 'boolean' },
          },
        },
        400: ERROR,
      },
    },
  }, async (req) => {
    const { desde, hasta, medida } = req.query;
    exigirRangoOrdenado(desde, hasta);
    const foto = await req.server.obtenerFoto();
    const indicadores = req.query.indicadores.split(',').map((id) => {
      const indicador = indicadorPorId(foto, id);
      if (!indicador) throw new ErrorApi(400, 'INDICADOR_DESCONOCIDO', `No existe el indicador "${id}". Ver /indicadores.`);
      return indicador;
    });

    const meses = mesesEntre(desde, hasta);
    const calcular = medida === 'nivel' ? nivelMensual : variacionMensual;
    const series = indicadores.map((i) => ({
      id: i.id,
      nombre: i.nombre,
      unidad: medida === 'nivel' ? i.unidad : '%',
      valores: calcular(foto.mensuales.get(i.id) ?? [], meses),
    }));
    return { medida, meses, series, unidadesDistintas: new Set(series.map((s) => s.unidad)).size > 1 };
  });
}
