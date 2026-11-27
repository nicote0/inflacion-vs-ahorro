import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Calculadora } from '../src/paginas/Calculadora.jsx';
import { ErrorApi } from '../src/api.js';
import { simulacionCasoA } from './datos.js';

const INDICADORES = {
  indicadores: [
    { id: 'ipc_nacional', nombre: 'IPC', unidad: 'índice', fuente: 'INDEC', periodicidad: 'mensual', desde: '2019-12-01', hasta: '2020-03-01' },
    { id: 'dolar_minorista', nombre: 'Dólar', unidad: 'pesos por dólar', fuente: 'BCRA', periodicidad: 'diaria', desde: '2020-01-02', hasta: '2020-03-02' },
  ],
};

function apiFalsa(overrides = {}) {
  return {
    indicadores: vi.fn(async () => INDICADORES),
    serie: vi.fn(async () => ({ indicador: {}, datos: [] })),
    simulacion: vi.fn(async () => simulacionCasoA()),
    ...overrides,
  };
}

const montar = (api) => render(<MemoryRouter><Calculadora api={api} retraso={400} /></MemoryRouter>);
// Avanza los timers falsos y deja resolver las promesas encadenadas (indicadores -> estado -> temporizador).
const esperar = async (ms = 0) => {
  for (let i = 0; i < 3; i++) await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  if (ms) await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
};

beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState(null, '', '/?desde=2020-01&hasta=2020-03&monto=1000');
});
afterEach(() => vi.useRealTimers());

test('muestra el veredicto, el billete grande y los tres billetes ordenados', async () => {
  const api = apiFalsa();
  montar(api);
  await esperar();
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Le ganó a la inflación: Dólar oficial');
  expect(screen.getByRole('img', { name: /Billete de \$1\.000 de enero 2020, entero/ })).toBeInTheDocument();
  const nombres = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
  expect(nombres.slice(0, 3)).toEqual(['Dólar oficial', 'Plazo fijo', 'Pesos quietos']);
  expect(screen.getByText('1.º · el que más ganó')).toBeInTheDocument();
});

test('muestra los montos y el resultado en texto', async () => {
  montar(apiFalsa());
  await esperar();
  const dolar = screen.getByRole('article', { name: 'Dólar oficial' });
  expect(within(dolar).getByText('Tenés hoy')).toBeInTheDocument();
  expect(within(dolar).getByText('$3.000', { selector: 'dd' })).toBeInTheDocument();
  expect(screen.getByText('Perdió 50,0 % contra la inflación')).toBeInTheDocument();
});

test('la primera consulta usa los valores de la URL', async () => {
  const api = apiFalsa();
  montar(api);
  await esperar();
  expect(api.simulacion).toHaveBeenCalledWith({ desde: '2020-01', hasta: '2020-03', monto: 1000 });
});

test('cambiar el monto hace una sola consulta nueva a los 400 ms y actualiza la URL', async () => {
  const api = apiFalsa();
  montar(api);
  await esperar();
  const campo = screen.getByLabelText('Monto en pesos');
  fireEvent.change(campo, { target: { value: '1.5' } });
  fireEvent.change(campo, { target: { value: '2.000' } });
  await esperar(399);
  expect(api.simulacion).toHaveBeenCalledTimes(1);
  await esperar(1);
  expect(api.simulacion).toHaveBeenCalledTimes(2);
  expect(api.simulacion).toHaveBeenLastCalledWith({ desde: '2020-01', hasta: '2020-03', monto: 2000 });
  expect(window.location.search).toBe('?desde=2020-01&hasta=2020-03&monto=2000');
});

test('si una respuesta vieja llega tarde, se muestra la última consulta', async () => {
  let resolverLenta;
  const lenta = new Promise((r) => { resolverLenta = r; });
  const rapida = simulacionCasoA();
  rapida.factorInflacion = 3;
  const api = apiFalsa({
    simulacion: vi.fn()
      .mockImplementationOnce(() => lenta)
      .mockImplementationOnce(async () => rapida),
  });
  montar(api);
  await esperar();
  fireEvent.change(screen.getByLabelText('Monto en pesos'), { target: { value: '2.000' } });
  await esperar(400);
  const vieja = simulacionCasoA();
  vieja.factorInflacion = 9;
  await act(async () => { resolverLenta(vieja); });
  expect(screen.getByText(/se multiplicaron por/)).toHaveTextContent('3,00');
});

test('un error de la API se muestra y los campos siguen habilitados', async () => {
  const api = apiFalsa({
    simulacion: vi.fn(async () => { throw new ErrorApi('PERIODO_FUERA_DE_RANGO', 'El período tiene que estar entre 2019-12 y 2020-03.', 400); }),
  });
  montar(api);
  await esperar();
  expect(screen.getByRole('alert')).toHaveTextContent('El período tiene que estar entre 2019-12 y 2020-03.');
  expect(screen.getByLabelText('Monto en pesos')).toBeEnabled();
});

test('monto vacío muestra el aviso y no consulta', async () => {
  const api = apiFalsa();
  montar(api);
  await esperar();
  fireEvent.change(screen.getByLabelText('Monto en pesos'), { target: { value: '' } });
  await esperar(1000);
  expect(screen.getByText('Ingresá un monto mayor que 0')).toBeInTheDocument();
  expect(api.simulacion).toHaveBeenCalledTimes(1);
});
