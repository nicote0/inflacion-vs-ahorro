// GET /simulacion: ¿qué le ganó a la inflación? Usa el cálculo del paquete simulacion (M2), sin duplicarlo.
import { ErrorSimulacion, simular } from 'simulacion';
import { ErrorApi } from '../errores.js';
import { ERROR, MES, indicadorPorId } from '../foto.js';

const IDS = { ipc: 'ipc_nacional', dolar: 'dolar_minorista', tasa: 'tasa_plazo_fijo_30d' };
const MONTO_MAXIMO = 1e12;
const FUERA_DE_RANGO = new Set(['FALTA_IPC', 'FALTA_DOLAR', 'SIN_TASA']);

const OPCION = {
  type: 'object',
  properties: {
    valorFinalNominal: { type: 'number' }, valorReal: { type: 'number' },
    resultadoRealPct: { type: 'number' }, leGanoALaInflacion: { type: 'boolean' },
  },
};

function insumosDe(foto) {
  const mensual = (id) => new Map((foto.mensuales.get(id) ?? []).map((p) => [p.mes, p.valor]));
  return {
    ipcMensual: mensual(IDS.ipc),
    dolarMensual: mensual(IDS.dolar),
    tasasDiarias: foto.diarias.get(IDS.tasa) ?? [],
  };
}

function rangoDe(foto) {
  const meses = (foto.mensuales.get(IDS.ipc) ?? []).map((p) => p.mes);
  return { mesMinimo: meses[0] ?? null, mesMaximo: meses.at(-1) ?? null };
}

const fueraDeRango = (rango, detalle) => new ErrorApi(400, 'PERIODO_FUERA_DE_RANGO',
  `${detalle} El período tiene que estar entre ${rango.mesMinimo} y ${rango.mesMaximo}.`);

export default async function rutasSimulacion(app) {
  app.get('/simulacion', {
    config: { codigosDeValidacion: { desde: 'PERIODO_INVALIDO', hasta: 'PERIODO_INVALIDO', monto: 'MONTO_INVALIDO' } },
    schema: {
      summary: '¿Qué le ganó a la inflación? Plazo fijo renovado cada 30 días, dólar oficial y pesos quietos',
      querystring: {
        type: 'object', additionalProperties: false,
        required: ['desde', 'hasta', 'monto'],
        properties: {
          desde: { ...MES, description: 'Mes inicial AAAA-MM' },
          hasta: { ...MES, description: 'Mes final AAAA-MM (posterior al inicial)' },
          monto: { type: 'number', description: 'Monto en pesos, mayor que 0 y hasta 1e12' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            factorInflacion: { type: 'number' },
            opciones: { type: 'object', properties: { plazoFijo: OPCION, dolar: OPCION, pesosQuietos: OPCION } },
            evolucion: {
              type: 'array',
              description: 'Valor de cada opción a fin de cada mes, en pesos del mes final',
              items: {
                type: 'object',
                properties: { mes: { type: 'string' }, plazoFijo: { type: 'number' }, dolar: { type: 'number' }, pesosQuietos: { type: 'number' } },
              },
            },
            datosHasta: { type: 'object', properties: { ipc: { type: 'string' }, dolar: { type: 'string' }, tasa: { type: 'string' } } },
            rango: { type: 'object', properties: { mesMinimo: { type: 'string' }, mesMaximo: { type: 'string' } } },
          },
        },
        400: ERROR,
      },
    },
  }, async (req) => {
    const { desde, hasta, monto } = req.query;
    if (!(monto > 0 && monto <= MONTO_MAXIMO)) {
      throw new ErrorApi(400, 'MONTO_INVALIDO', 'El monto tiene que ser un número mayor que 0 y no mayor que 1e12.');
    }
    if (hasta <= desde) {
      throw new ErrorApi(400, 'PERIODO_INVALIDO', 'El mes final tiene que ser posterior al inicial.');
    }

    const foto = await req.server.obtenerFoto();
    const rango = rangoDe(foto);
    if (!rango.mesMinimo || desde < rango.mesMinimo || hasta > rango.mesMaximo) {
      throw fueraDeRango(rango, 'No hay IPC publicado para todo el período pedido.');
    }

    let resultado;
    try {
      resultado = simular({ desde, hasta, monto, ...insumosDe(foto) });
    } catch (err) {
      if (err instanceof ErrorSimulacion && FUERA_DE_RANGO.has(err.codigo)) throw fueraDeRango(rango, err.message + '.');
      if (err instanceof ErrorSimulacion) throw new ErrorApi(400, err.codigo, err.message);
      throw err;
    }

    const opciones = Object.fromEntries(Object.entries(resultado.opciones)
      .map(([clave, o]) => [clave, { ...o, leGanoALaInflacion: o.resultadoRealPct > 0 }]));
    const hastaDe = (id) => indicadorPorId(foto, id)?.hasta ?? null;
    return {
      factorInflacion: resultado.factorInflacion,
      opciones,
      evolucion: resultado.evolucion,
      datosHasta: { ipc: hastaDe(IDS.ipc), dolar: hastaDe(IDS.dolar), tasa: hastaDe(IDS.tasa) },
      rango,
    };
  });
}
