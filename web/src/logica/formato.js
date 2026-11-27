// Formatos en castellano de Argentina.

const NOMBRES_MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const pesos = (n) => `$${Math.round(n).toLocaleString('es-AR')}`;

export const porcentaje = (n) =>
  `${Math.abs(n).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;

export const factor = (n) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const numero = (n, decimales = 2) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: decimales });

export function nombreMes(mes, { largo = false } = {}) {
  const [a, m] = mes.split('-').map(Number);
  const nombre = NOMBRES_MESES[m - 1];
  return `${largo ? nombre : nombre.slice(0, 3)} ${a}`;
}

export const mesEnMayusculas = (mes) => nombreMes(mes, { largo: true }).toUpperCase();

// 'AAAA-MM-DD' -> '26/11/2026'
export const fechaCorta = (fecha) => (fecha ? fecha.split('-').reverse().join('/') : '—');
