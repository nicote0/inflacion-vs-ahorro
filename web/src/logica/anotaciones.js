// Hechos que se anotan sobre el gráfico de la calculadora. Las cifras se calcularon con la base
// el 27/11/2026: IPC de diciembre (INDEC), promedio mensual del dólar oficial y de la tasa a 30 días (BCRA).
export const ANOTACIONES = [
  { mes: '2022-12', serie: 'plazoFijo', lineas: ['Dic 2022: la inflación del año', 'llega a 95 %'] },
  { mes: '2023-12', serie: 'dolar', lineas: ['Dic 2023: el dólar oficial', 'sube 85 % en un mes'] },
  { mes: '2024-06', serie: 'plazoFijo', lineas: ['2024: la tasa cae de 120 % a 32 %', 'y el plazo fijo se queda atrás'] },
];

export const anotacionesEn = (desde, hasta) => ANOTACIONES.filter((a) => a.mes >= desde && a.mes <= hasta);

// Inflación de cada año completo dentro del período: diciembre contra el diciembre anterior.
export function inflacionAnual(serieIpc, desde, hasta) {
  const porMes = new Map(serieIpc.map((p) => [p.fecha.slice(0, 7), p.valor]));
  const resultado = [];
  const primerAnio = Number(desde.slice(0, 4));
  const ultimoAnio = Number(hasta.slice(0, 4));
  for (let anio = primerAnio; anio <= ultimoAnio; anio++) {
    const anterior = `${anio - 1}-12`;
    const actual = `${anio}-12`;
    if (anterior < desde || actual > hasta) continue;
    if (!porMes.has(anterior) || !porMes.has(actual)) continue;
    resultado.push({ anio: String(anio), pct: (porMes.get(actual) / porMes.get(anterior) - 1) * 100 });
  }
  return resultado;
}
