import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarMigraciones } from '../src/db/migrador.js';
import { sincronizarIndicadores, cargarFuente } from '../src/db/carga.js';
import { conBaseDeTest } from './ayuda.js';

const DOLAR = {
  id: 'dolar_minorista', nombre: 'Dólar', unidad: 'pesos por dólar', tipo: 'bcra_monetarias',
  variable: 4, desde: '2016-12-01', periodicidad: 'diaria', toleranciaDias: 5,
};
const IPC = {
  id: 'ipc_nacional', nombre: 'IPC', unidad: 'índice (dic 2016 = 100)', tipo: 'indec_series',
  serie: '148.3_INIVELNAL_DICI_M_26', desde: '2016-12-01', periodicidad: 'mensual', toleranciaDias: 45,
};

const filas = (pares) => pares.map(([fecha, valor], i) => ({ fila: i + 1, fecha, valor }));

// Base migrada, indicadores sincronizados y una ejecución abierta.
function conBaseLista(fn) {
  return conBaseDeTest(async (cliente) => {
    await aplicarMigraciones(cliente);
    await sincronizarIndicadores(cliente, [DOLAR, IPC]);
    const { rows: [{ ejecucion_id: ejecucionId }] } = await cliente.query(
      `insert into control.ejecucion (estado) values ('en_curso') returning ejecucion_id`);
    await fn(cliente, Number(ejecucionId));
  });
}

const contar = async (cliente, tabla) => Number((await cliente.query(`select count(*) from ${tabla}`)).rows[0].count);

test('la primera carga inserta y la segunda no cambia nada', () =>
  conBaseLista(async (cliente, ejecucionId) => {
    const datos = filas([['2026-11-24', '1630'], ['2026-11-25', '1632.65'], ['2026-12-01', '1640']]);
    const primera = await cargarFuente(cliente, { fuente: DOLAR, sha256: 'a', filas: datos, ejecucionId });
    assert.deepEqual(primera, { filasLeidas: 3, filasInsertadas: 3, filasActualizadas: 0, filasSinCambios: 0, filasRechazadas: 0 });
    const diarios = await contar(cliente, 'modelo.hecho_diario');
    const mensuales = await contar(cliente, 'modelo.hecho_mensual');

    const segunda = await cargarFuente(cliente, { fuente: DOLAR, sha256: 'b', filas: datos, ejecucionId });
    assert.deepEqual(segunda, { filasLeidas: 3, filasInsertadas: 0, filasActualizadas: 0, filasSinCambios: 3, filasRechazadas: 0 });
    assert.equal(await contar(cliente, 'modelo.hecho_diario'), diarios);
    assert.equal(await contar(cliente, 'modelo.hecho_mensual'), mensuales);
  }));

test('un valor corregido se actualiza', () =>
  conBaseLista(async (cliente, ejecucionId) => {
    await cargarFuente(cliente, { fuente: DOLAR, sha256: 'a', filas: filas([['2026-11-24', '1630'], ['2026-11-25', '1632']]), ejecucionId });
    const r = await cargarFuente(cliente, { fuente: DOLAR, sha256: 'b', filas: filas([['2026-11-24', '1630'], ['2026-11-25', '1633.5']]), ejecucionId });
    assert.equal(r.filasActualizadas, 1);
    assert.equal(r.filasSinCambios, 1);
    const { rows } = await cliente.query(
      `select valor::float8 as valor, sha256 from modelo.hecho_diario where fecha = '2026-11-25'`);
    assert.deepEqual(rows, [{ valor: 1633.5, sha256: 'b' }]);
  }));

test('rechaza con motivo y sigue', () =>
  conBaseLista(async (cliente, ejecucionId) => {
    const datos = filas([
      ['2026-11-24', '1630'], ['2026-02-30', '1'], ['2026-11-25', ''], ['2026-11-26', 'abc'], ['2026-11-24', '9999'],
    ]);
    const r = await cargarFuente(cliente, { fuente: DOLAR, sha256: 'a', filas: datos, ejecucionId });
    assert.equal(r.filasRechazadas, 4);
    assert.equal(r.filasInsertadas, 1);
    const { rows } = await cliente.query(
      'select fila, motivo from control.fila_rechazada where ejecucion_id = $1 order by fila', [ejecucionId]);
    assert.deepEqual(rows, [
      { fila: 2, motivo: 'fecha_invalida' },
      { fila: 3, motivo: 'valor_invalido' },
      { fila: 4, motivo: 'valor_invalido' },
      { fila: 5, motivo: 'fecha_repetida' },
    ]);
    const { rows: [{ valor }] } = await cliente.query(`select valor::float8 as valor from modelo.hecho_diario where fecha = '2026-11-24'`);
    assert.equal(valor, 1630, 'queda la primera aparición');
  }));

