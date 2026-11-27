// Meses como 'AAAA-MM' y los atajos de período de la calculadora.

export const MES = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function sumarMeses(mes, n) {
  const [a, m] = mes.split('-').map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export function mesesEntre(desde, hasta) {
  const meses = [];
  for (let m = desde; m <= hasta; m = sumarMeses(m, 1)) meses.push(m);
  return meses;
}

const max = (a, b) => (a > b ? a : b);

// Último año = 12 meses hasta el último mes con datos; Desde 2020; Todo = desde el primer mes.
export function atajo(nombre, { mesMinimo, mesMaximo }) {
  if (nombre === 'ultimoAnio') return { desde: max(sumarMeses(mesMaximo, -12), mesMinimo), hasta: mesMaximo };
  if (nombre === 'desde2020') return { desde: max('2020-01', mesMinimo), hasta: mesMaximo };
  if (nombre === 'todo') return { desde: mesMinimo, hasta: mesMaximo };
  throw new Error(`Atajo desconocido: ${nombre}`);
}

export const ATAJOS = [
  { id: 'ultimoAnio', texto: 'Último año' },
  { id: 'desde2020', texto: 'Desde 2020' },
  { id: 'todo', texto: 'Todo (desde dic 2016)' },
];
