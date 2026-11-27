import { describe, expect, test } from 'vitest';
import { atajo, sumarMeses } from '../src/logica/periodo.js';
import { escribirConsulta, leerConsulta, leerMonto } from '../src/logica/consulta.js';
import { ordenarOpciones, textoVeredicto } from '../src/logica/resultado.js';
import { factor, mesEnMayusculas, nombreMes, pesos, porcentaje } from '../src/logica/formato.js';
import { simulacionCasoA } from './datos.js';

const RANGO = { mesMinimo: '2016-12', mesMaximo: '2026-10' };

describe('periodo', () => {
  test('sumarMeses cruza años en los dos sentidos', () => {
    expect(sumarMeses('2020-01', -1)).toBe('2019-12');
    expect(sumarMeses('2024-11', 14)).toBe('2026-01');
  });

  test('atajos sobre el rango de la API', () => {
    expect(atajo('ultimoAnio', RANGO)).toEqual({ desde: '2025-10', hasta: '2026-10' });
    expect(atajo('desde2020', RANGO)).toEqual({ desde: '2020-01', hasta: '2026-10' });
    expect(atajo('todo', RANGO)).toEqual({ desde: '2016-12', hasta: '2026-10' });
  });

  test('desde2020 empieza en el mínimo si es posterior a 2020-01', () => {
    expect(atajo('desde2020', { mesMinimo: '2021-03', mesMaximo: '2026-10' })).toEqual({ desde: '2021-03', hasta: '2026-10' });
  });
});

describe('consulta', () => {
  test('leerMonto interpreta pesos enteros', () => {
    expect(leerMonto('100.000')).toBe(100000);
    expect(leerMonto('$ 1.000.000,50')).toBe(1000000);
    expect(leerMonto('')).toBeNull();
    expect(leerMonto('0')).toBeNull();
    expect(leerMonto('abc')).toBeNull();
  });

  test('leerConsulta toma los valores válidos de la URL', () => {
    expect(leerConsulta('?desde=2021-05&hasta=2023-01&monto=5000', RANGO)).toEqual({ desde: '2021-05', hasta: '2023-01', monto: 5000 });
  });

  test('leerConsulta sin parámetros usa Desde 2020 y 100000', () => {
    expect(leerConsulta('', RANGO)).toEqual({ desde: '2020-01', hasta: '2026-10', monto: 100000 });
  });

  test('parámetros fuera de rango o mal escritos caen a los valores por defecto', () => {
    expect(leerConsulta('?desde=2030-01&monto=abc', RANGO)).toEqual({ desde: '2020-01', hasta: '2026-10', monto: 100000 });
    expect(leerConsulta('?desde=2023-01&hasta=2021-01&monto=5000', RANGO)).toEqual({ desde: '2020-01', hasta: '2026-10', monto: 5000 });
  });

  test('escribirConsulta arma la URL', () => {
    expect(escribirConsulta({ desde: '2020-01', hasta: '2025-01', monto: 100000 })).toBe('?desde=2020-01&hasta=2025-01&monto=100000');
  });
});

describe('resultado', () => {
  test('ordenarOpciones ordena de mejor a peor y calcula lo perdido', () => {
    const o = ordenarOpciones(simulacionCasoA().opciones);
    expect(o.map((x) => x.clave)).toEqual(['dolar', 'plazoFijo', 'pesosQuietos']);
    expect(o[0]).toMatchObject({ nombre: 'Dólar oficial', gano: true, perdido: 0, puesto: '1.º · el que más ganó' });
    expect(o[1]).toMatchObject({ nombre: 'Plazo fijo', gano: false, perdido: 47, puesto: '2.º' });
    expect(o[2]).toMatchObject({ nombre: 'Pesos quietos', perdido: 50, puesto: '3.º' });
  });

  test('si el primero perdió, es el que menos perdió', () => {
    const opciones = simulacionCasoA().opciones;
    opciones.dolar.resultadoRealPct = -10;
    expect(ordenarOpciones(opciones)[0].puesto).toBe('1.º · el que menos perdió');
  });

  test('textoVeredicto según cuántas le ganaron', () => {
    const opciones = simulacionCasoA().opciones;
    expect(textoVeredicto(ordenarOpciones(opciones))).toBe('Le ganó a la inflación: Dólar oficial');
    opciones.plazoFijo.resultadoRealPct = 3;
    expect(textoVeredicto(ordenarOpciones(opciones))).toBe('Le ganó a la inflación: Dólar oficial y Plazo fijo');
    opciones.pesosQuietos.resultadoRealPct = 1;
    expect(textoVeredicto(ordenarOpciones(opciones))).toBe('Las tres le ganaron a la inflación');
    for (const o of Object.values(opciones)) o.resultadoRealPct = -5;
    expect(textoVeredicto(ordenarOpciones(opciones))).toBe('Ninguna le ganó a la inflación');
  });
});

describe('formato', () => {
  test('pesos, porcentajes, factor y meses', () => {
    expect(pesos(1699989.9)).toBe('$1.699.990');
    expect(porcentaje(-37.347)).toBe('37,3 %');
    expect(factor(27.1336)).toBe('27,13');
    expect(nombreMes('2020-01')).toBe('ene 2020');
    expect(nombreMes('2020-01', { largo: true })).toBe('enero 2020');
    expect(mesEnMayusculas('2025-01')).toBe('ENERO 2025');
  });
});