test('promedio mensual con días con dato', () =>
  conBaseLista(async (cliente, ejecucionId) => {
    await cargarFuente(cliente, {
      fuente: DOLAR, sha256: 'a', ejecucionId,
      filas: filas([['2026-11-02', '10'], ['2026-11-03', '20'], ['2026-12-01', '30']]),
    });
    const { rows } = await cliente.query(`select to_char(mes, 'YYYY-MM-DD') as mes, valor::float8 as valor, dias_con_dato, origen
      from modelo.hecho_mensual where indicador_id = 'dolar_minorista' order by mes`);
    assert.deepEqual(rows, [
      { mes: '2026-11-01', valor: 15, dias_con_dato: 2, origen: 'promedio_diario' },
      { mes: '2026-12-01', valor: 30, dias_con_dato: 1, origen: 'promedio_diario' },
    ]);
  }));

test('el IPC va a hecho_mensual con origen fuente y sin días con dato', () =>
  conBaseLista(async (cliente, ejecucionId) => {
    const r = await cargarFuente(cliente, {
      fuente: IPC, sha256: 'a', ejecucionId, filas: filas([['2016-12-01', '100.0'], ['2017-01-01', '101.5859']]),
    });
    assert.equal(r.filasInsertadas, 2);
    const { rows } = await cliente.query(`select to_char(mes, 'YYYY-MM-DD') as mes, valor::float8 as valor, dias_con_dato, origen
      from modelo.hecho_mensual order by mes`);
    assert.deepEqual(rows, [
      { mes: '2016-12-01', valor: 100, dias_con_dato: null, origen: 'fuente' },
      { mes: '2017-01-01', valor: 101.5859, dias_con_dato: null, origen: 'fuente' },
    ]);
    assert.equal(await contar(cliente, 'modelo.hecho_diario'), 0);
    assert.equal(await contar(cliente, 'staging.indec_series'), 2);
  }));

test('staging guarda solo la última carga', () =>
  conBaseLista(async (cliente, ejecucionId) => {
    await cargarFuente(cliente, { fuente: DOLAR, sha256: 'a', filas: filas([['2026-11-24', '1'], ['2026-11-25', '2']]), ejecucionId });
    await cargarFuente(cliente, { fuente: DOLAR, sha256: 'b', filas: filas([['2026-11-24', '1']]), ejecucionId });
    const { rows } = await cliente.query('select distinct sha256 from staging.bcra_monetarias');
    assert.deepEqual(rows, [{ sha256: 'b' }]);
    assert.equal(await contar(cliente, 'staging.bcra_monetarias'), 1);
    assert.equal(await contar(cliente, 'modelo.hecho_diario'), 2, 'una fecha que desaparece de la fuente no se borra');
  }));

test('una carga que falla no deja datos a medias', () =>
  conBaseLista(async (cliente, ejecucionId) => {
    const desconocida = { ...DOLAR, id: 'no_sincronizada' };
    await assert.rejects(() => cargarFuente(cliente, { fuente: desconocida, sha256: 'a', filas: filas([['2026-11-24', '1']]), ejecucionId }));
    assert.equal(await contar(cliente, 'staging.bcra_monetarias'), 0);
    assert.equal(await contar(cliente, 'modelo.hecho_diario'), 0);
  }));

test('sincronizarIndicadores guarda unidad, fuente y serie de origen', () =>
  conBaseLista(async (cliente) => {
    const { rows } = await cliente.query('select * from modelo.dim_indicador order by indicador_id');
    assert.deepEqual(rows, [
      { indicador_id: 'dolar_minorista', nombre: 'Dólar', unidad: 'pesos por dólar', fuente: 'BCRA', periodicidad: 'diaria', serie_origen: 'variable 4' },
      { indicador_id: 'ipc_nacional', nombre: 'IPC', unidad: 'índice (dic 2016 = 100)', fuente: 'INDEC', periodicidad: 'mensual', serie_origen: '148.3_INIVELNAL_DICI_M_26' },
    ]);
  }));
