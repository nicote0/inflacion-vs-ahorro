// Errores de la API con un formato único: { error: { codigo, mensaje } }.

export class ErrorApi extends Error {
  constructor(status, codigo, mensaje) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.status = status;
    this.codigo = codigo;
  }
}

const cuerpo = (codigo, mensaje) => ({ error: { codigo, mensaje } });

// Nombre del parámetro que falló la validación de JSON Schema (ajv).
function parametroInvalido(validacion) {
  const [primero] = validacion;
  return primero?.instancePath?.replace(/^\//, '')
    || primero?.params?.missingProperty
    || primero?.params?.additionalProperty
    || 'desconocido';
}

export function manejarError(err, req, reply) {
  if (err instanceof ErrorApi) {
    return reply.status(err.status).send(cuerpo(err.codigo, err.message));
  }
  if (err.validation) {
    const parametro = parametroInvalido(err.validation);
    const codigo = req.routeOptions?.config?.codigosDeValidacion?.[parametro] ?? 'PARAMETRO_INVALIDO';
    const extra = err.validation[0]?.params?.additionalProperty;
    const mensaje = extra
      ? `El parámetro "${extra}" no existe en esta ruta.`
      : `El parámetro "${parametro}" falta o no tiene un formato válido.`;
    return reply.status(400).send(cuerpo(codigo, mensaje));
  }
  req.log.error(err);
  return reply.status(500).send(cuerpo('ERROR_INTERNO', 'Ocurrió un error interno'));
}

export function rutaInexistente(req, reply) {
  return reply.status(404).send(cuerpo('RUTA_INEXISTENTE', `No existe la ruta ${req.method} ${req.url.split('?')[0]}`));
}
