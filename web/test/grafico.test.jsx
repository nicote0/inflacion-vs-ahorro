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
