// Orquestador: descarga cada fuente, guarda la copia cruda y evalúa su frescura.
// Cada fuente se procesa aislada: si una falla, las demás siguen.
import { guardarCrudo, leerUltimoCrudo } from './almacen.js';
import { adaptadorPara } from './fuentes/index.js';
import { evaluarFrescura, fechaHoyArgentina } from './frescura.js';

const ultimaFecha = (observaciones) => observaciones.at(-1)?.fecha ?? null;

function armarFrescura(fuente, { ultimaObservacion, ultimaFechaDeclarada, hoy }) {
  return {
    ultimaObservacion,
    ultimaFechaDeclarada,
    ...evaluarFrescura({ ultimaObservacion, periodicidad: fuente.periodicidad, toleranciaDias: fuente.toleranciaDias, hoy }),
    fechaChequeo: hoy,
  };
}

// Si la fuente falló, la frescura se calcula con la última copia guardada (si hay),
// para que una caída no oculte hasta cuándo había datos.
async function ultimaObservacionGuardada(adaptador, fuente, dirBase) {
  try {
    const previa = await leerUltimoCrudo({ dirBase, fuenteId: fuente.id });
    return previa ? ultimaFecha(adaptador.parsear(previa.contenido).observaciones) : null;
  } catch {
    return null;
  }
}

async function procesarFuente(fuente, { dirBase, fetch, ahora, hoy, obtenerAdaptador }) {
  const resultado = {
    fuenteId: fuente.id, ok: false, sinCambios: false, sha256: null, archivo: null,
    filas: 0, descartadas: 0, error: null, frescura: null,
  };

  let adaptador;
  try {
    adaptador = obtenerAdaptador(fuente);
    const { contenido, extension } = await adaptador.descargar(fuente, { fetch, hoy });
    const { observaciones, descartadas } = adaptador.parsear(contenido); // si falla, no se guarda la copia
    const guardado = await guardarCrudo({ dirBase, fuenteId: fuente.id, contenido, extension, ahora });

    let ultimaFechaDeclarada = null;
    try {
      ultimaFechaDeclarada = (await adaptador.declarado(fuente, { fetch })).ultimaFecha;
    } catch (err) {
      resultado.error = `No se pudo leer la fecha declarada: ${err.message}`;
    }

    Object.assign(resultado, {
      ok: true, ...guardado, filas: observaciones.length, descartadas,
      frescura: armarFrescura(fuente, { ultimaObservacion: ultimaFecha(observaciones), ultimaFechaDeclarada, hoy }),
    });
  } catch (err) {
    resultado.error = err.message;
    const ultimaObservacion = adaptador ? await ultimaObservacionGuardada(adaptador, fuente, dirBase) : null;
    resultado.frescura = armarFrescura(fuente, { ultimaObservacion, ultimaFechaDeclarada: null, hoy });
  }
  return resultado;
}

export async function ejecutarIngesta({ fuentes, dirBase, fetch, ahora, obtenerAdaptador = adaptadorPara }) {
  const hoy = fechaHoyArgentina(ahora);
  const resultados = [];
  for (const fuente of fuentes) {
    resultados.push(await procesarFuente(fuente, { dirBase, fetch, ahora, hoy, obtenerAdaptador }));
  }
  return { ok: resultados.every((r) => r.ok), resultados };
}
