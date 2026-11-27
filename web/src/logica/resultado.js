// Ranking de las tres opciones y el veredicto de la calculadora.

export const NOMBRES = { plazoFijo: 'Plazo fijo', dolar: 'Dólar oficial', pesosQuietos: 'Pesos quietos' };

export function ordenarOpciones(opciones) {
  const ordenadas = Object.entries(opciones)
    .map(([clave, o]) => ({
      clave,
      nombre: NOMBRES[clave],
      ...o,
      gano: o.resultadoRealPct > 0,
      perdido: Math.min(100, Math.max(0, Math.round(-o.resultadoRealPct))),
    }))
    .sort((a, b) => b.resultadoRealPct - a.resultadoRealPct);
  return ordenadas.map((o, i) => ({
    ...o,
    puesto: i === 0 ? (o.gano ? '1.º · el que más ganó' : '1.º · el que menos perdió') : `${i + 1}.º`,
  }));
}

export function textoVeredicto(ordenadas) {
  const ganadoras = ordenadas.filter((o) => o.gano).map((o) => o.nombre);
  if (ganadoras.length === 0) return 'Ninguna le ganó a la inflación';
  if (ganadoras.length === ordenadas.length) return 'Las tres le ganaron a la inflación';
  return `Le ganó a la inflación: ${ganadoras.join(' y ')}`;
}
