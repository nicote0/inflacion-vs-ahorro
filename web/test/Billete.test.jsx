import { expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Billete } from '../src/componentes/Billete.jsx';

const COLORES = { fondo: '#D6E2D9', tinta: '#24493A', acento: '#9A3A12' };

test('muestra el monto y la fecha con la leyenda de muestra', () => {
  render(<Billete monto={100000} mes="2020-01" perdido={0} colores={COLORES} />);
  expect(screen.getAllByText('$100.000').length).toBeGreaterThan(0);
  expect(screen.getByText('MUESTRA SIN VALOR · ENERO 2020')).toBeInTheDocument();
  expect(screen.getByText('INFLACIÓN VS AHORRO')).toBeInTheDocument();
});

test('con perdido muestra la etiqueta y lo dice en la descripción accesible', () => {
  render(<Billete monto={1699990} mes="2025-01" perdido={37} colores={COLORES} />);
  expect(screen.getByText('37 % se lo comió la inflación')).toBeInTheDocument();
  expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/37 por ciento/);
});

test('sin pérdida no hay etiqueta', () => {
  render(<Billete monto={100000} mes="2020-01" perdido={0} colores={COLORES} />);
  expect(screen.queryByText(/se lo comió/)).toBeNull();
});

test('si le ganó a la inflación lo dice y no se destiñe', () => {
  render(<Billete monto={3000} mes="2020-03" perdido={0} ganoPct={12.4} colores={COLORES} />);
  expect(screen.getByText('le ganó 12,4 %')).toBeInTheDocument();
  expect(screen.queryByText(/se lo comió/)).toBeNull();
});

test('no imita textos de un billete real', () => {
  const { container } = render(<Billete monto={100000} mes="2020-01" perdido={20} colores={COLORES} />);
  expect(container.textContent).not.toMatch(/REPÚBLICA|BANCO/i);
});

test('dos billetes en la misma página usan patrones con ids distintos', () => {
  const { container } = render(<>
    <Billete monto={1} mes="2020-01" perdido={10} colores={COLORES} />
    <Billete monto={2} mes="2020-01" perdido={20} colores={COLORES} />
  </>);
  const ids = [...container.querySelectorAll('pattern')].map((p) => p.id);
  expect(ids).toHaveLength(2);
  expect(new Set(ids).size).toBe(2);
});
