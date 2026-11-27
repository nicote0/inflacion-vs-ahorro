import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import { crearApi } from './api.js';
import './estilos.css';

const api = crearApi({ base: import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3000' });

createRoot(document.getElementById('raiz')).render(
  <StrictMode>
    <App api={api} />
  </StrictMode>,
);
