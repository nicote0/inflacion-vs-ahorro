import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluarFrescura, fechaHoyArgentina } from '../src/frescura.js';

test('IPC de octubre vigente el 26/11', () => {
  assert.deepEqual(
    evaluarFrescura({ ultimaObservacion: '2026-10-01', periodicidad: 'mensual', toleranciaDias: 45, hoy: '2026-11-26' }),
    { estado: 'vigente', finDelPeriodo: '2026-10-31', diasDesdeFinDelPeriodo: 26 },
  );
});

test('IPC de octubre desactualizado el 20/12', () => {
  assert.deepEqual(
    evaluarFrescura({ ultimaObservacion: '2026-10-01', periodicidad: 'mensual', toleranciaDias: 45, hoy: '2026-12-20' }),
    { estado: 'desactualizado', finDelPeriodo: '2026-10-31', diasDesdeFinDelPeriodo: 50 },
  );
});

test('fin de período mensual en febrero bisiesto', () => {
  const r = evaluarFrescura({ ultimaObservacion: '2028-02-01', periodicidad: 'mensual', toleranciaDias: 45, hoy: '2028-03-01' });
  assert.equal(r.finDelPeriodo, '2028-02-29');
});

test('serie diaria vigente después de un fin de semana largo', () => {
  const r = evaluarFrescura({ ultimaObservacion: '2026-11-20', periodicidad: 'diaria', toleranciaDias: 5, hoy: '2026-11-24' });
  assert.equal(r.estado, 'vigente');
  assert.equal(r.diasDesdeFinDelPeriodo, 4);
});

test('serie diaria desactualizada a los 6 días', () => {
  const r = evaluarFrescura({ ultimaObservacion: '2026-11-20', periodicidad: 'diaria', toleranciaDias: 5, hoy: '2026-11-26' });
  assert.equal(r.estado, 'desactualizado');
  assert.equal(r.diasDesdeFinDelPeriodo, 6);
});

test('sin observaciones da sin_datos', () => {
  assert.deepEqual(
    evaluarFrescura({ ultimaObservacion: null, periodicidad: 'diaria', toleranciaDias: 5, hoy: '2026-11-26' }),
    { estado: 'sin_datos', finDelPeriodo: null, diasDesdeFinDelPeriodo: null },
  );
});

test('fechaHoyArgentina a las 01:30 UTC sigue siendo el día anterior', () => {
  assert.equal(fechaHoyArgentina(new Date('2026-11-27T01:30:00Z')), '2026-11-26');
  assert.equal(fechaHoyArgentina(new Date('2026-11-27T03:00:00Z')), '2026-11-27');
});
