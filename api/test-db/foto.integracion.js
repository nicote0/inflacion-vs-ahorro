import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { aplicarMigraciones } from '../../pipeline/src/db/migrador.js';
import { cargarFuente, sincronizarIndicadores } from '../../pipeline/src/db/carga.js';
import { guardarFrescura } from '../../pipeline/src/db/control.js';
import { conBaseDeTest } from '../../pipeline/test-db/ayuda.js';
import { leerFotoDeLaBase } from '../src/base.js';

const fuentes = JSON.parse(await readFile(new URL('../../pipeline/fuentes.json', import.meta.url), 'utf8'));
const porId = Object.fromEntries(fuentes.map((f) => [f.id, f]));
const filas = (pares) => pares.map(([fecha, valor], i) => ({ fila: i + 1, fecha, valor }));

test('leerFotoDeLaBase arma la foto desde la base', () =>
  conBaseDeTest(async (cliente) => {
    await aplicarMigraciones(cliente);
    await sincronizarIndicadores(cliente, fuentes);
    const { rows: [{ ejecucion_id: id }] } = await cliente.query(
      `insert into control.ejecucion (estado) values ('en_curso') returning ejecucion_id`);
    const cargar = (fuenteId, pares) =>
      cargarFuente(cliente, { fuente: porId[fuenteId], sha256: 'x', filas: filas(pares), ejecucionId: Number(id) });
    await cargar('ipc_nacional', [['2020-01-01', '100'], ['2020-02-01', '150.5']]);
    await cargar('dolar_minorista', [['2020-01-02', '10'], ['2020-01-03', '20'], ['2020-02-03', '30']]);
    await guardarFrescura(cliente, 'ipc_nacional', {
      ultimaObservacion: '2020-02-01', ultimaFechaDeclarada: '2020-02-01', estado: 'vigente',
      finDelPeriodo: '2020-02-29', diasDesdeFinDelPeriodo: 10, fechaChequeo: '2020-03-10',
    });

    const foto = await leerFotoDeLaBase(process.env.TEST_DATABASE_URL);

    assert.deepEqual(foto.indicadores.map((i) => [i.id, i.desde, i.hasta]), [
      ['dolar_minorista', '2020-01-02', '2020-02-03'],
      ['ipc_nacional', '2020-01-01', '2020-02-01'],
      ['tasa_plazo_fijo_30d', null, null],
    ]);
    assert.equal(foto.indicadores[1].unidad, 'índice (dic 2016 = 100)');
    assert.deepEqual(foto.diarias.get('dolar_minorista'), [
      { fecha: '2020-01-02', valor: 10 }, { fecha: '2020-01-03', valor: 20 }, { fecha: '2020-02-03', valor: 30 },
    ]);
    assert.deepEqual(foto.mensuales.get('dolar_minorista'), [
      { mes: '2020-01', valor: 15, diasConDato: 2 }, { mes: '2020-02', valor: 30, diasConDato: 1 },
    ]);
    assert.deepEqual(foto.mensuales.get('ipc_nacional'), [
      { mes: '2020-01', valor: 100, diasConDato: null }, { mes: '2020-02', valor: 150.5, diasConDato: null },
    ]);
    assert.deepEqual([...foto.frescura.keys()], ['ipc_nacional']);
    assert.deepEqual(foto.frescura.get('ipc_nacional'), {
      estado: 'vigente', ultimaObservacion: '2020-02-01', ultimaFechaDeclarada: '2020-02-01',
      fechaChequeo: '2020-03-10', diasDesdeFinDelPeriodo: 10,
    });
  }));
