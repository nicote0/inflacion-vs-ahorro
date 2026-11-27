import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { aplicarMigraciones } from '../src/db/migrador.js';
import { cargarFuente, sincronizarIndicadores } from '../src/db/carga.js';
import { leerInsumos } from '../src/db/insumos.js';
import { conBaseDeTest } from './ayuda.js';

const fuentes = JSON.parse(await readFile(new URL('../fuentes.json', import.meta.url), 'utf8'));
const porId = Object.fromEntries(fuentes.map((f) => [f.id, f]));
const filas = (pares) => pares.map(([fecha, valor], i) => ({ fila: i + 1, fecha, valor }));

test('leerInsumos devuelve Maps por mes y las tasas ordenadas, con la anterior a desde', () =>
  conBaseDeTest(async (cliente) => {
    await aplicarMigraciones(cliente);
    await sincronizarIndicadores(cliente, fuentes);
    const { rows: [{ ejecucion_id: id }] } = await cliente.query(
      `insert into control.ejecucion (estado) values ('en_curso') returning ejecucion_id`);
    const cargar = (fuenteId, pares) =>
      cargarFuente(cliente, { fuente: porId[fuenteId], sha256: 'x', filas: filas(pares), ejecucionId: Number(id) });

    await cargar('ipc_nacional', [['2019-12-01', '90'], ['2020-01-01', '100'], ['2020-02-01', '150.5'], ['2020-03-01', '200']]);
    await cargar('dolar_minorista', [['2020-01-02', '10'], ['2020-01-03', '20'], ['2020-02-03', '30'], ['2020-03-02', '40']]);
    await cargar('tasa_plazo_fijo_30d', [['2019-12-30', '35'], ['2019-12-27', '34'], ['2020-01-02', '36.5'], ['2020-03-31', '40'], ['2020-04-01', '50']]);

    const r = await leerInsumos(cliente, { desde: '2020-01', hasta: '2020-02' });
    assert.deepEqual([...r.ipcMensual], [['2020-01', 100], ['2020-02', 150.5]]);
    assert.deepEqual([...r.dolarMensual], [['2020-01', 15], ['2020-02', 30]]);
    assert.deepEqual(r.tasasDiarias, [
      { fecha: '2019-12-30', valor: 35 },
      { fecha: '2020-01-02', valor: 36.5 },
    ]);
  }));
