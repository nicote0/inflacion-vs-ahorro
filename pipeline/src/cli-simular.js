// `npm run simular -- --desde AAAA-MM --hasta AAAA-MM --monto N [--csv carpeta]`
// Lee los insumos de la base (DATABASE_URL), corre la simulación y muestra el resultado.
// Con --csv exporta los insumos y las renovaciones del plazo fijo (para la planilla de verificación).
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ErrorSimulacion, simular } from 'simulacion';
import { crearCliente, leerUrl } from './db/conexion.js';
import { leerInsumos } from './db/insumos.js';

const BOM = '﻿';
const csv = (encabezado, filas) => BOM + [encabezado, ...filas].map((f) => f.join(',')).join('\n') + '\n';
const pesos = (n) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n) => `${n >= 0 ? '+' : ''}${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })} %`;

async function exportar(carpeta, { desde, hasta }, insumos, resultado) {
  await mkdir(carpeta, { recursive: true });
  const meses = [...insumos.ipcMensual.keys()].filter((m) => m >= desde && m <= hasta);
  await writeFile(path.join(carpeta, 'insumos.csv'),
    csv(['mes', 'ipc', 'dolar_promedio'], meses.map((m) => [m, insumos.ipcMensual.get(m), insumos.dolarMensual.get(m) ?? ''])), 'utf8');
  await writeFile(path.join(carpeta, 'renovaciones.csv'),
    csv(['inicio', 'vencimiento', 'tna', 'capital_inicial', 'capital_final', 'cobrada'],
      resultado.renovaciones.map((r) => [r.inicio, r.vencimiento, r.tna, r.capitalInicial, r.capitalFinal, r.cobrada ? 'si' : 'no'])), 'utf8');
}

async function main() {
  const { values } = parseArgs({
    options: { desde: { type: 'string' }, hasta: { type: 'string' }, monto: { type: 'string' }, csv: { type: 'string' } },
  });
  const pedido = { desde: values.desde, hasta: values.hasta, monto: Number(values.monto) };

  const cliente = crearCliente(leerUrl('DATABASE_URL'));
  await cliente.connect();
  let insumos;
  try {
    insumos = await leerInsumos(cliente, pedido);
  } finally {
    await cliente.end();
  }

  const r = simular({ ...pedido, ...insumos });
  console.log(`Del ${pedido.desde} al ${pedido.hasta}, con $ ${pesos(pedido.monto)}`);
  console.log(`Inflación del período: factor ${r.factorInflacion.toFixed(4)} (${pct((r.factorInflacion - 1) * 100)})`);
  const nombres = { plazoFijo: 'Plazo fijo', dolar: 'Dólar oficial', pesosQuietos: 'Pesos quietos' };
  for (const [clave, o] of Object.entries(r.opciones)) {
    const veredicto = o.resultadoRealPct >= 0 ? 'le ganó a la inflación' : 'perdió contra la inflación';
    console.log(`${nombres[clave].padEnd(14)} final $ ${pesos(o.valorFinalNominal).padStart(16)}  real $ ${pesos(o.valorReal).padStart(14)}  ${pct(o.resultadoRealPct).padStart(10)}  ${veredicto}`);
  }
  console.log(`\nEvolución en pesos de ${pedido.hasta}:`);
  for (const e of r.evolucion) {
    console.log(`${e.mes}  plazo fijo ${pesos(e.plazoFijo).padStart(14)}  dólar ${pesos(e.dolar).padStart(14)}  quietos ${pesos(e.pesosQuietos).padStart(14)}`);
  }

  if (values.csv) {
    await exportar(path.resolve(values.csv), pedido, insumos, r);
    console.log(`\nCSV exportados en ${path.resolve(values.csv)}`);
  }
}

main().catch((err) => {
  console.error(err instanceof ErrorSimulacion ? `Error (${err.codigo}): ${err.message}` : err.message);
  process.exitCode = 1;
});
