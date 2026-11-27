// La consulta de la calculadora vive en la URL: ?desde=AAAA-MM&hasta=AAAA-MM&monto=N
import { MES, atajo } from './periodo.js';

export const MONTO_POR_DEFECTO = 100000;

// "$ 1.000.000,50" -> 1000000. Pesos enteros: se descartan los decimales. null si no es > 0.
export function leerMonto(texto) {
  const entero = String(texto ?? '').split(',')[0].replace(/[^0-9]/g, '');
  if (!entero) return null;
  const monto = Number(entero);
  return monto > 0 ? monto : null;
}

// Un valor inválido o fuera de rango cae a su valor por defecto, sin romper la página.
export function leerConsulta(search, rango) {
  const parametros = new URLSearchParams(search);
  const porDefecto = atajo('desde2020', rango);
  const enRango = (mes) => MES.test(mes ?? '') && mes >= rango.mesMinimo && mes <= rango.mesMaximo;

  let desde = parametros.get('desde');
  let hasta = parametros.get('hasta');
  if (!enRango(desde) || !enRango(hasta) || hasta <= desde) {
    desde = porDefecto.desde;
    hasta = porDefecto.hasta;
  }
  const monto = leerMonto(parametros.get('monto')) ?? MONTO_POR_DEFECTO;
  return { desde, hasta, monto };
}

export function escribirConsulta({ desde, hasta, monto }) {
  return `?${new URLSearchParams({ desde, hasta, monto: String(monto) })}`;
}
