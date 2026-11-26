// Punto de entrada: `npm run ingesta` desde pipeline/.
// Descarga las fuentes de fuentes.json y escribe data/frescura.json en la raíz del repo.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ejecutarIngesta } from './ingesta.js';

const dirPipeline = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirData = path.resolve(dirPipeline, '..', 'data');

const fuentes = JSON.parse(await readFile(path.join(dirPipeline, 'fuentes.json'), 'utf8'));
const ahora = new Date();
const { ok, resultados } = await ejecutarIngesta({
  fuentes, dirBase: path.join(dirData, 'raw'), fetch: globalThis.fetch, ahora,
});

await mkdir(dirData, { recursive: true });
await writeFile(path.join(dirData, 'frescura.json'), JSON.stringify({ generado: ahora.toISOString(), resultados }, null, 2) + '\n', 'utf8');

for (const r of resultados) {
  const f = r.frescura;
  const estado = f.estado === 'sin_datos' ? 'sin datos' : `${f.estado} (${f.diasDesdeFinDelPeriodo} días, último dato ${f.ultimaObservacion})`;
  const cambios = r.ok ? (r.sinCambios ? 'sin cambios' : 'copia nueva') : 'FALLÓ';
  console.log(`${r.ok ? 'ok ' : 'ERR'}  ${r.fuenteId.padEnd(20)} ${String(r.filas).padStart(5)} filas  ${cambios.padEnd(11)}  ${estado}`);
  if (r.error) console.log(`     ${r.error}`);
}

if (!ok) process.exitCode = 1;
