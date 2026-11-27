// La "foto" de los datos: todo lo que la API necesita, leído de la base y guardado en memoria.
//
// Foto = {
//   indicadores: [{ id, nombre, unidad, fuente, periodicidad: 'diaria'|'mensual', desde, hasta }],
//   diarias:   Map<id, [{ fecha: 'AAAA-MM-DD', valor }]>,                    // dólar y tasa, ascendente
//   mensuales: Map<id, [{ mes: 'AAAA-MM', valor, diasConDato: number|null }]>, // IPC y promedios, ascendente
//   frescura:  Map<id, { estado, ultimaObservacion, ultimaFechaDeclarada, fechaChequeo, diasDesdeFinDelPeriodo }>,
// }
import { ErrorApi } from './errores.js';

export const indicadorPorId = (foto, id) => foto.indicadores.find((i) => i.id === id);

export function serieDe(foto, indicador) {
  if (indicador.periodicidad === 'diaria') return foto.diarias.get(indicador.id) ?? [];
  return (foto.mensuales.get(indicador.id) ?? []).map(({ mes, valor }) => ({ fecha: `${mes}-01`, valor }));
}

export function exigirRangoOrdenado(desde, hasta) {
  if (desde && hasta && desde > hasta) {
    throw new ErrorApi(400, 'RANGO_INVERTIDO', `"desde" (${desde}) es posterior a "hasta" (${hasta}).`);
  }
}

// Schemas reutilizables para la documentación.
export const FECHA = { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$', description: 'Fecha AAAA-MM-DD' };
export const MES = { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$', description: 'Mes AAAA-MM' };
export const ERROR = {
  type: 'object',
  properties: { error: { type: 'object', properties: { codigo: { type: 'string' }, mensaje: { type: 'string' } } } },
};
export const INDICADOR = {
  type: 'object',
  properties: {
    id: { type: 'string' }, nombre: { type: 'string' }, unidad: { type: 'string' }, fuente: { type: 'string' },
    periodicidad: { type: 'string', enum: ['diaria', 'mensual'] }, desde: { type: 'string' }, hasta: { type: 'string' },
  },
};
