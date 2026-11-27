// Cliente de la API de M3. Los errores llegan siempre como ErrorApi { codigo, message, status }.

export class ErrorApi extends Error {
  constructor(codigo, mensaje, status) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.codigo = codigo;
    this.status = status;
  }
}

export function crearApi({ base, fetch = globalThis.fetch.bind(globalThis) }) {
  async function pedir(ruta, parametros = {}) {
    const definidos = Object.entries(parametros).filter(([, v]) => v !== undefined && v !== null && v !== '');
    const consulta = definidos.length ? `?${new URLSearchParams(definidos.map(([k, v]) => [k, String(v)]))}` : '';
    let respuesta;
    try {
      respuesta = await fetch(`${base}${ruta}${consulta}`);
    } catch {
      throw new ErrorApi('SIN_CONEXION', 'No se pudo conectar con la API.', 0);
    }
    const cuerpo = await respuesta.json().catch(() => null);
    if (!respuesta.ok) {
      throw new ErrorApi(cuerpo?.error?.codigo ?? 'ERROR_INTERNO', cuerpo?.error?.mensaje ?? 'Ocurrió un error inesperado.', respuesta.status);
    }
    return cuerpo;
  }

  return {
    simulacion: ({ desde, hasta, monto }) => pedir('/simulacion', { desde, hasta, monto }),
    indicadores: () => pedir('/indicadores'),
    serie: (id, { desde, hasta } = {}) => pedir(`/series/${encodeURIComponent(id)}`, { desde, hasta }),
    comparativa: ({ indicadores, desde, hasta, medida }) =>
      pedir('/comparativa', { indicadores: indicadores.join(','), desde, hasta, medida }),
    frescura: () => pedir('/frescura'),
  };
}
