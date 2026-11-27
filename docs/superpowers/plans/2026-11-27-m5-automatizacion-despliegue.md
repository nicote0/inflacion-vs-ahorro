# M5 Automatización y despliegue — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pipeline diario en GitHub Actions, web y API publicadas en Vercel bajo un mismo dominio, Docker Compose completo y README final.

**Architecture:** Dos proyectos de Vercel (raíz `api` con una función que envuelve la app Fastify, raíz `web` con el build de Vite y un rewrite de `/api/*`). Workflows `pipeline.yml` (cron + manual + re-habilitación mensual) y `ci.yml` (tests). Compose con servicios de instalación, API, web y pipeline.

**Tech Stack:** GitHub Actions, Vercel (Hobby), Docker Compose, Node 24.

**Spec:** `docs/superpowers/specs/2026-11-27-m5-automatizacion-despliegue-design.md`. Issues #39–#43.

## Global Constraints

- Costo cero. Ninguna credencial en el repo ni en los workflows: `secrets.DATABASE_URL` (URL directa de Neon) en Actions y `DATABASE_URL_POOLED` en Vercel, cargadas por Nico.
- Push y cambios en GitHub solo con OK de Nico. Commits como en M1–M4.
- Node 24 en Actions y en Docker (`node:24-alpine`).

## Review Focus

1. **Recargar `/series` o `/datos` en el sitio publicado:** carga la app, no un 404. Verificación en la Tarea 5 (`curl` a `/series` da 200 con el HTML).
2. **Una URL de API con query string** (`/api/simulacion?desde=…`): llega a Fastify sin el prefijo y con los parámetros intactos. Test en la Tarea 1.
3. **Una fuente caída en el cron:** el job termina en rojo pero sube igual el artifact. Tarea 3 (`if: always()` en la subida).
4. **Instalación en Docker con `node_modules` de Windows en la carpeta:** los contenedores usan su propio volumen y no los binarios del host. Verificación en la Tarea 4 desde un clon limpio.
5. **La API publicada sin `DATABASE_URL_POOLED`:** responde 503 con el formato común, no un 500 con detalles. Test en la Tarea 1.

---

### Task 1: Función de Vercel para la API y HOST configurable (#41)

**Files:**
- Create: `api/api/[[...ruta]].js`, `api/src/vercel.js`, `api/vercel.json`
- Modify: `api/src/servidor.js` (host desde `HOST`, por defecto `127.0.0.1`)
- Test: `api/test/vercel.test.js`

**Interfaces:**
- Produces: `quitarPrefijo(url: string) -> string` (`/api/simulacion?x=1` → `/simulacion?x=1`; `/api` → `/`); `crearManejador({ crearAppFn, entorno = process.env }) -> async (req, res)`: arma la app una sola vez (promesa compartida) con `crearCargadorDeFoto` sobre `DATABASE_URL_POOLED` o `DATABASE_URL`; si no hay ninguna, `obtenerFoto` lanza `ErrorApi(503, 'DATOS_NO_DISPONIBLES', …)`. Por pedido: `req.url = quitarPrefijo(req.url)`, `await app.ready()`, `app.server.emit('request', req, res)`.
- `api/api/[[...ruta]].js`: `export default crearManejador({ crearAppFn: crearApp })`.
- `api/vercel.json`: `{ "functions": { "api/[[...ruta]].js": { "maxDuration": 10 } } }`.

