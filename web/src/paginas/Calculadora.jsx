// Pantalla principal: ¿qué le ganó a la inflación? (#48)
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Billete } from '../componentes/Billete.jsx';
import { useNumeroAnimado } from '../componentes/useNumeroAnimado.js';
import { GraficoLineas } from '../componentes/GraficoLineas.jsx';
import { anotacionesEn, inflacionAnual } from '../logica/anotaciones.js';
import { escribirConsulta, leerConsulta, leerMonto } from '../logica/consulta.js';
import { factor, fechaCorta, nombreMes, numero, pesos, porcentaje } from '../logica/formato.js';
import { ATAJOS, atajo, mesesEntre, sumarMeses } from '../logica/periodo.js';
import { ordenarOpciones, textoVeredicto } from '../logica/resultado.js';

export const COLORES = {
  dolar: { fondo: '#D6E2D9', tinta: '#24493A', acento: '#9A3A12', linea: '#24493A' },
  plazoFijo: { fondo: '#D9E1EF', tinta: '#1E3F8A', acento: '#9A3A12', linea: '#2856C4' },
  pesosQuietos: { fondo: '#F2DCCE', tinta: '#8F3612', acento: '#24493A', linea: '#D9622B', textoFinal: '#A8431A' },
};
const COLORES_INICIAL = { fondo: '#DCE4D6', tinta: '#24493A', acento: '#9A3A12' };
const DETALLE = {
  dolar: 'Comprado al promedio del mes inicial y valuado al del mes final.',
  plazoFijo: 'Renovado cada 30 días con la tasa de depósitos a 30 días.',
  pesosQuietos: 'El mismo monto guardado, sin invertir.',
};

// Monto que "cuenta" hasta el valor nuevo cuando cambia la consulta.
function Monto({ valor }) {
  return pesos(useNumeroAnimado(valor));
}

// El billete grande se inclina un poco siguiendo el mouse, como un billete mirado a contraluz.
function BilleteInclinable({ children }) {
  const [giro, setGiro] = useState({ x: 0, y: 0 });
  const mover = (e) => {
    if (e.pointerType !== 'mouse') return;
    const caja = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - caja.left) / caja.width - 0.5;
    const py = (e.clientY - caja.top) / caja.height - 0.5;
    setGiro({ x: -py * 8, y: px * 10 });
  };
  return (
    <div className="inclinable" onPointerMove={mover} onPointerLeave={() => setGiro({ x: 0, y: 0 })}
      style={{ '--giro-x': `${giro.x}deg`, '--giro-y': `${giro.y}deg` }}>
      {children}
    </div>
  );
}

const montoCompacto = (v) => {
  if (Math.abs(v) >= 1e6) return `$${numero(v / 1e6, 2)} M`;
  if (Math.abs(v) >= 1e4) return `$${numero(v / 1e3, 0)} mil`;
  return pesos(v);
};

function rangoDesdeIndicadores({ indicadores }) {
  const ipc = indicadores.find((i) => i.id === 'ipc_nacional');
  return { mesMinimo: ipc.desde.slice(0, 7), mesMaximo: ipc.hasta.slice(0, 7) };
}

