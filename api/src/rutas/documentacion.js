// Documentación de la API: el documento OpenAPI en /docs/json y una página con Swagger UI en /docs.
// Swagger UI se carga desde un CDN con versión fija: así la API no depende de @fastify/static,
// que no carga en las funciones de Vercel.
const SWAGGER_UI = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14';

const PAGINA = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Documentación de la API · inflacion-vs-ahorro</title>
<link rel="stylesheet" href="${SWAGGER_UI}/swagger-ui.css">
</head>
<body>
<div id="swagger-ui"></div>
<script src="${SWAGGER_UI}/swagger-ui-bundle.js"></script>
<script>
  // Ruta relativa: funciona igual en /docs (local) y en /api/docs (Vercel).
  window.ui = SwaggerUIBundle({ url: 'docs/json', dom_id: '#swagger-ui' });
</script>
</body>
</html>
`;

export default async function rutasDocumentacion(app) {
  app.get('/docs/json', { schema: { hide: true } }, async () => app.swagger());
  app.get('/docs', { schema: { hide: true } }, async (req, reply) => reply.type('text/html; charset=utf-8').send(PAGINA));
}