- [ ] **Step 1: Tests:** `quitarPrefijo` con `/api/simulacion?desde=2020-01&monto=1` da `/simulacion?desde=2020-01&monto=1`, con `/api` da `/` y con `/api/` da `/`; `crearManejador` sobre un servidor HTTP real de Node (`http.createServer(manejador)` en un puerto libre) con `crearAppFn` = `crearApp` y una foto falsa inyectada: `GET /api/indicadores` da 200 con los indicadores, y sin variables de base `GET /api/indicadores` da 503 `DATOS_NO_DISPONIBLES`.
- [ ] **Step 2: Run** `npm test -w api`. Expected: FAIL.
- [ ] **Step 3: Implement.** Para inyectar la foto en el test, `crearManejador` acepta `obtenerFoto` opcional.
- [ ] **Step 4: Run** `npm test -w api`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): función de Vercel que envuelve la API`.

### Task 2: Configuración de la web para Vercel (#40)

**Files:**
- Create: `web/vercel.json`, `web/.env.production`

`web/.env.production`: `VITE_API_URL=/api`. `web/vercel.json`: `{"rewrites":[{"source":"/api/:ruta*","destination":"https://inflacion-vs-ahorro-api.vercel.app/api/:ruta*"},{"source":"/(.*)","destination":"/index.html"}]}` (la URL de la API se corrige en la Tarea 5 si Vercel le asigna otra).

- [ ] **Step 1:** `npm run build -w web` y verificar que el JS generado contiene `"/api"` como base (grep en `web/dist/assets/*.js`). Expected: aparece `/api/simulacion` armado sobre `/api`.
- [ ] **Step 2: Commit** `chore(web): configuración de despliegue en Vercel`.

### Task 3: Workflows de GitHub Actions (#39)

**Files:**
- Create: `.github/workflows/pipeline.yml`, `.github/workflows/ci.yml`

`pipeline.yml`: `on: schedule: - cron: '0 13 * * *'`, `- cron: '0 14 1 * *'` (mensual) y `workflow_dispatch`. Job `pipeline` (no corre en el disparo mensual de las 14): checkout v4, setup-node v4 con `node-version: 24` y `cache: npm`, `npm ci`, `npm run pipeline -w pipeline` con `env: DATABASE_URL: ${{ secrets.DATABASE_URL }}`, y `actions/upload-artifact@v4` con `data/raw` y `data/frescura.json`, `retention-days: 30`, `if: always()`. Job `mantener-activo` (solo en el disparo mensual, `github.event.schedule == '0 14 1 * *'`): `permissions: actions: write` y `gh api -X PUT repos/${{ github.repository }}/actions/workflows/pipeline.yml/enable` con `GH_TOKEN: ${{ github.token }}`. `ci.yml`: en `push` y `pull_request`, checkout, setup-node 24 con caché, `npm ci`, `npm test`.

- [ ] **Step 1:** Validar la sintaxis YAML con `node -e` y el paquete `yaml` instalado en el scratchpad (no en el repo). Expected: los dos archivos parsean y tienen las claves `on` y `jobs`.
- [ ] **Step 2:** Verificar en la documentación de GitHub que habilitar el workflow por API evita la desactivación por 60 días; si no lo confirma, cambiar el job mensual por un commit vacío del bot y registrar la decisión.
- [ ] **Step 3: Commit** `ci: pipeline diario y tests en cada push`.
- [ ] **Step 4 (tras el push con OK):** `gh workflow run pipeline.yml` y `gh run watch`. Expected: termina bien; `control.ejecucion` suma una fila (consulta con el cliente de Neon); hay un artifact. Correr también `ci.yml` (sale solo con el push) y verlo en verde.

### Task 4: Docker Compose completo (#42)

**Files:**
- Modify: `docker-compose.yml`, `.env.example` (comentario de que en Docker la API y el pipeline usan la base `postgres`)

Servicios: `postgres` (sin cambios); `instalar` (`node:24-alpine`, `working_dir: /app`, volumen `.:/app` y volumen con nombre `node_modules:/app/node_modules`, `command: npm ci`); `api` (misma imagen y volúmenes, `command: npm run api -w api`, env `DATABASE_URL=postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}`, `HOST=0.0.0.0`, puerto `3000:3000`, `depends_on: instalar: condition: service_completed_successfully` y `postgres`); `web` (`command: npm run dev -w web -- --host 0.0.0.0 --port 5173`, puerto `5173:5173`, env `VITE_API_URL=http://localhost:3000`, mismo `depends_on`); `pipeline` (`profiles: [pipeline]`, `command: npm run pipeline -w pipeline`, mismo `DATABASE_URL`).

Los scripts usan `node --env-file-if-exists=../.env`: dentro del contenedor el `.env` del host está montado y su `DATABASE_URL` (Neon) pisaría la del compose. Ruling previsto: el `environment:` del compose tiene prioridad porque `--env-file` no sobreescribe variables ya definidas en el entorno (verificarlo en el Step 2).

- [ ] **Step 1:** Clon limpio en el scratchpad (`git clone` del repo local), `.env` con valores locales, `docker compose up -d`, `docker compose run --rm pipeline`. Expected: el pipeline carga las 3 fuentes en la base del contenedor.
- [ ] **Step 2:** `curl http://localhost:3000/indicadores` da 3 indicadores y `curl http://localhost:5173/` da el HTML de la app. Confirmar que la API usa la base del contenedor (el log de la foto) y no Neon.
- [ ] **Step 3:** `docker compose down` en el clon y borrar el clon.
- [ ] **Step 4: Commit** `chore: docker compose con base, API, web y pipeline`.

### Task 5: Publicación en Vercel (#40, #41) — con Nico

- [ ] **Step 1:** Push con OK de Nico.
- [ ] **Step 2:** Guiar a Nico: en Vercel, **Add New → Project → importar `inflacion-vs-ahorro`**, Root Directory `api`, nombre `inflacion-vs-ahorro-api`, variable `DATABASE_URL_POOLED` (URL de Neon con `-pooler`), Deploy. Después, otro proyecto con Root Directory `web`, nombre `inflacion-vs-ahorro`, framework Vite, Deploy.
- [ ] **Step 3:** Con las dos URLs que pase Nico, corregir `web/vercel.json` si la de la API no es la prevista, commit y push (con OK).
- [ ] **Step 4: Verificación pública:** `curl` a `<api>/api/indicadores` y `<api>/api/simulacion?desde=2020-01&hasta=2025-01&monto=100000` (mismos números que la planilla), `<web>/api/frescura` (a través del rewrite), `<web>/series` y `<web>/datos` dan 200 con el HTML, y `cache-control` público en la respuesta de la API. Pedirle a Nico una captura del sitio publicado en la compu y en el celular.

### Task 6: README final y cierre (#43)

- [ ] **Step 1:** README: links al sitio y a `/api/docs`, badges de `pipeline.yml` y `ci.yml`, arquitectura actualizada, fuentes con link a Estado de los datos, sección "Problemas encontrados y cómo se resolvieron" (lista del spec), cómo correrlo con Node, con Docker y en la nube, y M5 como "Hecho".
- [ ] **Step 2: Commit** `docs: README final con el sitio publicado`.
- [ ] **Step 3:** Revisión final, push con OK, cerrar #39–#43 con comentario y tablero a mano, actualizar `HANDOFF.md` y la memoria.