export function Calculadora({ api, retraso = 400 }) {
  const [rango, setRango] = useState(null);
  const [consulta, setConsulta] = useState(null);
  const [montoTexto, setMontoTexto] = useState('');
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [ipc, setIpc] = useState([]);
  const [copiado, setCopiado] = useState(false);
  const [resaltada, setResaltada] = useState(null);
  const resaltar = (clave) => ({
    onMouseEnter: () => setResaltada(clave),
    onMouseLeave: () => setResaltada(null),
  });
  const ultimoPedido = useRef(0);
  const primeraConsulta = useRef(true);

  // El rango de meses sale de /indicadores (el IPC manda); con eso se valida la URL.
  useEffect(() => {
    let vigente = true;
    api.indicadores()
      .then((r) => {
        if (!vigente) return;
        const rangoApi = rangoDesdeIndicadores(r);
        const inicial = leerConsulta(window.location.search, rangoApi);
        setRango(rangoApi);
        setConsulta(inicial);
        setMontoTexto(numero(inicial.monto, 0));
      })
      .catch((err) => { if (vigente) { setError(err.message); setCargando(false); } });
    api.serie('ipc_nacional', {}).then((r) => { if (vigente) setIpc(r.datos); }).catch(() => {});
    return () => { vigente = false; };
  }, [api]);

  // Cada cambio de la consulta actualiza la URL y pide la simulación con un pequeño retraso.
  useEffect(() => {
    if (!consulta || consulta.monto == null) return undefined;
    window.history.replaceState(null, '', escribirConsulta(consulta));
    const espera = primeraConsulta.current ? 0 : retraso;
    primeraConsulta.current = false;
    const temporizador = setTimeout(() => {
      const pedido = ++ultimoPedido.current;
      setCargando(true);
      api.simulacion(consulta)
        .then((r) => { if (pedido === ultimoPedido.current) { setResultado(r); setError(null); } })
        .catch((err) => { if (pedido === ultimoPedido.current) setError(err.message); })
        .finally(() => { if (pedido === ultimoPedido.current) setCargando(false); });
    }, espera);
    return () => clearTimeout(temporizador);
  }, [api, consulta, retraso]);

  const meses = useMemo(() => (rango ? mesesEntre(rango.mesMinimo, rango.mesMaximo) : []), [rango]);
  const opciones = useMemo(() => (resultado ? ordenarOpciones(resultado.opciones) : []), [resultado]);

  const cambiarMonto = (texto) => {
    setMontoTexto(texto);
    setConsulta((c) => ({ ...c, monto: leerMonto(texto) }));
  };
  const cambiarDesde = (desde) => setConsulta((c) => ({ ...c, desde, hasta: c.hasta > desde ? c.hasta : sumarMeses(desde, 1) }));
  const cambiarHasta = (hasta) => setConsulta((c) => ({ ...c, hasta }));
  const usarAtajo = (id) => setConsulta((c) => ({ ...c, ...atajo(id, rango) }));
  const copiarLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };

  const atajoActivo = rango && consulta && ATAJOS.find((a) => {
    const p = atajo(a.id, rango);
    return p.desde === consulta.desde && p.hasta === consulta.hasta;
  })?.id;

  return (
    <div className="calculadora">
      <form className="consulta" aria-label="Tu consulta" onSubmit={(e) => e.preventDefault()}>
        <p className="consulta__oracion">
          Guardaste{' '}
          <span className="campo">
            <span aria-hidden="true">$</span>
            <input aria-label="Monto en pesos" value={montoTexto} inputMode="numeric" onChange={(e) => cambiarMonto(e.target.value)} disabled={!consulta} />
          </span>{' '}
          en{' '}
          <label className="campo">
            <span className="solo-lectores">Mes inicial</span>
            <select value={consulta?.desde ?? ''} onChange={(e) => cambiarDesde(e.target.value)} disabled={!consulta}>
              {meses.slice(0, -1).map((m) => <option key={m} value={m}>{nombreMes(m, { largo: true })}</option>)}
            </select>
          </label>{' '}
          y los miraste en{' '}
          <label className="campo">
            <span className="solo-lectores">Mes final</span>
            <select value={consulta?.hasta ?? ''} onChange={(e) => cambiarHasta(e.target.value)} disabled={!consulta}>
              {meses.filter((m) => !consulta || m > consulta.desde).map((m) => <option key={m} value={m}>{nombreMes(m, { largo: true })}</option>)}
            </select>
          </label>.
        </p>
        {consulta && consulta.monto == null && <p className="aviso">Ingresá un monto mayor que 0</p>}
        {error && <p className="aviso aviso--error" role="alert">{error}</p>}
        <div className="atajos">
          <span>Atajos</span>
          {ATAJOS.map((a) => (
            <button key={a.id} type="button" className={`pildora${atajoActivo === a.id ? ' pildora--activa' : ''}`}
              aria-pressed={atajoActivo === a.id} onClick={() => usarAtajo(a.id)} disabled={!rango}>{a.texto}</button>
          ))}
        </div>
      </form>

      {consulta && consulta.monto != null && (
        <figure className="billete-inicial">
          <BilleteInclinable>
            <Billete monto={consulta.monto} mes={consulta.desde} colores={COLORES_INICIAL} />
          </BilleteInclinable>
          <figcaption>Tus {pesos(consulta.monto)} de {nombreMes(consulta.desde, { largo: true })}, enteros. Más abajo, lo que quedó de ellos según dónde los pusiste.</figcaption>
        </figure>
      )}

      {resultado && (
        <div className={cargando ? 'resultado resultado--cargando' : 'resultado'} aria-busy={cargando}>
          <section className="opciones" aria-label="Lo que quedó de cada opción">
            {opciones.map((o) => (
              <article key={o.clave} className={resaltada && resaltada !== o.clave ? 'opcion opcion--apagada' : 'opcion'}
                aria-label={o.nombre} {...resaltar(o.clave)}>
                <span className="opcion__puesto">{o.puesto}</span>
                <Billete monto={o.valorFinalNominal} mes={consulta.hasta} perdido={o.perdido}
                  ganoPct={o.gano ? o.resultadoRealPct : null} colores={COLORES[o.clave]} />
                <h2>{o.nombre}</h2>
                <p className="secundario">{DETALLE[o.clave]}</p>
                <dl>
                  <dt>Tenés hoy</dt><dd className="cifra cifra--grande"><Monto valor={o.valorFinalNominal} /></dd>
                  <dt>Vale en {consulta.desde.slice(0, 4)}</dt><dd className="cifra"><Monto valor={o.valorReal} /></dd>
                </dl>
                <p className={o.gano ? 'resultado-texto resultado-texto--gano' : 'resultado-texto'}>
                  {o.gano ? `Le ganó ${porcentaje(o.resultadoRealPct)} a la inflación` : `Perdió ${porcentaje(o.resultadoRealPct)} contra la inflación`}
                </p>
              </article>
            ))}
          </section>

          <section className="veredicto" aria-labelledby="veredicto">
            <h1 id="veredicto">{textoVeredicto(opciones)}</h1>
            <p>
              Los precios se multiplicaron por <strong className="cifra">{factor(resultado.factorInflacion)}</strong>.
              Lo que en {nombreMes(consulta.desde, { largo: true })} costaba {pesos(consulta.monto)}, en{' '}
              {nombreMes(consulta.hasta, { largo: true })} costaba <strong className="cifra">{pesos(consulta.monto * resultado.factorInflacion)}</strong>.
            </p>
          </section>

          <section className="caida" aria-labelledby="titulo-caida">
            <div className="caida__encabezado">
              <div>
                <h2 id="titulo-caida">Cómo fue cayendo</h2>
                <p className="secundario">Cuánto valían tus {pesos(consulta.monto)} cada mes, en pesos de {nombreMes(consulta.hasta, { largo: true })}.</p>
              </div>
              <ul className="leyenda" aria-label="Referencias">
                <li {...resaltar('dolar')}><i style={{ background: COLORES.dolar.linea }} aria-hidden="true" />Dólar oficial</li>
                <li {...resaltar('plazoFijo')}><i style={{ background: COLORES.plazoFijo.linea }} aria-hidden="true" />Plazo fijo</li>
                <li {...resaltar('pesosQuietos')}><i className="punteada" style={{ borderColor: COLORES.pesosQuietos.linea }} aria-hidden="true" />Pesos quietos</li>
              </ul>
            </div>
            <GraficoLineas
              meses={resultado.evolucion.map((e) => e.mes)}
              series={[
                { id: 'dolar', nombre: 'Dólar oficial', color: COLORES.dolar.linea, valores: resultado.evolucion.map((e) => e.dolar) },
                { id: 'plazoFijo', nombre: 'Plazo fijo', color: COLORES.plazoFijo.linea, valores: resultado.evolucion.map((e) => e.plazoFijo) },
                { id: 'pesosQuietos', nombre: 'Pesos quietos', color: COLORES.pesosQuietos.linea, colorTexto: COLORES.pesosQuietos.textoFinal, punteada: true, valores: resultado.evolucion.map((e) => e.pesosQuietos) },
              ]}
              anotaciones={anotacionesEn(consulta.desde, consulta.hasta)}
              inflacionPorAnio={inflacionAnual(ipc, consulta.desde, consulta.hasta)}
              formatoEje={montoCompacto}
              formatoValor={montoCompacto}
              resaltada={resaltada}
              descripcion={`Evolución mes a mes de las tres opciones entre ${nombreMes(consulta.desde, { largo: true })} y ${nombreMes(consulta.hasta, { largo: true })}, en pesos del mes final.`}
            />
          </section>

          <section className="desplegables">
            <details>
              <summary>De dónde salen los datos</summary>
              <p>Solo fuentes oficiales. Se descargan solas todos los días; nada se carga a mano y los datos faltantes no se rellenan.</p>
              <ul className="fuentes">
                <li><strong>Inflación (IPC nacional)</strong><br />INDEC, por la API de series de datos.gob.ar · mensual · último dato: {nombreMes(resultado.datosHasta.ipc.slice(0, 7))}<br />
                  <a href="https://apis.datos.gob.ar/series/api/series/?ids=148.3_INIVELNAL_DICI_M_26&format=csv">Ver la serie original</a></li>
                <li><strong>Dólar oficial minorista (venta)</strong><br />BCRA, estadísticas monetarias · diaria · último dato: {fechaCorta(resultado.datosHasta.dolar)}<br />
                  <a href="https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/4">Ver la serie original</a></li>
                <li><strong>Tasa de plazo fijo a 30 días</strong><br />BCRA, estadísticas monetarias · diaria · último dato: {fechaCorta(resultado.datosHasta.tasa)}<br />
                  <a href="https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/12">Ver la serie original</a></li>
              </ul>
              <p><Link to="/datos">Ver si cada fuente está al día →</Link></p>
            </details>
            <details>
              <summary>Cómo se calcula</summary>
              <ul>
                <li><strong>Inflación:</strong> IPC del mes final dividido por el IPC del mes inicial.</li>
                <li><strong>Plazo fijo:</strong> se renueva cada 30 días con la tasa de ese día (depósitos a 30 días, BCRA). Un último tramo de menos de 30 días no suma intereses.</li>
                <li><strong>Dólar oficial:</strong> comprado al promedio del mes inicial y valuado al promedio del mes final, precio de venta.</li>
                <li><strong>Pesos quietos:</strong> el monto no cambia; pierde lo que sube la inflación.</li>
                <li>Sin impuestos ni comisiones. No incluye dólar blue, MEP ni CCL.</li>
              </ul>
            </details>
            <details>
              <summary>Compartir esta consulta</summary>
              <p>El link guarda el período y el monto.</p>
              <p className="link-consulta">{window.location.href}</p>
              <button type="button" className="pildora" onClick={copiarLink}>{copiado ? 'Link copiado' : 'Copiar link'}</button>
            </details>
          </section>
        </div>
      )}
      {!resultado && cargando && !error && <p className="cargando">Calculando…</p>}
    </div>
  );
}
