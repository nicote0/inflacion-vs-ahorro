// Adaptador de la API de series de tiempo de datos.gob.ar (IPC del INDEC).
import { pedir } from './http.js';

const BASE = 'https://apis.datos.gob.ar/series/api/series/';
const LIMITE_FILAS = 1000;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export const urlDatos = (fuente) =>
  `${BASE}?ids=${fuente.serie}&format=csv&start_date=${fuente.desde}&limit=${LIMITE_FILAS}`;

export const urlMetadatos = (fuente) => `${BASE}?ids=${fuente.serie}&limit=1&metadata=full`;

// Filas del CSV tal como llegaron, como texto y sin descartar nada (para staging).
function filasCrudas(contenido) {
  const lineas = contenido.split(/\r?\n/).filter((l) => l.trim() !== '');
  const encabezado = (lineas[0] ?? '').split(',');
  if (encabezado[0] !== 'indice_tiempo' || encabezado.length < 2) {
    throw new Error('Formato inesperado: el CSV no empieza con la columna indice_tiempo');
  }
  return lineas.slice(1).map((linea, i) => {
    const [fecha = '', valor = ''] = linea.split(',');
    return { fila: i + 1, fecha, valor };
  });
}

function parsear(contenido) {
  const observaciones = [];
  let descartadas = 0;
  for (const { fecha, valor: texto } of filasCrudas(contenido)) {
    const valor = texto.trim() === '' ? NaN : Number(texto);
    if (FECHA.test(fecha) && Number.isFinite(valor)) {
      observaciones.push({ fecha, valor });
    } else {
      descartadas++;
    }
  }

  if (observaciones.length === 0) {
    throw new Error('El CSV llegó sin observaciones');
  }
  return { observaciones, descartadas };
}

async function descargar(fuente, { fetch }) {
  const contenido = await (await pedir(fetch, urlDatos(fuente))).text();
  const filas = contenido.split(/\r?\n/).filter((l) => l.trim() !== '').length - 1;
  if (filas >= LIMITE_FILAS) {
    throw new Error(`Llegaron ${filas} filas, el límite del pedido es ${LIMITE_FILAS}: la serie puede estar truncada`);
  }
  return { contenido, extension: 'csv' };
}

async function declarado(fuente, { fetch }) {
  const cuerpo = await (await pedir(fetch, urlMetadatos(fuente))).json();
  const campo = cuerpo?.meta?.[1]?.field;
  if (!campo) throw new Error('Los metadatos no traen meta[1].field');
  return {
    ultimaFecha: campo.time_index_end ?? null,
    detalle: { isUpdated: String(campo.is_updated).toLowerCase() === 'true' },
  };
}

export const indec = { descargar, parsear, filasCrudas, declarado };
