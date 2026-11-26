// Copias crudas de cada descarga, con su hash SHA-256 y un manifiesto por fuente.
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MANIFIESTO = 'manifest.json';

export function sha256(texto) {
  return createHash('sha256').update(texto, 'utf8').digest('hex');
}

async function leerManifiesto(dirBase) {
  try {
    return JSON.parse(await readFile(path.join(dirBase, MANIFIESTO), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

// Escribe en un archivo temporal y lo renombra, para no dejar el manifiesto a medias.
async function escribirManifiesto(dirBase, manifiesto) {
  const destino = path.join(dirBase, MANIFIESTO);
  const temporal = `${destino}.tmp`;
  await writeFile(temporal, JSON.stringify(manifiesto, null, 2) + '\n', 'utf8');
  await rename(temporal, destino);
}

// 2026-11-26T15:00:00.000Z -> 2026-11-26T15-00-00Z (válido como nombre de archivo en Windows)
const marcaDeTiempo = (ahora) => ahora.toISOString().replace(/\.\d{3}Z$/, 'Z').replaceAll(':', '-');

export async function guardarCrudo({ dirBase, fuenteId, contenido, extension, ahora }) {
  const hash = sha256(contenido);
  const manifiesto = await leerManifiesto(dirBase);
  const historial = manifiesto[fuenteId] ?? [];
  const ultima = historial.at(-1);

  if (ultima && ultima.sha256 === hash) {
    return { sinCambios: true, sha256: hash, archivo: null };
  }

  // Ruta relativa con "/" para que el manifiesto sea igual en cualquier sistema operativo.
  const archivo = path.posix.join(fuenteId, `${marcaDeTiempo(ahora)}_${hash.slice(0, 12)}.${extension}`);
  await mkdir(path.join(dirBase, fuenteId), { recursive: true });
  await writeFile(path.join(dirBase, archivo), contenido, 'utf8');

  historial.push({ fecha: ahora.toISOString(), archivo, sha256: hash, bytes: Buffer.byteLength(contenido, 'utf8') });
  manifiesto[fuenteId] = historial;
  await escribirManifiesto(dirBase, manifiesto);

  return { sinCambios: false, sha256: hash, archivo };
}

export async function leerUltimoCrudo({ dirBase, fuenteId }) {
  const ultima = (await leerManifiesto(dirBase))[fuenteId]?.at(-1);
  if (!ultima) return null;
  return { contenido: await readFile(path.join(dirBase, ultima.archivo), 'utf8'), archivo: ultima.archivo };
}
