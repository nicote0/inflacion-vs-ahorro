# Diseño: M5 Automatización y despliegue

Fecha: 2026-11-27. Estado: aprobado por Nico el 2026-11-27 (enfoque de dos proyectos en Vercel).

Issues: #39 (workflow diario), #40 (front), #41 (API), #42 (Docker Compose) y #43 (README final). Diseños anteriores: M2 (`2026-11-26-m2-base-y-carga-design.md`), M3 (`2026-11-27-m3-api-design.md`) y M4 (`2026-11-27-m4-dashboard-design.md`).

## Intención

Poner el proyecto online con un link para el CV y que los datos se actualicen solos todos los días, sin que nadie toque nada. Costo cero.

## Objetivos

- Un workflow de GitHub Actions que corre el pipeline todos los días y se puede correr a mano.
- La web y la API publicadas en Vercel, plan gratuito, con deploy automático al hacer push a `main`.
- Para el navegador, todo en un solo dominio: la web sirve `/api/*` reenviando a la API.
- `docker compose up` levanta base, API y web en cualquier compu, y el pipeline corre contra esa base.
- README final con arquitectura, fuentes, problemas encontrados, links y cómo correrlo.

## No objetivos

- Dominio propio (se usa `*.vercel.app`; un dominio es pago y queda a decisión de Nico).
- Monitoreo o alertas externas: el historial de Actions y `control.ejecucion` son la evidencia.
- Rate limit por IP: se evalúa al final si el plan gratuito de Vercel lo incluye; no es requisito.

## Anti-objetivos

- Credenciales en el repo o en el workflow. Todo sale de GitHub Secrets o de las variables de entorno de Vercel.
- Que Claude vea las URLs de Neon: las carga Nico en los paneles.
- Algo que genere costo. Si un paso pidiera tarjeta, se frena y se busca otra forma.

## Enfoques considerados

1. **Elegido: dos proyectos de Vercel con reenvío.** Proyecto `web` (raíz `web/`, build de Vite) y proyecto `api` (raíz `api/`, una función). La web reenvía `/api/:ruta*` a la API con un rewrite. El navegador ve un solo dominio (sin CORS) y el CDN cachea las respuestas de la API.
2. Un solo proyecto con front y función juntos: en un monorepo con workspaces, la carpeta `api/` se confunde con la carpeta especial de funciones de Vercel y obliga a reorganizar el repo.
3. Fastify con detección automática ("zero-config") de Vercel: la documentación no deja claro cómo detecta el punto de entrada en un monorepo, así que se usa una función explícita, que es predecible.

Elegido por Claude, con OK de Nico.

## API en Vercel (#41)

- Proyecto de Vercel con **Root Directory `api`**. Dentro, la función `api/api/[[...ruta]].js` recibe todo lo que empieza con `/api`.
- La función arma la app una sola vez por instancia (`crearApp` con el cargador de la foto de M3), le saca el prefijo `/api` a la URL y le pasa el pedido a Fastify (`await app.ready(); app.server.emit('request', req, res)`).
- Variables en Vercel, que carga Nico: `DATABASE_URL_POOLED` (la URL de Neon **con** `-pooler`) y, opcional, `CORS_ORIGENES`.
- La foto en memoria y el `Cache-Control` de M3 siguen igual: el CDN de Vercel respeta `s-maxage`.
- Verificación: los cinco endpoints responden en la URL pública del proyecto `api` y a través de la web.

## Web en Vercel (#40)

- Proyecto de Vercel con **Root Directory `web`**, framework Vite, salida `dist`.
- `web/vercel.json` con dos rewrites: `/api/:ruta*` hacia `https://<proyecto-api>.vercel.app/api/:ruta*`, y todo lo demás hacia `/index.html` (para que `/series` y `/datos` funcionen al recargar).
- `web/.env.production` con `VITE_API_URL=/api` (no es secreto, va al repo). En desarrollo sigue `http://127.0.0.1:3000`.
- Deploy automático en cada push a `main` (comportamiento por defecto de Vercel con GitHub).

