// Pipeline completo: descarga (como en M1), carga en Postgres y registro de la ejecución.
// Cada fuente se procesa aislada: si una falla, las demás siguen.
import { guardarCrudo } from './almacen.js';
import { adaptadorPara } from './fuentes/index.js';
import { fechaHoyArgentina } from './frescura.js';
import { armarFrescura, ultimaObservacionGuardada } from './ingesta.js';
import { aplicarMigraciones } from './db/migrador.js';
import { cargarFuente, sincronizarIndicadores } from './db/carga.js';
import {
  cerrarEjecucion, guardarFrescura, iniciarEjecucion, registrarFuente, ultimaFechaCargada, ultimoHashOk,
} from './db/control.js';

// Clave del advisory lock que impide dos corridas a la vez sobre la misma base.
export const CLAVE_LOCK = 20261127;

const CONTEOS_EN_CERO = { filasLeidas: 0, filasInsertadas: 0, filasActualizadas: 0, filasSinCambios: 0, filasRechazadas: 0 };

// Si la fuente falló, la última observación sale de la base; si la base no tiene datos, de la última copia local.
async function ultimaObservacionConocida(cliente, adaptador, fuente, dirBase) {
  try {
    const enBase = await ultimaFechaCargada(cliente, fuente);
    if (enBase) return enBase;
  } catch {
    // sin base utilizable: se intenta con la copia local
  }
  return adaptador ? ultimaObservacionGuardada(adaptador, fuente, dirBase) : null;
}

async function procesarFuente(fuente, { cliente, ejecucionId, dirBase, fetch, ahora, hoy, obtenerAdaptador }) {
  const resultado = {
    fuenteId: fuente.id, ok: false, estado: 'error', sinCambios: false, sha256: null, archivo: null,
    filas: 0, descartadas: 0, ...CONTEOS_EN_CERO, error: null, frescura: null,
    iniciadaEn: new Date(), terminadaEn: null,
  };

  let adaptador;
  try {
    adaptador = obtenerAdaptador(fuente);
    const { contenido, extension } = await adaptador.descargar(fuente, { fetch, hoy });
    const { observaciones, descartadas } = adaptador.parsear(contenido); // si falla, no se guarda ni se carga
    const guardado = await guardarCrudo({ dirBase, fuenteId: fuente.id, contenido, extension, ahora });
    Object.assign(resultado, { sha256: guardado.sha256, archivo: guardado.archivo, filas: observaciones.length, descartadas });

    if (guardado.sha256 === (await ultimoHashOk(cliente, fuente.id))) {
      Object.assign(resultado, { estado: 'sin_cambios', sinCambios: true });
    } else {
      const conteos = await cargarFuente(cliente, {
        fuente, sha256: guardado.sha256, filas: adaptador.filasCrudas(contenido), ejecucionId,
      });
      Object.assign(resultado, conteos, { estado: 'ok' });
    }
    resultado.ok = true;

    let ultimaFechaDeclarada = null;
    try {
      ultimaFechaDeclarada = (await adaptador.declarado(fuente, { fetch })).ultimaFecha;
    } catch (err) {
      resultado.error = `No se pudo leer la fecha declarada: ${err.message}`;
    }
    resultado.frescura = armarFrescura(fuente, { ultimaObservacion: observaciones.at(-1)?.fecha ?? null, ultimaFechaDeclarada, hoy });
  } catch (err) {
    Object.assign(resultado, { ok: false, estado: 'error', sinCambios: false, error: err.message, ...CONTEOS_EN_CERO });
    const ultimaObservacion = await ultimaObservacionConocida(cliente, adaptador, fuente, dirBase);
    resultado.frescura = armarFrescura(fuente, { ultimaObservacion, ultimaFechaDeclarada: null, hoy });
  }

  // Fuera de la transacción de carga, para que una carga fallida también quede registrada.
  resultado.terminadaEn = new Date();
  await registrarFuente(cliente, ejecucionId, resultado);
  await guardarFrescura(cliente, fuente.id, resultado.frescura);
  return resultado;
}

function estadoFinal(resultados) {
  const conError = resultados.filter((r) => r.estado === 'error').length;
  if (conError === 0) return 'ok';
  return conError === resultados.length ? 'fallida' : 'con_errores';
}

export async function ejecutarPipeline({ fuentes, dirBase, fetch, ahora, cliente, obtenerAdaptador = adaptadorPara }) {
  const { rows: [{ tomado }] } = await cliente.query('select pg_try_advisory_lock($1) as tomado', [CLAVE_LOCK]);
  if (!tomado) return { ok: false, bloqueado: true, ejecucionId: null, resultados: [] };

  let ejecucionId = null;
  try {
    await aplicarMigraciones(cliente);
    ejecucionId = await iniciarEjecucion(cliente);
    await sincronizarIndicadores(cliente, fuentes);

    const hoy = fechaHoyArgentina(ahora);
    const resultados = [];
    for (const fuente of fuentes) {
      resultados.push(await procesarFuente(fuente, { cliente, ejecucionId, dirBase, fetch, ahora, hoy, obtenerAdaptador }));
    }
    const estado = estadoFinal(resultados);
    await cerrarEjecucion(cliente, ejecucionId, estado);
    return { ok: estado === 'ok', bloqueado: false, ejecucionId, resultados };
  } catch (err) {
    if (ejecucionId !== null) await cerrarEjecucion(cliente, ejecucionId, 'fallida').catch(() => {});
    throw err;
  } finally {
    await cliente.query('select pg_advisory_unlock($1)', [CLAVE_LOCK]).catch(() => {});
  }
}
