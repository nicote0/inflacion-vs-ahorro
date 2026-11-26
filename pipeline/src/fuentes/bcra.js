// Adaptador de la API de estadísticas monetarias del BCRA (v4).
import { TIMEOUT_MS } from './http.js';

const BASE = 'https://api.bcra.gob.ar/estadisticas/v4.0/monetarias';
const LIMITE_MAXIMO = 3000; // con más, la API responde 400
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Pide una página y devuelve el cuerpo como texto y como objeto.
// El BCRA informa los errores en el cuerpo (status y errorMessages), incluso con HTTP 400.
async function pedirPagina(fetch, url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const texto = await res.text();
  let cuerpo;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    throw new Error(`HTTP ${res.status}: la respuesta del BCRA no es JSON (${url})`);
  }
  if (!res.ok || cuerpo.status !== 200) {
    const detalle = (cuerpo.errorMessages ?? []).join(' ') || 'sin detalle';
    throw new Error(`BCRA respondió ${cuerpo.status ?? res.status}: ${detalle}`);
  }
  return { texto, cuerpo };
}

// Recorre páginas por offset hasta juntar metadata.resultset.count registros.
async function recorrer(fetch, armarUrl, tamanioPagina, alPagina) {
  let offset = 0;
  for (;;) {
    const { texto, cuerpo } = await pedirPagina(fetch, armarUrl(offset));
    const recibidos = alPagina(texto, cuerpo);
    const total = cuerpo.metadata?.resultset?.count ?? 0;
    offset += tamanioPagina;
    if (recibidos === 0 || offset >= total) return;
  }
}

async function descargar(fuente, { fetch, hoy, tamanioPagina = LIMITE_MAXIMO }) {
  const lineas = [];
  const url = (offset) =>
    `${BASE}/${fuente.variable}?desde=${fuente.desde}&hasta=${hoy}&limit=${tamanioPagina}&offset=${offset}`;
  await recorrer(fetch, url, tamanioPagina, (texto, cuerpo) => {
    lineas.push(texto);
    return cuerpo.results?.[0]?.detalle?.length ?? 0;
  });
  return { contenido: lineas.join('\n') + '\n', extension: 'jsonl' };
}

function parsear(contenido) {
  const porFecha = new Map();
  let descartadas = 0;
  for (const linea of contenido.split(/\r?\n/).filter((l) => l.trim() !== '')) {
    let cuerpo;
    try {
      cuerpo = JSON.parse(linea);
    } catch {
      throw new Error('Formato inesperado: una página de la copia cruda no es JSON');
    }
    for (const { fecha, valor } of cuerpo.results?.[0]?.detalle ?? []) {
      if (!FECHA.test(fecha) || typeof valor !== 'number' || !Number.isFinite(valor) || porFecha.has(fecha)) {
        descartadas++;
        continue;
      }
      porFecha.set(fecha, valor);
    }
  }
  if (porFecha.size === 0) throw new Error('La respuesta del BCRA llegó sin observaciones');

  const observaciones = [...porFecha]
    .map(([fecha, valor]) => ({ fecha, valor }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  return { observaciones, descartadas };
}

async function declarado(fuente, { fetch, tamanioPagina = LIMITE_MAXIMO }) {
  let encontrada = null;
  await recorrer(fetch, (offset) => `${BASE}?limit=${tamanioPagina}&offset=${offset}`, tamanioPagina, (_, cuerpo) => {
    const resultados = cuerpo.results ?? [];
    encontrada ??= resultados.find((v) => v.idVariable === fuente.variable) ?? null;
    return encontrada ? 0 : resultados.length; // 0 corta el recorrido
  });
  if (!encontrada) throw new Error(`La variable ${fuente.variable} no figura en el catálogo del BCRA`);
  return {
    ultimaFecha: encontrada.ultFechaInformada ?? null,
    detalle: { descripcion: encontrada.descripcion, unidadExpresion: encontrada.unidadExpresion },
  };
}

export const bcra = { descargar, parsear, declarado };
