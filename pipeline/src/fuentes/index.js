// Elige el adaptador según el tipo de fuente declarado en fuentes.json.
import { bcra } from './bcra.js';
import { indec } from './indec.js';

const ADAPTADORES = { indec_series: indec, bcra_monetarias: bcra };

export function adaptadorPara(fuente) {
  const adaptador = ADAPTADORES[fuente.tipo];
  if (!adaptador) throw new Error(`Tipo de fuente desconocido: ${fuente.tipo}`);
  return adaptador;
}
