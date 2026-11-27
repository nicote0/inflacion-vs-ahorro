import { expect, test, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Datos } from '../src/paginas/Datos.jsx';
import { frescuraFalsa } from './datos.js';

test('muestra cada fuente con su estado en texto, también las no verificadas', async () => {
  render(<Datos api={{ frescura: vi.fn(async () => frescuraFalsa()) }} />);
  const ipc = await screen.findByRole('article', { name: 'IPC nacional' });
  expect(within(ipc).getByText('Al día')).toBeInTheDocument();
  expect(within(ipc).getByText('1 mes de atraso')).toBeInTheDocument();
  expect(within(screen.getByRole('article', { name: 'Dólar minorista' })).getByText('0 meses de atraso')).toBeInTheDocument();
  const tasa = screen.getByRole('article', { name: 'Tasa a 30 días' });
  expect(within(tasa).getByText('Sin verificar')).toBeInTheDocument();
  expect(screen.getByText(/45 días/)).toBeInTheDocument();
});
