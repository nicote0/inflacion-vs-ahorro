// Gráfico de líneas en SVG propio: guías, años, anotaciones de hechos, valor final y tooltip.
import { useState } from 'react';
import { fechaCorta, nombreMes } from '../logica/formato.js';

const ANCHO = 900;
const ALTO = 560;
const X0 = 40;
const X1 = 880;
const Y_BASE = 470;
// Con anotaciones, las líneas empiezan más abajo y arriba queda una franja de dos renglones para el texto.
const Y_TOPE_SIN_NOTAS = 40;
const Y_TOPE_CON_NOTAS = 178;
const RENGLONES = [28, 72, 116];
const ANCHO_LETRA = 7.4;
const SEPARACION = 14;

// Redondea hacia arriba a 1, 2 o 5 × 10ⁿ para que las guías queden en números lindos.
export function techoLindo(v) {
  if (v <= 0) return 1;
  const potencia = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 5, 10].map((f) => f * potencia).find((c) => c >= v);
}

export function GraficoLineas({
  meses, series, anotaciones = [], inflacionPorAnio = [], formatoEje = (v) => String(v), formatoValor = (v) => String(v), descripcion,
  resaltada = null,
}) {
  const claseLinea = (id) => (resaltada && resaltada !== id ? 'linea linea--apagada' : 'linea');
  const [indice, setIndice] = useState(null);
  const Y_TOPE = anotaciones.length ? Y_TOPE_CON_NOTAS : Y_TOPE_SIN_NOTAS;
  const todos = series.flatMap((s) => s.valores).filter((v) => v != null);
  const minimo = Math.min(0, ...todos);
  const maximo = techoLindo(Math.max(...todos, 0));
  const x = (i) => (meses.length < 2 ? (X0 + X1) / 2 : X0 + (i * (X1 - X0)) / (meses.length - 1));
  const y = (v) => Y_BASE - ((v - minimo) / (maximo - minimo)) * (Y_BASE - Y_TOPE);

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

  const guias = [0, 0.25, 0.5, 0.75, 1].map((f) => minimo + f * (maximo - minimo));
  // Los puntos pueden ser meses ('AAAA-MM') o días ('AAAA-MM-DD'): el año se marca cuando cambia.
  const anios = meses.map((m, i) => ({ m, i })).filter(({ m, i }) => i === 0 || m.slice(0, 4) !== meses[i - 1].slice(0, 4));
  const etiquetaPunto = (m) => (m.length === 7 ? nombreMes(m, { largo: true }) : fechaCorta(m));
  const centroDelAnio = (anio) => {
    const indices = meses.map((m, i) => (m.startsWith(anio) ? i : -1)).filter((i) => i >= 0);
    return indices.length ? x((indices[0] + indices.at(-1)) / 2) : null;
  };
  // Cada anotación va en la franja de arriba: primer renglón si entra, si no el segundo.
  const ocupado = RENGLONES.map(() => []);
  const notas = anotaciones
    .map((a) => {
      const i = meses.indexOf(a.mes);
      const v = series.find((s) => s.id === a.serie)?.valores[i];
      return i < 0 || v == null ? null : { ...a, xi: x(i), yv: y(v) };
    })
    .filter(Boolean)
    .sort((a, b) => a.xi - b.xi)
    .map((n) => {
      const ancho = Math.max(...n.lineas.map((l) => l.length)) * ANCHO_LETRA;
      const caja = (derecha) => {
        const x0 = derecha ? n.xi - 6 - ancho : n.xi + 6;
        return { derecha, x0, x1: x0 + ancho };
      };
      const preferida = n.xi > ANCHO / 2;
      // Lados posibles: primero el preferido; el otro solo si el texto entra en el ancho del gráfico.
      const lados = [caja(preferida), caja(!preferida)].filter((c) => c.x0 >= 0 && c.x1 <= ANCHO);
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

  const alMover = (evento) => {
    const caja = evento.currentTarget.getBoundingClientRect();
    const xSvg = ((evento.clientX - caja.left) / caja.width) * ANCHO;
    const i = Math.round(((xSvg - X0) / (X1 - X0)) * (meses.length - 1));
    setIndice(Math.min(meses.length - 1, Math.max(0, i)));
  };

  return (
    <figure className="grafico">
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" aria-label={descripcion} onPointerMove={alMover} onPointerLeave={() => setIndice(null)}>
        <g className="grafico__guias">
          {guias.map((v) => (
            <g key={v}>
              <line x1={X0} x2={X1} y1={y(v)} y2={y(v)} className={v === 0 ? 'cero' : ''} />
              <text x="0" y={y(v) + 4}>{formatoEje(v)}</text>
            </g>
          ))}
          {anios.map(({ m, i }) => (
            <text key={m} x={x(i)} y="502" textAnchor="middle" className="grafico__anio">{m.slice(0, 4)}</text>
          ))}
          {inflacionPorAnio.map(({ anio, pct }) => {
            const cx = centroDelAnio(anio);
            return cx == null ? null : (
              <text key={anio} x={cx} y="524" textAnchor="middle">{`inflación ${Math.round(pct)} %`}</text>
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
        </g>
        <g className="grafico__finales">
          {series.map((s) => {
            const ultimo = s.valores.findLastIndex((v) => v != null);
            return ultimo < 0 ? null : (
              <text key={s.id} className={resaltada && resaltada !== s.id ? 'final--apagado' : undefined}
                x={x(ultimo) + 8} y={y(s.valores[ultimo]) + 5} fill={s.colorTexto ?? s.color}>{formatoValor(s.valores[ultimo])}</text>
            );
          })}
        </g>
        {indice != null && (
          <line className="grafico__cursor" x1={x(indice)} x2={x(indice)} y1={Y_TOPE} y2={Y_BASE} />
        )}
      </svg>
      {indice != null && (
        <div className="grafico__tooltip" style={{ left: `${(x(indice) / ANCHO) * 100}%` }}>
          <strong>{etiquetaPunto(meses[indice])}</strong>
          {series.map((s) => (
            <span key={s.id}><i style={{ background: s.color }} aria-hidden="true" />{s.nombre}: {s.valores[indice] == null ? 'sin dato' : formatoValor(s.valores[indice])}</span>
          ))}
        </div>
      )}
    </figure>
  );
}
