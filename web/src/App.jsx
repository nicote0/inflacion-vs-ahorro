// Estructura común: encabezado con navegación, la página de la ruta y el pie con la fecha de los datos.
import { useEffect, useState } from 'react';
import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom';
import { Calculadora } from './paginas/Calculadora.jsx';
import { Series } from './paginas/Series.jsx';
import { Datos } from './paginas/Datos.jsx';
import { fechaCorta, nombreMes } from './logica/formato.js';

const ETIQUETAS = { ipc_nacional: 'IPC (INDEC)', dolar_minorista: 'Dólar (BCRA)', tasa_plazo_fijo_30d: 'Tasa (BCRA)' };

function Pie({ api }) {
  const [fuentes, setFuentes] = useState([]);
  useEffect(() => { api.frescura().then((r) => setFuentes(r.fuentes)).catch(() => setFuentes([])); }, [api]);
  const partes = fuentes.filter((f) => f.ultimaObservacion).map((f) => (
    `${ETIQUETAS[f.id] ?? f.nombre} ${f.id === 'ipc_nacional' ? nombreMes(f.ultimaObservacion.slice(0, 7)) : fechaCorta(f.ultimaObservacion)}`
  ));
  return (
    <footer className="pie">
      <div className="contenedor pie__contenido">
        <p>{partes.length ? `Datos hasta: ${partes.join(' · ')}` : 'Datos oficiales del INDEC y el BCRA.'}</p>
        <p>Muestra lo que pasó, no lo que conviene. No es una recomendación de inversión.</p>
      </div>
    </footer>
  );
}

export function Marco({ api, children }) {
  const clase = ({ isActive }) => (isActive ? 'pildora pildora--activa' : 'pildora');
  return (
    <>
      <header className="encabezado">
        <div className="contenedor encabezado__contenido">
          <Link to="/" className="logo">
            <span className="logo__billete" aria-hidden="true" />
            <span>inflación vs ahorro</span>
          </Link>
          <nav aria-label="Secciones" className="navegacion">
            <NavLink to="/" end className={clase}>Calculadora</NavLink>
            <NavLink to="/series" className={clase}>Series</NavLink>
            <NavLink to="/datos" className={clase}>Estado de los datos</NavLink>
          </nav>
        </div>
      </header>
      <main className="contenedor principal">{children}</main>
      <Pie api={api} />
    </>
  );
}

export function App({ api }) {
  return (
    <BrowserRouter>
      <Marco api={api}>
        <Routes>
          <Route path="/" element={<Calculadora api={api} />} />
          <Route path="/series" element={<Series api={api} />} />
          <Route path="/datos" element={<Datos api={api} />} />
        </Routes>
      </Marco>
    </BrowserRouter>
  );
}
