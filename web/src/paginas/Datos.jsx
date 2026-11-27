// Vista Estado de los datos (#37): si cada fuente está al día, en texto y no solo con color.
import { useEffect, useState } from 'react';
import { fechaCorta } from '../logica/formato.js';

const ESTADOS = {
  vigente: { texto: 'Al día', clase: 'estado--ok' },
  desactualizado: { texto: 'Desactualizada', clase: 'estado--mal' },
  sin_datos: { texto: 'Sin datos', clase: 'estado--mal' },
  sin_verificar: { texto: 'Sin verificar', clase: 'estado--neutro' },
};

const atraso = (n) => (n == null ? '—' : `${n} ${n === 1 ? 'mes' : 'meses'} de atraso`);

export function Datos({ api }) {
  const [fuentes, setFuentes] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.frescura().then((r) => setFuentes(r.fuentes)).catch((err) => setError(err.message));
  }, [api]);

  return (
    <div className="datos">
      <h1 className="titulo-pagina">Estado de los datos</h1>
      <p className="secundario">
        Una fuente está al día si su último dato real es reciente: hasta 45 días después del fin del mes en las series
        mensuales (el INDEC publica el IPC a mediados del mes siguiente) y hasta 5 días en las diarias (cubre fines de semana
        largos). Las fuentes caídas o sin chequear también aparecen.
      </p>
      {error && <p className="aviso aviso--error" role="alert">{error}</p>}
      {!fuentes && !error && <p className="cargando">Cargando…</p>}
      {fuentes && (
        <div className="fuentes-estado">
          {fuentes.map((f) => {
            const estado = ESTADOS[f.estado] ?? ESTADOS.sin_verificar;
            return (
              <article key={f.id} aria-label={f.nombre} className="fuente">
                <div className="fuente__titulo">
                  <h2>{f.nombre}</h2>
                  <span className={`estado ${estado.clase}`}>{estado.texto}</span>
                </div>
                <dl>
                  <dt>Último dato real</dt><dd>{fechaCorta(f.ultimaObservacion)}</dd>
                  <dt>Fecha que declara la fuente</dt><dd>{fechaCorta(f.ultimaFechaDeclarada)}</dd>
                  <dt>Último chequeo</dt><dd>{fechaCorta(f.fechaChequeo)}</dd>
                  <dt>Atraso</dt><dd>{atraso(f.mesesDeAtraso)}</dd>
                </dl>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
