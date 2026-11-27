// Gráfico de líneas en SVG propio: guías, años, anotaciones de hechos, valor final y tooltip.
// Se dibuja al ancho real de su contenedor, así las letras quedan siempre del mismo tamaño en pantalla.
// En celular (menos de 600 px) las anotaciones pasan a marcas numeradas con su texto en una lista debajo.
import { useEffect, useRef, useState } from 'react';
import { fechaCorta, nombreMes } from '../logica/formato.js';

const ANCHO_POR_DEFECTO = 900;
const ANCHO_COMPACTO = 600;
const RENGLONES = [28, 72, 116];
const ANCHO_LETRA = 7.4;
const SEPARACION = 14;

// Redondea hacia arriba a 1, 2 o 5 × 10ⁿ para que las guías queden en números lindos.
export function techoLindo(v) {
  if (v <= 0) return 1;
  const potencia = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 5, 10].map((f) => f * potencia).find((c) => c >= v);
}

// Ancho real del contenedor (null si el navegador no tiene ResizeObserver, como en los tests).
function useAnchoMedido(ref) {
  const [ancho, setAncho] = useState(null);
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === 'undefined') return undefined;
    const observador = new ResizeObserver(([entrada]) => setAncho(Math.round(entrada.contentRect.width)));
    observador.observe(ref.current);
    return () => observador.disconnect();
  }, [ref]);
  return ancho;
}

// Ubica cada anotación en la franja de arriba: el primer renglón donde no se pise con otra.
function ubicarNotas(notas, ancho) {
  const ocupado = RENGLONES.map(() => []);
  return notas.map((n) => {
    const largo = Math.max(...n.lineas.map((l) => l.length)) * ANCHO_LETRA;
    const caja = (derecha) => {
      const x0 = derecha ? n.xi - 6 - largo : n.xi + 6;
      return { derecha, x0, x1: x0 + largo };
    };
    const preferida = n.xi > ancho / 2;
    const lados = [caja(preferida), caja(!preferida)].filter((c) => c.x0 >= 0 && c.x1 <= ancho);
    const libre = (r, c) => ocupado[r].every(([a0, a1]) => c.x1 + SEPARACION <= a0 || a1 + SEPARACION <= c.x0);
    let elegido = null;
    for (let r = 0; r < RENGLONES.length && !elegido; r++) {
      const c = lados.find((l) => libre(r, l));
      if (c) elegido = { ...c, renglon: r };
    }
    elegido ??= { ...(lados[0] ?? caja(preferida)), renglon: RENGLONES.length - 1 };
    ocupado[elegido.renglon].push([elegido.x0, elegido.x1]);
    return { ...n, derecha: elegido.derecha, x0: elegido.x0, x1: elegido.x1, yTexto: RENGLONES[elegido.renglon] };
  });
}