## Workflow diario (#39)

- `.github/workflows/pipeline.yml`: `schedule` todos los días a las 13:00 UTC (10:00 en Argentina, con los datos del día anterior del BCRA ya publicados) y `workflow_dispatch` para correrlo a mano.
- Pasos: checkout, Node 24 con caché de npm, `npm ci` en la raíz, `npm run pipeline -w pipeline` con `DATABASE_URL` desde el secret (la URL **directa** de Neon, porque el pipeline usa advisory lock), y subida de `data/raw` y `data/frescura.json` como artifact con 30 días de retención.
- El paso del pipeline falla si alguna fuente falla (código 1), así el historial de Actions lo muestra en rojo.
- **Cron que no se apaga:** GitHub desactiva los workflows programados después de 60 días sin actividad en el repo. Un job mensual del mismo workflow vuelve a habilitar el workflow con la API de GitHub (`PUT /repos/{repo}/actions/workflows/pipeline.yml/enable`, con `permissions: actions: write`). Se verifica en la documentación de GitHub al implementarlo; si no alcanza, alternativa: el job mensual hace un commit vacío firmado como el bot de Actions.
- Además, `.github/workflows/ci.yml` corre `npm test` en cada push y pull request (sin base ni red). Decisión de Claude: suma una señal visible de calidad en el repo y es gratis en repos públicos.

## Docker Compose (#42)

- Servicios: `postgres` (el de M2), `instalar` (corre `npm ci` una vez en un volumen de `node_modules` propio del contenedor, porque los binarios de Vite instalados en Windows no sirven en Linux), `api` (`npm run api -w api` escuchando en `0.0.0.0:3000`) y `web` (`npm run dev -w web -- --host 0.0.0.0` en el puerto 5173). `api` y `web` esperan a que `instalar` termine bien.
- La API arranca contra la base de Docker (`DATABASE_URL` armada con las variables de `.env`). Las migraciones se aplican cuando corre el pipeline.
- Servicio `pipeline` con perfil `pipeline`: `docker compose run --rm pipeline` carga los datos en la base local.
- El servidor de la API toma el host de `HOST` (por defecto `127.0.0.1`, en Docker `0.0.0.0`).
- Verificación: desde un clon limpio en una carpeta temporal, `cp .env.example .env` con valores locales, `docker compose up -d`, `docker compose run --rm pipeline`, y la web en `http://localhost:5173` muestra la calculadora con datos.

## README final (#43)

- Arriba: link al sitio, link a la documentación de la API y badges de los dos workflows.
- Arquitectura actualizada (diagrama de texto con Actions → Neon → API en Vercel → web en Vercel).
- Fuentes con su estado actual (link a la vista Estado de los datos).
- **Problemas encontrados y cómo se resolvieron:** fuentes de Córdoba sin datos nuevos (cambio de rumbo), API v3 del BCRA dada de baja, paginación del BCRA con límite de 3000, advisory lock incompatible con el pooler de Neon, respuestas fuera de orden en la calculadora, anotaciones que se pisaban en el gráfico, gráfico ilegible en celular, y la decisión legal sobre el billete y el aviso.
- Cómo correrlo en local (Node o Docker) y en la nube.

## Lo que hace Nico (no lo puede hacer Claude)

1. Cargar el secret `DATABASE_URL` en GitHub (URL directa de Neon).
2. Crear la cuenta de Vercel (plan Hobby, con su GitHub).
3. Importar el repo dos veces en Vercel (raíz `api` y raíz `web`) y cargar `DATABASE_URL_POOLED` en el proyecto `api`.
4. Pasarle a Claude las dos URLs públicas (`*.vercel.app`; no son secretas).

## Queda a criterio del implementador

- Los nombres exactos de los proyectos de Vercel (sugeridos: `inflacion-vs-ahorro` para la web y `inflacion-vs-ahorro-api` para la API).
- Las versiones de las acciones de GitHub (`actions/checkout`, `actions/setup-node`, `actions/upload-artifact`), fijadas a la última mayor estable.
