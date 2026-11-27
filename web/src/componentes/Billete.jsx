// Billete ilustrado: inspirado en la serie argentina de animales, sin copiar ningún billete real.
// Sin número de serie, sin monto en letras y sin "República Argentina" ni "Banco Central":
// dice "INFLACIÓN VS AHORRO" y "MUESTRA SIN VALOR" para que nunca pase por un billete.
import { useId } from 'react';
import { mesEnMayusculas, pesos, porcentaje } from '../logica/formato.js';
import { useNumeroAnimado } from './useNumeroAnimado.js';

const ANCHO = 460;
const ALTO = 200;

const TRAMAS = Array.from({ length: 12 }, (_, i) => ({ rx: 64 + i * 7, ry: 78 + i * 6 }));
const ONDAS = Array.from({ length: 6 }, (_, k) => {
  const y0 = 74 + k * 6;
  let d = `M176 ${y0}`;
  for (let x = 176; x < 352; x += 16) d += ` Q${x + 8} ${y0 + (k % 2 ? 4 : -4)} ${x + 16} ${y0}`;
  return d;
});
const RAYOS = Array.from({ length: 16 }, (_, j) => {
  const a = (j / 16) * Math.PI * 2;
  const largo = j % 2 ? 15 : 19;
  return { x1: Math.cos(a) * 10, y1: Math.sin(a) * 10, x2: Math.cos(a) * largo, y2: Math.sin(a) * largo };
});

// Tamaño del monto para que entre en el ancho del billete sin pisar el óvalo.
function tamanioMonto(texto) {
  const cifras = texto.replace(/[^0-9]/g, '').length;
  const puntos = texto.length - cifras - 1;
  return Math.min(58, 266 / (cifras * 0.6 + puntos * 0.28 + 0.62));
}

export function Billete({ monto, mes, perdido = 0, ganoPct = null, colores }) {
  const { fondo, tinta, acento } = colores;
  const idPatron = `rayas-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const texto = pesos(monto);
  const textoMostrado = pesos(useNumeroAnimado(monto));
  const lavado = ganoPct == null ? perdido : 0;
  const xLavado = ANCHO * (1 - lavado / 100);
  const fecha = mesEnMayusculas(mes);
  const descripcion = `Billete de ${texto} de ${fecha.toLowerCase()}`
    + (ganoPct != null ? `, entero: le ganó ${porcentaje(ganoPct)} a la inflación`
      : lavado > 0 ? `, con el ${lavado} por ciento desteñido por la inflación` : ', entero');
  const tam = tamanioMonto(texto);

  return (
    <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" aria-label={descripcion} className="billete">
      <defs>
        <pattern id={idPatron} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="7" stroke="#5A665F" strokeWidth="0.8" strokeOpacity="0.35" />
        </pattern>
      </defs>
      <rect width={ANCHO} height={ALTO} rx="9" fill={fondo} />
      <g fill="none" stroke={tinta} strokeOpacity="0.16" strokeWidth="0.7">
        {TRAMAS.map((t) => <ellipse key={t.rx} cx="96" cy="100" rx={t.rx} ry={t.ry} />)}
        {ONDAS.map((d) => <path key={d} d={d} />)}
      </g>
      <rect x="8" y="8" width="444" height="184" rx="6" fill="none" stroke={tinta} strokeWidth="1.4" />
      <rect x="12" y="12" width="436" height="176" rx="4" fill="none" stroke={tinta} strokeWidth="0.5" strokeOpacity="0.6" />

      <ellipse cx="96" cy="100" rx="58" ry="72" fill={fondo} stroke={tinta} strokeWidth="1.4" />
      <ellipse cx="96" cy="100" rx="52" ry="66" fill="none" stroke={tinta} strokeWidth="0.5" strokeOpacity="0.7" />
      <g fill={tinta} aria-hidden="true">
        <line x1="62" y1="146" x2="134" y2="146" stroke={tinta} strokeWidth="2.2" strokeLinecap="round" />
        <line x1="94" y1="124" x2="90" y2="145" stroke={tinta} strokeWidth="1.6" />
        <line x1="103" y1="124" x2="105" y2="145" stroke={tinta} strokeWidth="1.6" />
        <ellipse cx="99" cy="110" rx="27" ry="17" transform="rotate(-14 99 110)" />
        <path d="M120 103 L150 92 L146 110 Z" />
        <circle cx="73" cy="89" r="11.5" />
        <path d="M62 86 L46 90 L62 93 Z" />
        <circle cx="70" cy="86.5" r="1.8" fill={fondo} />
        <path d="M84 104 Q100 94 118 104" fill="none" stroke={fondo} strokeWidth="1.2" strokeOpacity="0.8" />
      </g>
      <g transform="translate(406 66)" stroke={acento} strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
        {RAYOS.map((r, i) => <line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} />)}
        <circle r="9" fill={fondo} strokeWidth="1.4" />
        <circle cx="-3" cy="-2" r="0.9" fill={acento} stroke="none" />
        <circle cx="3" cy="-2" r="0.9" fill={acento} stroke="none" />
        <path d="M-3.5 3 Q0 5.5 3.5 3" fill="none" strokeWidth="0.9" />
      </g>

      {lavado > 0 && (
        <g className="billete__lavado" key={`${monto}-${lavado}`}>
          <rect className="billete__velo" x={xLavado} width={ANCHO - xLavado} height={ALTO} fill="#EEF0EA" fillOpacity="0.82" />
          <rect x={xLavado} width={ANCHO - xLavado} height={ALTO} fill={`url(#${idPatron})`} />
          <line x1={xLavado} y1="0" x2={xLavado} y2={ALTO} stroke="#5A665F" strokeWidth="1.6" strokeDasharray="5 4" />
        </g>
      )}

      <g fontFamily="Figtree, sans-serif" fill={tinta}>
        <text x="176" y="40" fontSize="13" fontWeight="800" letterSpacing="3">INFLACIÓN VS AHORRO</text>
        <text x="96" y="186" textAnchor="middle" fontSize="7.5" letterSpacing="1.6">HORNERO</text>
        <text x="176" y="186" fontSize="7" letterSpacing="2.2" fillOpacity="0.75">{`MUESTRA SIN VALOR · ${fecha}`}</text>
      </g>
      <g fontFamily="'Bodoni Moda', serif" fontWeight="700" fontSize={tam} letterSpacing="-1">
        <text x="174" y="134" fill={fondo} stroke={fondo} strokeWidth="6" strokeLinejoin="round" aria-hidden="true">{textoMostrado}</text>
        <text x="174" y="134" fill={tinta}>{textoMostrado}</text>
      </g>
      {lavado > 0 && (
        <text x="448" y="182" textAnchor="end" fontFamily="Figtree, sans-serif" fontSize="12.5" fontWeight="700" fill="#2F3A34">
          {`${lavado} % se lo comió la inflación`}
        </text>
      )}
      {ganoPct != null && (
        <text x="448" y="182" textAnchor="end" fontFamily="Figtree, sans-serif" fontSize="13" fontWeight="700" fill="#24493A">
          {`le ganó ${porcentaje(ganoPct)}`}
        </text>
      )}
    </svg>
  );
}
