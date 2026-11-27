import { expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { armarCsv, nombreCsv } from '../src/logica/csv.js';
import { Series } from '../src/paginas/Series.jsx';

test('armarCsv: BOM, punto y coma, coma decimal y celdas vacías', () => {
  const csv = armarCsv(
    [{ titulo: 'fecha', clave: 'fecha', tipo: 'texto' }, { titulo: 'valor', clave: 'valor', tipo: 'numero' }],
    [{ fecha: '2020-01-01', valor: 1632.65 }, { fecha: '2020-02-01', valor: null }],
  );
  expect(csv).toBe('﻿fecha;valor\r\n2020-01-01;1632,65\r\n2020-02-01;\r\n');
});

test('armarCsv pone entre comillas los textos con punto y coma o comillas', () => {
  const csv = armarCsv([{ titulo: 'nombre', clave: 'n', tipo: 'texto' }], [{ n: 'a;b' }, { n: 'dijo "hola"' }]);
  expect(csv).toBe('﻿nombre\r\n"a;b"\r\n"dijo ""hola"""\r\n');
});

test('nombreCsv', () => {
  expect(nombreCsv('dolar_minorista', '2020-01', '2025-01')).toBe('dolar_minorista_2020-01_2025-01.csv');
});

const INDICADORES = {
  indicadores: [
    { id: 'dolar_minorista', nombre: 'Dólar minorista', unidad: 'pesos por dólar', fuente: 'BCRA', periodicidad: 'diaria', desde: '2016-12-01', hasta: '2026-11-26' },
    { id: 'ipc_nacional', nombre: 'IPC nacional', unidad: 'índice', fuente: 'INDEC', periodicidad: 'mensual', desde: '2016-12-01', hasta: '2026-10-01' },
  ],
};

function apiFalsa(datos) {
  return {
    indicadores: vi.fn(async () => INDICADORES),
    serie: vi.fn(async (id) => ({ indicador: { id, nombre: 'Dólar minorista', unidad: 'pesos por dólar', periodicidad: 'diaria' }, datos })),
    comparativa: vi.fn(async ({ indicadores }) => ({
      medida: 'variacion_mensual', meses: ['2020-01', '2020-02'], unidadesDistintas: false,
      series: indicadores.map((id, k) => ({ id, nombre: id === 'ipc_nacional' ? 'IPC nacional' : 'Dólar minorista', unidad: '%', valores: [k + 1, null] })),
    })),
  };
}

const montar = (api) => render(<MemoryRouter><Series api={api} /></MemoryRouter>);

test('la tabla muestra las mismas filas que la serie graficada', async () => {
  const api = apiFalsa([{ fecha: '2020-01-02', valor: 62.98 }, { fecha: '2020-01-03', valor: 63.1 }, { fecha: '2020-01-06', valor: 63.2 }]);
  montar(api);
  const tabla = await screen.findByRole('table');
  const filas = within(tabla).getAllByRole('row').slice(1);
  expect(filas).toHaveLength(3);
  expect(within(filas[0]).getByText('02/01/2020')).toBeInTheDocument();
  expect(api.serie).toHaveBeenCalledWith('dolar_minorista', { desde: '2020-01-01', hasta: '2026-11-31' });
});

test('comparar con otro indicador pide la comparativa y suma una columna', async () => {
  const api = apiFalsa([{ fecha: '2020-01-02', valor: 62.98 }]);
  montar(api);
  await screen.findByRole('table');
  fireEvent.change(screen.getByLabelText('Comparar con'), { target: { value: 'ipc_nacional' } });
  await waitFor(() => expect(api.comparativa).toHaveBeenCalled());
  expect(api.comparativa.mock.calls.at(-1)[0]).toMatchObject({ indicadores: ['dolar_minorista', 'ipc_nacional'], medida: 'variacion_mensual' });
  const encabezados = await screen.findAllByRole('columnheader');
  expect(encabezados.map((th) => th.textContent)).toEqual(['Mes', 'Dólar minorista (%)', 'IPC nacional (%)']);
});

test('sin datos muestra el aviso', async () => {
  montar(apiFalsa([]));
  expect(await screen.findByText('No hay datos para ese período')).toBeInTheDocument();
});
