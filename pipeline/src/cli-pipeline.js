// Punto de entrada: `npm run pipeline` desde pipeline/ (o `npm run pipeline -- --fuentes <archivo>`).
// Descarga las fuentes, las carga en Postgres (DATABASE_URL) y registra la ejecución.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { crearCliente, leerUrl } from './db/conexion.js';
import { ejecutarPipeline } from './pipeline.js';

const dirPipeline = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirData = path.resolve(dirPipeline, '..', 'data');

async function main() {
  const { values } = parseArgs({ options: { fuentes: { type: 'string' } } });
  const archivoFuentes = values.fuentes ? path.resolve(values.fuentes) : path.join(dirPipeline, 'fuentes.json');
  const fuentes = JSON.parse(await readFile(archivoFuentes, 'utf8'));

  const cliente = crearCliente(leerUrl('DATABASE_URL'));
  await cliente.connect();
  const ahora = new Date();
  let salida;
  try {
    salida = await ejecutarPipeline({ fuentes, dirBase: path.join(dirData, 'raw'), fetch: globalThis.fetch, ahora, cliente });
  } finally {
    await cliente.end();
  }

  if (salida.bloqueado) {
    console.log('Otra ejecución está en curso; no se hizo nada.');
    process.exitCode = 1;
    return;
  }

  await mkdir(dirData, { recursive: true });
  await writeFile(path.join(dirData, 'frescura.json'),
    JSON.stringify({ generado: ahora.toISOString(), resultados: salida.resultados }, null, 2) + '\n', 'utf8');

  console.log(`Ejecución ${salida.ejecucionId}`);
  for (const r of salida.resultados) {
    const f = r.frescura;
    const frescura = f.estado === 'sin_datos' ? 'sin datos' : `${f.estado} (último dato ${f.ultimaObservacion})`;
    const conteos = r.estado === 'ok'
      ? `${r.filasInsertadas} insertadas, ${r.filasActualizadas} actualizadas, ${r.filasSinCambios} sin cambios, ${r.filasRechazadas} rechazadas`
      : '';
    console.log(`${r.estado.padEnd(11)} ${r.fuenteId.padEnd(20)} ${conteos}  ${frescura}`);
    if (r.error) console.log(`            ${r.error}`);
  }
  if (!salida.ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
