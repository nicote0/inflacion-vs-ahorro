import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bcra } from '../src/fuentes/bcra.js';
import { adaptadorPara } from '../src/fuentes/index.js';

const fuente = {
  id: 'dolar_minorista', tipo: 'bcra_monetarias', variable: 4,
  desde: '2016-12-01', periodicidad: 'diaria', toleranciaDias: 5,
};

const pagina = (count, offset, detalle) => ({
  status: 200,
  metadata: { resultset: { count, offset, limit: 3 } },
  results: [{ idVariable: 4, detalle }],
});

// fetch falso: responde según la URL pedida y guarda las URLs.
function fetchFalso(responder) {
  const urls = [];
  const fn = async (url) => {
    urls.push(url);
    const { cuerpo, ok = true, status = 200 } = responder(url);
    const texto = JSON.stringify(cuerpo);
    return { ok, status, text: async () => texto, json: async () => JSON.parse(texto) };
  };
  fn.urls = urls;
  return fn;
}

test('descargar pagina hasta completar count', async () => {
  const fetch = fetchFalso((url) =>
    url.includes('offset=0')
      ? { cuerpo: pagina(4, 0, [{ fecha: '2026-11-25', valor: 4 }, { fecha: '2026-11-24', valor: 3 }, { fecha: '2026-11-20', valor: 2 }]) }
      : { cuerpo: pagina(4, 3, [{ fecha: '2026-11-19', valor: 1 }]) });

  const r = await bcra.descargar(fuente, { fetch, hoy: '2026-11-26', tamanioPagina: 3 });

  assert.equal(fetch.urls.length, 2);
  assert.equal(
    fetch.urls[0],
    'https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/4?desde=2016-12-01&hasta=2026-11-26&limit=3&offset=0',
  );
  assert.match(fetch.urls[1], /offset=3$/);
  assert.equal(r.extension, 'jsonl');
  assert.equal(r.contenido.trimEnd().split('\n').length, 2);
});

test('parsear ordena de vieja a nueva y une páginas', () => {
  const contenido = [
    JSON.stringify(pagina(3, 0, [{ fecha: '2026-11-25', valor: 1632.65 }, { fecha: '2026-11-24', valor: 1619.1 }])),
    JSON.stringify(pagina(3, 2, [{ fecha: '2026-11-20', valor: 1601.32 }])),
  ].join('\n') + '\n';

  assert.deepEqual(bcra.parsear(contenido), {
    observaciones: [
      { fecha: '2026-11-20', valor: 1601.32 },
      { fecha: '2026-11-24', valor: 1619.1 },
      { fecha: '2026-11-25', valor: 1632.65 },
    ],
    descartadas: 0,
  });
});

test('parsear descarta valores no numéricos y fechas repetidas', () => {
  const contenido = JSON.stringify(pagina(3, 0, [
    { fecha: '2026-11-25', valor: 10 },
    { fecha: '2026-11-25', valor: 10 },
    { fecha: '2026-11-24', valor: null },
  ])) + '\n';

  const r = bcra.parsear(contenido);
  assert.deepEqual(r.observaciones, [{ fecha: '2026-11-25', valor: 10 }]);
  assert.equal(r.descartadas, 2);
});

test('parsear rechaza una línea que no es JSON', () => {
  assert.throws(() => bcra.parsear('<html>error</html>\n'), /JSON/);
});

test('descargar propaga el mensaje de error del BCRA', async () => {
  const fetch = fetchFalso(() => ({
    ok: false, status: 400,
    cuerpo: { status: 400, errorMessages: ['El límite no puede superar los 3000 registros.'] },
  }));
  await assert.rejects(
    bcra.descargar(fuente, { fetch, hoy: '2026-11-26' }),
    /El límite no puede superar los 3000 registros\./,
  );
});

test('declarado encuentra la variable en la segunda página del catálogo', async () => {
  const fetch = fetchFalso((url) =>
    url.includes('offset=0')
      ? { cuerpo: { status: 200, metadata: { resultset: { count: 2, offset: 0, limit: 1 } }, results: [{ idVariable: 1, ultFechaInformada: '2026-11-20' }] } }
      : { cuerpo: { status: 200, metadata: { resultset: { count: 2, offset: 1, limit: 1 } }, results: [{ idVariable: 4, descripcion: 'Tipo de cambio minorista (promedio vendedor)', unidadExpresion: 'Pesos argentinos por dólar estadounidense', ultFechaInformada: '2026-11-24' }] } });

  const r = await bcra.declarado(fuente, { fetch, tamanioPagina: 1 });
  assert.equal(r.ultimaFecha, '2026-11-24');
  assert.equal(r.detalle.descripcion, 'Tipo de cambio minorista (promedio vendedor)');
});

test('adaptadorPara lanza error con un tipo desconocido', () => {
  assert.equal(adaptadorPara(fuente), bcra);
  assert.throws(() => adaptadorPara({ ...fuente, tipo: 'otro' }), /otro/);
});
