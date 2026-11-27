// Cuando cambia un monto, lo hace "contar" hasta el valor nuevo en vez de saltar.
// Sin animación si el sistema pide reducir movimiento (o si no hay matchMedia, como en los tests).
import { useEffect, useRef, useState } from 'react';

const DURACION_MS = 550;

function hayMovimiento() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useNumeroAnimado(valor) {
  const [mostrado, setMostrado] = useState(valor);
  const anterior = useRef(valor);

  useEffect(() => {
    const desde = anterior.current;
    anterior.current = valor;
    if (!hayMovimiento() || desde === valor) {
      setMostrado(valor);
      return undefined;
    }
    let cuadro;
    const inicio = performance.now();
    const paso = (ahora) => {
      const t = Math.min(1, (ahora - inicio) / DURACION_MS);
      const suave = 1 - (1 - t) ** 3;
      setMostrado(desde + (valor - desde) * suave);
      if (t < 1) cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [valor]);

  return hayMovimiento() ? mostrado : valor;
}
