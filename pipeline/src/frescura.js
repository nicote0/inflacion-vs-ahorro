// Frescura: ¿la última observación real de una fuente está dentro de lo esperable?
//
// Regla: el fin del período es el último día del mes de la observación (series
// mensuales) o la misma fecha (series diarias). La fuente está vigente si entre
// ese día y hoy pasaron como mucho `toleranciaDias` días.

const DIA_MS = 24 * 60 * 60 * 1000;

const aUTC = (fecha) => {
  const [a, m, d] = fecha.split('-').map(Number);
  return Date.UTC(a, m - 1, d);
};
const aTexto = (ms) => new Date(ms).toISOString().slice(0, 10);

function finDelPeriodo(fecha, periodicidad) {
  if (periodicidad === 'diaria') return fecha;
  if (periodicidad === 'mensual') {
    const [a, m] = fecha.split('-').map(Number);
    return aTexto(Date.UTC(a, m, 0)); // día 0 del mes siguiente = último día del mes
  }
  throw new Error(`Periodicidad desconocida: ${periodicidad}`);
}

export function evaluarFrescura({ ultimaObservacion, periodicidad, toleranciaDias, hoy }) {
  if (!ultimaObservacion) {
    return { estado: 'sin_datos', finDelPeriodo: null, diasDesdeFinDelPeriodo: null };
  }
  const fin = finDelPeriodo(ultimaObservacion, periodicidad);
  const dias = Math.round((aUTC(hoy) - aUTC(fin)) / DIA_MS);
  return {
    estado: dias <= toleranciaDias ? 'vigente' : 'desactualizado',
    finDelPeriodo: fin,
    diasDesdeFinDelPeriodo: dias,
  };
}

// Fecha de hoy en Argentina como AAAA-MM-DD (en-CA da ese formato).
const formato = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
});

export const fechaHoyArgentina = (ahora) => formato.format(ahora);
