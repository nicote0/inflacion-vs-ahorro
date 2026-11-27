import { expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { anotacionesEn, inflacionAnual } from '../src/logica/anotaciones.js';
import { GraficoLineas } from '../src/componentes/GraficoLineas.jsx';

test('anotacionesEn filtra por período', () => {
  expect(anotacionesEn('2020-01', '2025-01')).toHaveLength(3);
  expect(anotacionesEn('2024-01', '2025-01').map((a) => a.mes)).toEqual(['2024-06']);
});

// IPC de diciembre 2019 a 2024 (INDEC, base dic 2016 = 100), cargado en la base el 27/11/2026.
// 2021: 582,46 / 385,88 - 1 = 50,9 %; 2022: 94,8 %; 2023: 211,4 %; 2024: 117,8 %.
test('inflacionAnual compara diciembre contra diciembre dentro del período', () => {
  const dic = [['2019', 283.44], ['2020', 385.88], ['2021', 582.46], ['2022', 1134.59], ['2023', 3533.19], ['2024', 7694.01]];
  const serie = dic.map(([a, v]) => ({ fecha: `${a}-12-01`, valor: v }));
  const r = inflacionAnual(serie, '2020-01', '2025-01');
  expect(r.map((x) => x.anio)).toEqual(['2021', '2022', '2023', '2024']);
  expect(r.map((x) => Number(x.pct.toFixed(1)))).toEqual([50.9, 94.8, 211.4, 117.8]);
});

test('las anotaciones van en la franja de arriba, sin pisar las líneas ni entre ellas', () => {
  const meses = Array.from({ length: 61 }, (_, i) => `${2020 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`);
  const valores = meses.map(() => 3000);
  const { container } = render(
    <GraficoLineas
      meses={meses}
      series={[{ id: 'dolar', nombre: 'Dólar', color: '#000', valores }, { id: 'plazoFijo', nombre: 'Plazo fijo', color: '#00f', valores }]}
      anotaciones={[
        { mes: '2022-12', serie: 'plazoFijo', lineas: ['Dic 2022: la inflación del año', 'llega a 95 %'] },
        { mes: '2023-12', serie: 'dolar', lineas: ['Dic 2023: el dólar oficial', 'sube 85 % en un mes'] },
        { mes: '2024-06', serie: 'plazoFijo', lineas: ['2024: la tasa cae de 120 % a 32 %', 'y el plazo fijo se queda atrás'] },
      ]}
    />,
  );
  const topeLineas = Math.min(...[...container.querySelectorAll('path.linea')]
    .flatMap((p) => [...p.getAttribute('d').matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]))));
  const textos = [...container.querySelectorAll('.grafico__notas text')];
  expect(textos).toHaveLength(3);
  for (const t of textos) expect(Number(t.getAttribute('y')) + 18).toBeLessThan(topeLineas);
  // Dos anotaciones en el mismo renglón no pueden solaparse horizontalmente.
  const cajas = textos.map((t) => ({ y: t.getAttribute('y'), x0: Number(t.dataset.x0), x1: Number(t.dataset.x1) }));
  for (const a of cajas) for (const b of cajas) {
    if (a !== b && a.y === b.y) expect(a.x1 <= b.x0 || b.x1 <= a.x0).toBe(true);
  }
});

test('en ancho de celular se dibuja al ancho real y las anotaciones pasan a una lista numerada', () => {
  const { container } = render(
    <GraficoLineas
      ancho={360}
      meses={['2023-11', '2023-12', '2024-01']}
      series={[{ id: 'dolar', nombre: 'Dólar oficial', color: '#24493A', valores: [100, 180, 170] }]}
      anotaciones={[{ mes: '2023-12', serie: 'dolar', lineas: ['Dic 2023: el dólar oficial', 'sube 85 % en un mes'] }]}
      formatoValor={(v) => `$${v}`}
    />,
  );
  expect(container.querySelector('svg').getAttribute('viewBox')).toBe('0 0 360 380');
  const lista = screen.getByRole('list', { name: 'Qué pasó' });
  expect(lista).toHaveTextContent('Dic 2023: el dólar oficial sube 85 % en un mes');
  expect(container.querySelector('.grafico__marca text')).toHaveTextContent('1');
  // Las letras del SVG quedan del mismo tamaño en pantalla: el viewBox mide lo mismo que el gráfico.
  const valorFinal = screen.getByText('$170');
  expect(Number(valorFinal.getAttribute('x'))).toBeLessThan(360);
});

test('los valores finales de líneas que terminan cerca no se pisan', () => {
  render(
    <GraficoLineas ancho={360} meses={['2020-01', '2020-02']} formatoValor={(v) => `$${v}`}
      series={[
        { id: 'dolar', nombre: 'Dólar', color: '#000', valores: [100, 245] },
        { id: 'plazoFijo', nombre: 'Plazo', color: '#00f', valores: [100, 231] },
      ]} />,
  );
  const ys = ['$245', '$231'].map((t) => Number(screen.getByText(t).getAttribute('y')));
  expect(Math.abs(ys[0] - ys[1])).toBeGreaterThanOrEqual(16);
});

test('GraficoLineas dibuja una línea por serie, las anotaciones y el valor final', () => {
  const { container } = render(
    <GraficoLineas
      meses={['2023-11', '2023-12', '2024-01']}
      series={[
        { id: 'dolar', nombre: 'Dólar oficial', color: '#24493A', valores: [100, 180, 170] },
        { id: 'pesosQuietos', nombre: 'Pesos quietos', color: '#D9622B', punteada: true, valores: [100, 80, null] },
      ]}
      anotaciones={[{ mes: '2023-12', serie: 'dolar', lineas: ['Dic 2023: el dólar oficial', 'sube 85 % en un mes'] }]}
      formatoValor={(v) => `$${v}`}
    />,
  );
  expect(container.querySelectorAll('path.linea')).toHaveLength(2);
  expect(screen.getByText('Dic 2023: el dólar oficial')).toBeInTheDocument();
  expect(screen.getByText('$170')).toBeInTheDocument();
  expect(screen.getByText('$80')).toBeInTheDocument();
});
