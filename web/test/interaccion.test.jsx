import { afterEach, expect, test, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GraficoLineas } from '../src/componentes/GraficoLineas.jsx';
import { useNumeroAnimado } from '../src/componentes/useNumeroAnimado.js';
import { Calculadora } from '../src/paginas/Calculadora.jsx';
import { simulacionCasoA } from './datos.js';

afterEach(() => vi.useRealTimers());

test('GraficoLineas apaga las líneas que no están resaltadas', () => {
  const { container } = render(
    <GraficoLineas meses={['2020-01', '2020-02']} resaltada="dolar"
      series={[{ id: 'dolar', nombre: 'Dólar', color: '#000', valores: [1, 2] }, { id: 'plazoFijo', nombre: 'Plazo', color: '#00f', valores: [1, 1] }]} />,
  );
  const [dolar, plazo] = container.querySelectorAll('path.linea');
  expect(dolar).not.toHaveClass('linea--apagada');
  expect(plazo).toHaveClass('linea--apagada');
});

test('useNumeroAnimado devuelve el valor final cuando no hay animación (sin matchMedia o con movimiento reducido)', () => {
  const { result, rerender } = renderHook(({ v }) => useNumeroAnimado(v), { initialProps: { v: 100 } });
  expect(result.current).toBe(100);
  rerender({ v: 250 });
  expect(result.current).toBe(250);
});

test('pasar por el billete de una opción resalta su línea en el gráfico', async () => {
  vi.useFakeTimers();
  window.history.replaceState(null, '', '/?desde=2020-01&hasta=2020-03&monto=1000');
  const api = {
    indicadores: vi.fn(async () => ({ indicadores: [{ id: 'ipc_nacional', desde: '2019-12-01', hasta: '2020-03-01' }] })),
    serie: vi.fn(async () => ({ datos: [] })),
    simulacion: vi.fn(async () => simulacionCasoA()),
  };
  const { container } = render(<MemoryRouter><Calculadora api={api} /></MemoryRouter>);
  for (let i = 0; i < 4; i++) await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  fireEvent.mouseEnter(screen.getByRole('article', { name: 'Plazo fijo' }));
  const apagadas = [...container.querySelectorAll('path.linea--apagada')];
  expect(apagadas).toHaveLength(2);
  fireEvent.mouseLeave(screen.getByRole('article', { name: 'Plazo fijo' }));
  expect(container.querySelectorAll('path.linea--apagada')).toHaveLength(0);
});
