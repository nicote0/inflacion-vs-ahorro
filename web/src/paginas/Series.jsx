// Vista Series (#36, #38): una serie o dos comparadas, con la tabla de lo graficado y el CSV.
import { useEffect, useMemo, useState } from 'react';
import { GraficoLineas } from '../componentes/GraficoLineas.jsx';
import { armarCsv, descargarCsv, nombreCsv } from '../logica/csv.js';
import { fechaCorta, nombreMes, numero } from '../logica/formato.js';
import { ATAJOS, atajo, mesesEntre } from '../logica/periodo.js';

const COLORES = ['#24493A', '#2856C4'];

export function Series({ api }) {
  const [indicadores, setIndicadores] = useState([]);
  const [primario, setPrimario] = useState('');
  const [secundario, setSecundario] = useState('');
  const [medida, setMedida] = useState('variacion_mensual');
  const [periodo, setPeriodo] = useState(null);
  const [vista, setVista] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api.indicadores()
      .then(({ indicadores: lista }) => {
        setIndicadores(lista);
        const primero = lista[0];
        setPrimario(primero.id);
        setPeriodo(atajo('desde2020', { mesMinimo: primero.desde.slice(0, 7), mesMaximo: primero.hasta.slice(0, 7) }));
      })
      .catch((err) => { setError(err.message); setCargando(false); });
  }, [api]);

  const indicador = indicadores.find((i) => i.id === primario);
  const rango = indicador ? { mesMinimo: indicador.desde.slice(0, 7), mesMaximo: indicador.hasta.slice(0, 7) } : null;
  const meses = useMemo(() => (rango ? mesesEntre(rango.mesMinimo, rango.mesMaximo) : []), [rango?.mesMinimo, rango?.mesMaximo]);

  useEffect(() => {
    if (!primario || !periodo) return;
    let vigente = true;
    setCargando(true);
    const pedido = secundario
      ? api.comparativa({ indicadores: [primario, secundario], desde: periodo.desde, hasta: periodo.hasta, medida }).then((r) => ({
        tipo: 'comparativa',
        puntos: r.meses,
        columnas: [{ titulo: 'Mes', clave: 'mes', tipo: 'texto' }, ...r.series.map((s) => ({ titulo: `${s.nombre} (${s.unidad})`, clave: s.id, tipo: 'numero' }))],
        filas: r.meses.map((mes, i) => Object.fromEntries([['mes', mes], ...r.series.map((s) => [s.id, s.valores[i]])])),
        series: r.series.map((s, k) => ({ id: s.id, nombre: s.nombre, color: COLORES[k], valores: s.valores })),
        unidadesDistintas: r.unidadesDistintas,
      }))
      : api.serie(primario, { desde: `${periodo.desde}-01`, hasta: `${periodo.hasta}-31` }).then((r) => {
        const mensual = r.indicador.periodicidad === 'mensual';
        return {
          tipo: 'serie',
          puntos: r.datos.map((d) => (mensual ? d.fecha.slice(0, 7) : d.fecha)),
          columnas: [{ titulo: mensual ? 'Mes' : 'Fecha', clave: 'fecha', tipo: 'texto' }, { titulo: `${r.indicador.nombre} (${r.indicador.unidad})`, clave: 'valor', tipo: 'numero' }],
          filas: r.datos.map((d) => ({ fecha: mensual ? d.fecha.slice(0, 7) : d.fecha, valor: d.valor })),
          series: [{ id: primario, nombre: r.indicador.nombre, color: COLORES[0], valores: r.datos.map((d) => d.valor) }],
        };
      });
    pedido
      .then((v) => { if (vigente) { setVista(v); setError(null); } })
      .catch((err) => { if (vigente) setError(err.message); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [api, primario, secundario, medida, periodo]);

  const textoPunto = (p) => (p.length === 7 ? nombreMes(p, { largo: true }) : fechaCorta(p));
  const descargar = () => descargarCsv(nombreCsv(secundario ? `${primario}_vs_${secundario}` : primario, periodo.desde, periodo.hasta), armarCsv(vista.columnas, vista.filas));
  const atajoActivo = rango && periodo && ATAJOS.find((a) => {
    const p = atajo(a.id, rango);
    return p.desde === periodo.desde && p.hasta === periodo.hasta;
  })?.id;

  return (
    <div className="series">
      <h1 className="titulo-pagina">Series</h1>
      <p className="secundario">Cada serie tal como la publica su fuente, o dos comparadas mes a mes. Debajo del gráfico, la tabla con los mismos datos para descargar.</p>

      <form className="filtros" aria-label="Filtros" onSubmit={(e) => e.preventDefault()}>
        <label>Indicador
          <select value={primario} onChange={(e) => { setPrimario(e.target.value); if (e.target.value === secundario) setSecundario(''); }}>
            {indicadores.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
          </select>
        </label>
        <label>Comparar con
          <select value={secundario} onChange={(e) => setSecundario(e.target.value)}>
            <option value="">Nada</option>
            {indicadores.filter((i) => i.id !== primario).map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
          </select>
        </label>
        {secundario && (
          <label>Medida
            <select value={medida} onChange={(e) => setMedida(e.target.value)}>
              <option value="variacion_mensual">Variación % mensual</option>
              <option value="nivel">Valor mensual</option>
            </select>
          </label>
        )}
        <label>Desde
          <select value={periodo?.desde ?? ''} onChange={(e) => setPeriodo((p) => ({ ...p, desde: e.target.value }))}>
            {meses.filter((m) => !periodo || m < periodo.hasta).map((m) => <option key={m} value={m}>{nombreMes(m, { largo: true })}</option>)}
          </select>
        </label>
        <label>Hasta
          <select value={periodo?.hasta ?? ''} onChange={(e) => setPeriodo((p) => ({ ...p, hasta: e.target.value }))}>
            {meses.filter((m) => !periodo || m > periodo.desde).map((m) => <option key={m} value={m}>{nombreMes(m, { largo: true })}</option>)}
          </select>
        </label>
        <div className="atajos">
          {ATAJOS.map((a) => (
            <button key={a.id} type="button" className={`pildora${atajoActivo === a.id ? ' pildora--activa' : ''}`}
              aria-pressed={atajoActivo === a.id} onClick={() => setPeriodo(atajo(a.id, rango))} disabled={!rango}>{a.texto}</button>
          ))}
        </div>
      </form>

      {error && <p className="aviso aviso--error" role="alert">{error}</p>}
      {cargando && !vista && <p className="cargando">Cargando…</p>}
      {vista && medida === 'nivel' && vista.unidadesDistintas && (
        <p className="aviso">Ojo: las dos series tienen unidades distintas, así que el valor de una no se compara directo con el de la otra.</p>
      )}
      {vista && vista.filas.length === 0 && <p className="aviso">No hay datos para ese período</p>}
      {vista && vista.filas.length > 0 && (
        <div className={cargando ? 'resultado resultado--cargando' : 'resultado'} aria-busy={cargando}>
          <GraficoLineas meses={vista.puntos} series={vista.series} formatoEje={(v) => numero(v, 2)} formatoValor={(v) => numero(v, 2)}
            descripcion={`Gráfico de ${vista.series.map((s) => s.nombre).join(' y ')}`} />
          <div className="tabla-encabezado">
            <h2>Los datos del gráfico</h2>
            <button type="button" className="pildora" onClick={descargar}>Descargar CSV</button>
          </div>
          <div className="tabla-caja">
            <table>
              <thead>
                <tr>{vista.columnas.map((c) => <th key={c.clave} scope="col" className={c.tipo === 'numero' ? 'numero' : undefined}>{c.titulo}</th>)}</tr>
              </thead>
              <tbody>
                {vista.filas.map((f) => (
                  <tr key={f[vista.columnas[0].clave]}>
                    {vista.columnas.map((c) => (
                      <td key={c.clave} className={c.tipo === 'numero' ? 'numero' : undefined}>
                        {c.tipo === 'numero' ? (f[c.clave] == null ? '—' : numero(f[c.clave], 4)) : textoPunto(f[c.clave])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