export function GraficoLineas({
  meses, series, anotaciones = [], inflacionPorAnio = [], formatoEje = (v) => String(v), formatoValor = (v) => String(v), descripcion,
  resaltada = null, ancho: anchoFijo,
}) {
  const contenedor = useRef(null);
  const medido = useAnchoMedido(contenedor);
  const [indice, setIndice] = useState(null);

  const ANCHO = Math.max(300, anchoFijo ?? medido ?? ANCHO_POR_DEFECTO);
  const compacto = ANCHO < ANCHO_COMPACTO;
  const ALTO = compacto ? 380 : 560;
  const X0 = compacto ? 46 : 52;
  const X1 = ANCHO - (compacto ? 62 : 76);
  const Y_BASE = ALTO - 90;
  const Y_TOPE = !compacto && anotaciones.length ? 178 : compacto ? 20 : 40;

  const todos = series.flatMap((s) => s.valores).filter((v) => v != null);
  const minimo = Math.min(0, ...todos);
  const maximo = techoLindo(Math.max(...todos, 0));
  const x = (i) => (meses.length < 2 ? (X0 + X1) / 2 : X0 + (i * (X1 - X0)) / (meses.length - 1));
  const y = (v) => Y_BASE - ((v - minimo) / (maximo - minimo)) * (Y_BASE - Y_TOPE);
  const claseLinea = (id) => (resaltada && resaltada !== id ? 'linea linea--apagada' : 'linea');

  const camino = (valores) => {
    let d = '';
    let cortado = true;
    valores.forEach((v, i) => {
      if (v == null) { cortado = true; return; }
      d += `${cortado ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
      cortado = false;
    });
    return d.trim();
  };

  const guias = (compacto ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1]).map((f) => minimo + f * (maximo - minimo));
  // Los puntos pueden ser meses ('AAAA-MM') o días ('AAAA-MM-DD'): el año se marca cuando cambia,
  // salteando los que quedarían muy pegados.
  let ultimoX = -Infinity;
  const anios = meses.map((m, i) => ({ m, i })).filter(({ m, i }) => {
    if (i > 0 && m.slice(0, 4) === meses[i - 1].slice(0, 4)) return false;
    if (x(i) - ultimoX < (compacto ? 42 : 48)) return false;
    ultimoX = x(i);
    return true;
  });
  const etiquetaPunto = (m) => (m.length === 7 ? nombreMes(m, { largo: true }) : fechaCorta(m));
  const centroDelAnio = (anio) => {
    const indices = meses.map((m, i) => (m.startsWith(anio) ? i : -1)).filter((i) => i >= 0);
    return indices.length ? x((indices[0] + indices.at(-1)) / 2) : null;
  };

  const ancladas = anotaciones
    .map((a) => {
      const i = meses.indexOf(a.mes);
      const v = series.find((s) => s.id === a.serie)?.valores[i];
      return i < 0 || v == null ? null : { ...a, xi: x(i), yv: y(v) };
    })
    .filter(Boolean)
    .sort((a, b) => a.xi - b.xi);
  const notas = compacto ? [] : ubicarNotas(ancladas, ANCHO);

  const alMover = (evento) => {
    const caja = evento.currentTarget.getBoundingClientRect();
    const xSvg = ((evento.clientX - caja.left) / caja.width) * ANCHO;
    const i = Math.round(((xSvg - X0) / (X1 - X0)) * (meses.length - 1));
    setIndice(Math.min(meses.length - 1, Math.max(0, i)));
  };

  return (
    <figure className="grafico" ref={contenedor}>
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" aria-label={descripcion} onPointerMove={alMover} onPointerLeave={() => setIndice(null)}>
        <g className="grafico__guias">
          {guias.map((v) => (
            <g key={v}>
              <line x1={X0} x2={X1} y1={y(v)} y2={y(v)} className={v === 0 ? 'cero' : ''} />
              <text x="0" y={y(v) + 4}>{formatoEje(v)}</text>
            </g>
          ))}
          {anios.map(({ m, i }) => (
            <text key={m} x={x(i)} y={Y_BASE + 32} textAnchor="middle" className="grafico__anio">{m.slice(0, 4)}</text>
          ))}
          {!compacto && inflacionPorAnio.map(({ anio, pct }) => {
            const cx = centroDelAnio(anio);
            return cx == null ? null : (
              <text key={anio} x={cx} y={Y_BASE + 54} textAnchor="middle">{`inflación ${Math.round(pct)} %`}</text>
            );
          })}
        </g>
        {series.map((s) => (
          <path key={s.id} className={claseLinea(s.id)} d={camino(s.valores)} fill="none" stroke={s.color} strokeWidth="2.5"
            strokeDasharray={s.punteada ? '6 5' : undefined} strokeLinejoin="round" />
        ))}
        <g className="grafico__notas">
          {notas.map((n) => (
            <g key={n.mes}>
              <line x1={n.xi} x2={n.xi} y1={n.yTexto - 12} y2={n.yv} />
              <circle cx={n.xi} cy={n.yv} r="3.5" />
              <text x={n.derecha ? n.xi - 6 : n.xi + 6} y={n.yTexto} textAnchor={n.derecha ? 'end' : 'start'}
                data-x0={n.x0.toFixed(1)} data-x1={n.x1.toFixed(1)} paintOrder="stroke" stroke="#EEF0EA" strokeWidth="4" strokeLinejoin="round">
                {n.lineas.map((l, k) => <tspan key={l} x={n.derecha ? n.xi - 6 : n.xi + 6} dy={k ? 18 : 0}>{l}</tspan>)}
              </text>
            </g>
          ))}
          {compacto && ancladas.map((n, k) => (
            <g key={n.mes} className="grafico__marca" aria-hidden="true">
              <circle cx={n.xi} cy={n.yv} r="10" />
              <text x={n.xi} y={n.yv + 4} textAnchor="middle">{k + 1}</text>
            </g>
          ))}
        </g>
        <g className="grafico__finales">
          {series.map((s) => {
            const ultimo = s.valores.findLastIndex((v) => v != null);
            return ultimo < 0 ? null : (
              <text key={s.id} className={resaltada && resaltada !== s.id ? 'final--apagado' : undefined}
                x={x(ultimo) + 6} y={y(s.valores[ultimo]) + 5} fill={s.colorTexto ?? s.color}>{formatoValor(s.valores[ultimo])}</text>
            );
          })}
        </g>
        {indice != null && (
          <line className="grafico__cursor" x1={x(indice)} x2={x(indice)} y1={Y_TOPE} y2={Y_BASE} />
        )}
      </svg>
      {compacto && ancladas.length > 0 && (
        <ol className="grafico__lista" aria-label="Qué pasó">
          {ancladas.map((n) => <li key={n.mes}>{n.lineas.join(' ')}</li>)}
        </ol>
      )}
      {indice != null && (
        <div className="grafico__tooltip" style={{ left: `${Math.min(80, Math.max(20, (x(indice) / ANCHO) * 100))}%` }}>
          <strong>{etiquetaPunto(meses[indice])}</strong>
          {series.map((s) => (
            <span key={s.id}><i style={{ background: s.color }} aria-hidden="true" />{s.nombre}: {s.valores[indice] == null ? 'sin dato' : formatoValor(s.valores[indice])}</span>
          ))}
        </div>
      )}
    </figure>
  );
}
