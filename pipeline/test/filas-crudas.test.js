import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indec } from '../src/fuentes/indec.js';
import { bcra } from '../src/fuentes/bcra.js';

const pagina = (detalle) => JSON.stringify({ status: 200, results: [{ idVariable: 4, detalle }] });

test('indec: devuelve las filas sin convertir', () => {
  const csv = 'indice_tiempo,ipc_nivel_general_nacional\n2016-12-01,100.0\n2017-01-01,\n';
  assert.deepEqual(indec.filasCrudas(csv), [
    { fila: 1, fecha: '2016-12-01', valor: '100.0' },
    { fila: 2, fecha: '2017-01-01', valor: '' },
  ]);
});

test('bcra: une páginas y numera en orden de llegada', () => {
  const contenido = [
    pagina([{ fecha: '2026-11-25', valor: 1632.65 }, { fecha: '2026-11-24', valor: null }]),
    pagina([{ fecha: '2026-11-21', valor: 1630 }]),
  ].join('\n') + '\n';
  assert.deepEqual(bcra.filasCrudas(contenido), [
    { fila: 1, fecha: '2026-11-25', valor: '1632.65' },
    { fila: 2, fecha: '2026-11-24', valor: '' },
    { fila: 3, fecha: '2026-11-21', valor: '1630' },
  ]);
});

test('indec rechaza contenido sin el formato esperado', () => {
  assert.throws(() => indec.filasCrudas('<html>error</html>'), /indice_tiempo/);
});

test('bcra rechaza una línea que no es JSON', () => {
  assert.throws(() => bcra.filasCrudas('<html>error</html>\n'), /no es JSON/);
});
