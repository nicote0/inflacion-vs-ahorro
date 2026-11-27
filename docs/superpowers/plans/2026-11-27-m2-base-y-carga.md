# M2 Base y carga — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Llevar las tres series de M1 a PostgreSQL (staging, modelo y control) con una carga idempotente y registrada, y dejar lista la simulación como módulo JS puro.

**Architecture:** npm workspaces con `pipeline/` y `simulacion/`. El pipeline reutiliza la descarga de M1, inserta en staging los valores como texto y los pasa al modelo con SQL (tipado, rechazos, upsert y promedios mensuales), dentro de una transacción por fuente. La simulación recibe los datos ya leídos y no toca la base.

**Tech Stack:** Node.js 24 (ESM), `pg`, PostgreSQL 17 (Docker en local, Neon en producción), `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-26-m2-base-y-carga-design.md` (aprobado el 2026-11-27, con la sección "Ajustes de la revisión"). Reglas del cálculo: sección Cálculo de `docs/superpowers/specs/2026-11-25-inflacion-vs-ahorro-design.md`. Issues: #25, #26, #28, #29, #30, #45 y #46.

## Global Constraints

- Node.js >= 20, ESM. Única dependencia de runtime nueva: `pg`. Sin ORM ni librerías de migración.
- Costo cero: Docker solo en local; producción en el plan gratuito de Neon.
- `DATABASE_URL` (URL **directa** de Neon, no la pooled) y `TEST_DATABASE_URL` salen solo del entorno. `.env` nunca se sube; antes de cada push, `git log -p | grep -i "postgres://"` no tiene que mostrar credenciales.
- Los scripts cargan `.env` de la raíz con `node --env-file-if-exists=../.env`.
- Identificadores SQL en minúscula, sin acentos y con guion bajo. Valores en `numeric` sin precisión fija.
- No se rellenan ni se interpolan datos. Un mes sin observaciones no tiene fila.
- Cada fuente se carga en su propia transacción. Una fuente que falla no frena a las demás. El proceso sale con código 1 si alguna falló.
- `npm run ingesta` sigue funcionando igual que en M1, sin base.
- Un commit por tarea, Conventional Commits en español, con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push solo con OK de Nico.
- Textos, nombres y mensajes en español.

## Review Focus

1. **Fecha con formato válido pero inexistente** (`2026-02-30`): va a `fila_rechazada` con motivo `fecha_invalida`, no rompe la transacción. Test en la Tarea 4.
2. **Fecha repetida dentro de la misma copia:** queda la primera aparición y la otra se rechaza con `fecha_repetida`. Test en la Tarea 4.
3. **Mes inicial sin ninguna tasa publicada** en la simulación: `ErrorSimulacion` con código `SIN_TASA`, no un plazo fijo que arranca otro mes. Test en la Tarea 1.
4. **Dos corridas al mismo tiempo:** la segunda no toma el lock, no escribe nada y termina con un aviso. Test en la Tarea 5.
5. **`DATABASE_URL` ausente:** mensaje claro que nombra la variable y código de salida 1, sin stack de `pg`. Test en la Tarea 2.

---

## Estructura de archivos

```
package.json                         raíz: workspaces ["pipeline", "simulacion"]
docker-compose.yml                   servicio postgres:17
docker/initdb/01-base-tests.sh       crea la base de tests
.env.example                         nombres sin valores
simulacion/
  package.json                       "name": "simulacion"
  src/index.js                       simular, ErrorSimulacion
  test/simular.test.js
pipeline/
  fuentes.json                       + campo "unidad"
  migraciones/001_esquema.sql
  src/db/conexion.js                 leerUrl, crearCliente
  src/db/migrador.js                 aplicarMigraciones
  src/db/carga.js                    sincronizarIndicadores, cargarFuente
  src/db/control.js                  ejecuciones, frescura, último hash, última fecha
  src/db/insumos.js                  leerInsumos (para la simulación)
  src/fuentes/indec.js, bcra.js      + filasCrudas
  src/pipeline.js                    ejecutarPipeline
  src/cli-pipeline.js                npm run pipeline
  src/cli-simular.js                 npm run simular
  test/filas-crudas.test.js          unitario
  test-db/ayuda.js                   cliente de tests y reinicio del esquema
  test-db/*.integracion.js           integración (npm run test:db)
```

Los tests de integración usan el sufijo `.integracion.js` para que `node --test` (que busca `*.test.js`, `*-test.js` y `test/**`) no los corra en `npm test`.

---

### Task 1: Workspaces y simulación (#46)

**Files:**
- Create: `package.json` (raíz), `simulacion/package.json`, `simulacion/src/index.js`
- Test: `simulacion/test/simular.test.js`

**Interfaces:**
- Produces:
  - `simular({ desde, hasta, monto, ipcMensual, dolarMensual, tasasDiarias }) -> Resultado`
    - `desde`, `hasta`: `'AAAA-MM'`. `ipcMensual` y `dolarMensual`: `Map<'AAAA-MM', number>`. `tasasDiarias`: `[{ fecha: 'AAAA-MM-DD', valor: number }]` ordenadas ascendente.
    - `Resultado = { factorInflacion, opciones: { plazoFijo, dolar, pesosQuietos }, evolucion: [{ mes, plazoFijo, dolar, pesosQuietos }], renovaciones: [{ inicio, vencimiento, tna, capitalInicial, capitalFinal, cobrada }] }`. Cada opción es `{ valorFinalNominal, valorReal, resultadoRealPct }`. `evolucion` está en pesos del mes final. `renovaciones` incluye el último tramo con `cobrada: false` (sirve para la planilla).
  - `class ErrorSimulacion extends Error { codigo }`, con `codigo` en `'PERIODO_INVALIDO' | 'MONTO_INVALIDO' | 'FALTA_IPC' | 'FALTA_DOLAR' | 'SIN_TASA'`.

Raíz: `{ "name": "inflacion-vs-ahorro", "private": true, "workspaces": ["pipeline", "simulacion"], "scripts": { "test": "npm test --workspaces" } }`. `simulacion/package.json`: `"type": "module"`, `"main": "src/index.js"`, `"scripts": { "test": "node --test" }`.

Casos calculados a mano (van como comentario en el test, con la cuenta):
- **Caso A**, `desde '2020-01'`, `hasta '2020-03'`, `monto 1000`. IPC `{01:100, 02:150, 03:200}`, dólar `{01:10, 02:20, 03:30}`, una sola tasa `{ fecha:'2020-01-02', valor:36.5 }`.
  - Factor: 200/100 = 2.
  - Pesos quietos: nominal 1000, real 500, resultado −50 %.
  - Dólar: 1000/10 = 100 USD, × 30 = 3000 nominal, real 1500, resultado +50 %.
  - Plazo fijo: 36.5/100 × 30/365 = 0.03 por tramo. Tramo 1: 2020-01-02 a 2020-02-01. Tramo 2: 2020-02-01 a 2020-03-02. Tramo 3: 2020-03-02 a 2020-04-01, que vence después del 2020-03-31 y no se cobra. Nominal 1000 × 1.03² = 1060.9, real 530.45, resultado −46.955 %.
  - Evolución en pesos de marzo: enero `{ plazoFijo: 2000, dolar: 2000, pesosQuietos: 2000 }`, febrero `{ plazoFijo: 1373.33, dolar: 2666.67, pesosQuietos: 1333.33 }`, marzo `{ plazoFijo: 1060.9, dolar: 3000, pesosQuietos: 1000 }`.
- **Caso B**: igual que A, pero se suma la tasa `{ fecha:'2020-01-31', valor:73 }`. El tramo 2 empieza el 2020-02-01 sin tasa ese día, y usa la del 2020-01-31 (73 → 0.06). Nominal 1000 × 1.03 × 1.06 = 1091.8.

- [ ] **Step 1: Write the failing tests** (comparar números con tolerancia `1e-9` relativa, salvo la evolución, que va con 2 decimales):
  - `caso A: factor, tres opciones y evolución` con los valores de arriba.
  - `caso A: renovaciones` da 3 tramos: los dos primeros `cobrada: true` y el tercero con `vencimiento '2020-04-01'` y `cobrada: false`.
  - `caso B: un día sin tasa usa la última publicada` da plazo fijo nominal 1091.8.
  - `el plazo fijo arranca en la primera fecha con tasa del mes inicial`: con tasas `[{ '2020-01-06', 36.5 }]`, el primer tramo tiene `inicio '2020-01-06'`.
  - Errores, con `assert.throws` comprobando `codigo`: `desde === hasta` da `PERIODO_INVALIDO`; `hasta < desde` da `PERIODO_INVALIDO`; `monto 0` da `MONTO_INVALIDO`; IPC sin `'2020-03'` da `FALTA_IPC`; dólar sin `'2020-01'` da `FALTA_DOLAR`; tasas que empiezan en `'2020-02-03'` con `desde '2020-01'` da `SIN_TASA`.
- [ ] **Step 2: Run** `npm install` en la raíz y después `npm test -w simulacion`. Expected: FAIL (`Cannot find module '../src/index.js'`).
- [ ] **Step 3: Implement** `simulacion/src/index.js`. Fechas en UTC (`Date.UTC`), sumando 30 días corridos. La tasa de un día `d` es la última con `fecha <= d`. El valor de un mes en la evolución es el capital después de los vencimientos con `vencimiento <=` fin de ese mes. Exige IPC y dólar de todos los meses entre `desde` y `hasta`, no solo los de las puntas.
- [ ] **Step 4: Run** `npm test` en la raíz. Expected: PASS en `simulacion` y los 32 de `pipeline` siguen en verde.
- [ ] **Step 5: Commit** `feat(simulacion): cálculo de plazo fijo, dólar y pesos quietos contra la inflación`.

### Task 2: Postgres local, conexión y migraciones (#25, #26)

**Files:**
- Create: `docker-compose.yml`, `docker/initdb/01-base-tests.sh`, `.env.example`, `pipeline/migraciones/001_esquema.sql`, `pipeline/src/db/conexion.js`, `pipeline/src/db/migrador.js`, `pipeline/test-db/ayuda.js`
- Modify: `pipeline/package.json` (dependencia `pg` y script `test:db`)
- Test: `pipeline/test/conexion.test.js`, `pipeline/test-db/migrador.integracion.js`

**Interfaces:**
- Produces:
  - `leerUrl(nombre = 'DATABASE_URL', entorno = process.env) -> string`. Si falta, lanza `Error('Falta la variable de entorno DATABASE_URL. Copiá .env.example a .env y completala.')` (con el nombre que corresponda).
  - `crearCliente(url) -> pg.Client` (sin conectar), con `connectionTimeoutMillis: 15000` (Neon puede tardar en despertar).
  - `aplicarMigraciones(cliente, dir = <pipeline>/migraciones) -> Promise<string[]>`: aplica en orden los `NNN_*.sql` que no estén en `public.schema_migrations`, cada uno en su transacción, y devuelve las versiones aplicadas.
  - En `test-db/ayuda.js`: `conBaseDeTest(fn)`, que conecta con `TEST_DATABASE_URL`, borra los schemas `staging`, `modelo` y `control` y la tabla `public.schema_migrations`, ejecuta `fn(cliente)` y cierra. Si `TEST_DATABASE_URL` no está, lanza un error que lo dice (no se saltea).

`docker-compose.yml`: servicio `postgres`, imagen `postgres:17`, puerto `5432:5432`, `POSTGRES_USER`, `POSTGRES_PASSWORD` y `POSTGRES_DB` desde `.env`, volumen con nombre para los datos y `./docker/initdb` montado en `/docker-entrypoint-initdb.d`. El script de init crea la base `${POSTGRES_DB}_test`.

`.env.example` (sin valores), con un comentario por línea:
```
# Postgres local (docker compose)
POSTGRES_USER=
POSTGRES_PASSWORD=
POSTGRES_DB=
# URL directa (no la "pooled" de Neon): el pipeline usa un advisory lock de sesión
DATABASE_URL=
# Base de tests: postgres://USER:PASS@localhost:5432/<POSTGRES_DB>_test
TEST_DATABASE_URL=
```

`001_esquema.sql` crea los schemas y las tablas del spec (sección Esquema), con estos agregados:
- `fecha_valida(texto text) returns boolean` en el schema `staging`: true si matchea `^\d{4}-\d{2}-\d{2}$` y el cast a `date` no falla (plpgsql con `exception when others then return false`).
- `valor_valido(texto text) returns boolean` en `staging`: matchea `^-?\d+(\.\d+)?([eE][-+]?\d+)?$`.
- Checks de estado en `control.ejecucion` y `control.ejecucion_fuente`, con los valores del spec.
- Índice `control.ejecucion_fuente (fuente_id, terminada_en desc) where estado = 'ok'`.

Scripts de `pipeline/package.json`: `"test:db": "node --env-file-if-exists=../.env --test \"test-db/*.integracion.js\""`.

- [ ] **Step 1: Write the failing tests:**
  - `conexion.test.js`: `leerUrl falla con un mensaje que nombra la variable` (entorno `{}`), y `leerUrl devuelve la URL definida`.
  - `migrador.integracion.js`: `aplica desde cero y crea las tablas` (devuelve `['001']` y existen `modelo.hecho_diario`, `control.ejecucion` y `control.fila_rechazada`); `una segunda corrida no aplica nada` (devuelve `[]`); `fecha_valida('2026-02-30')` es false y `fecha_valida('2026-02-28')` es true; `valor_valido('')` es false y `valor_valido('1632.65')` es true.
- [ ] **Step 2:** Copiar `.env.example` a `.env` con valores locales (usuario, contraseña y base a gusto). Correr `docker compose up -d` y `npm run test:db -w pipeline`. Expected: FAIL (módulos inexistentes).
- [ ] **Step 3: Implement** `conexion.js`, `migrador.js`, `001_esquema.sql`, `ayuda.js`, el compose y el script de init. `npm install pg -w pipeline`.
- [ ] **Step 4: Run** `npm test` y `npm run test:db -w pipeline`. Expected: PASS.
- [ ] **Step 5: Verify** `git check-ignore .env` imprime `.env`, y `git status` no muestra `.env`.
- [ ] **Step 6: Commit** `feat(db): Postgres local, conexión por variable de entorno y migraciones`.

### Task 3: Filas crudas de cada adaptador (#28)

**Files:**
- Modify: `pipeline/src/fuentes/indec.js`, `pipeline/src/fuentes/bcra.js`
- Test: `pipeline/test/filas-crudas.test.js`

**Interfaces:**
- Produces: `filasCrudas(contenido) -> [{ fila: number, fecha: string, valor: string }]` en `indec` y en `bcra`. Sin convertir ni descartar nada: lo que no se puede leer va igual, para que staging lo rechace con motivo. `fila` arranca en 1 y sigue el orden del contenido (para el BCRA, el orden de las páginas tal como llegaron). Un valor ausente del BCRA (`null`) va como `''`; un número va con `String(valor)`.

- [ ] **Step 1: Write the failing tests:**
  - `indec: devuelve las filas sin convertir`: `"indice_tiempo,ipc_nivel_general_nacional\n2016-12-01,100.0\n2017-01-01,\n"` da `[{fila:1,fecha:'2016-12-01',valor:'100.0'},{fila:2,fecha:'2017-01-01',valor:''}]`.
  - `bcra: une páginas y numera en orden de llegada`: dos líneas JSON con 2 y 1 elementos de `detalle` dan `fila` 1, 2 y 3; un `valor: null` da `''`.
  - `ambos rechazan contenido sin el formato esperado` (lanzan el mismo error que `parsear`).
- [ ] **Step 2: Run** `npm test -w pipeline`. Expected: FAIL.
- [ ] **Step 3: Implement** `filasCrudas` en los dos adaptadores. Si `parsear` puede apoyarse en `filasCrudas` sin cambiar su comportamiento, hacerlo.
- [ ] **Step 4: Run** `npm test -w pipeline`. Expected: PASS, con los tests de M1 sin cambios.
- [ ] **Step 5: Commit** `feat(pipeline): filas crudas sin convertir para staging`.

### Task 4: Carga de una fuente en staging y modelo (#25, #28, #29, #45)

**Files:**
- Create: `pipeline/src/db/carga.js`
- Modify: `pipeline/fuentes.json` (campo `unidad`)
- Test: `pipeline/test-db/carga.integracion.js`

**Interfaces:**
- Consumes: `aplicarMigraciones`, `conBaseDeTest` (Tarea 2); el formato de `filasCrudas` (Tarea 3).
- Produces:
  - `sincronizarIndicadores(cliente, fuentes) -> Promise<void>`: upsert de `modelo.dim_indicador`. `fuente` es `'INDEC'` o `'BCRA'` según `tipo`. `serie_origen` es `serie` o `` `variable ${variable}` ``.
  - `cargarFuente(cliente, { fuente, sha256, filas, ejecucionId }) -> Promise<{ filasLeidas, filasInsertadas, filasActualizadas, filasSinCambios, filasRechazadas }>`. Hace su propio `begin`/`commit` (`rollback` y relanza si algo falla).

`unidad` en `fuentes.json`: `ipc_nacional` → `"índice (dic 2016 = 100)"`, `dolar_minorista` → `"pesos por dólar"`, `tasa_plazo_fijo_30d` → `"% TNA"`.

Pasos de `cargarFuente`, todos en SQL y dentro de la transacción:
1. Borrar las filas de esa fuente en la tabla de staging del tipo (`staging.indec_series` o `staging.bcra_monetarias`) e insertar las nuevas en un solo `insert ... select * from unnest($1::int[], $2::text[], $3::text[])`.
2. Insertar en `control.fila_rechazada` las filas con `not fecha_valida` (motivo `fecha_invalida`), con `not valor_valido` (motivo `valor_invalido`) y, entre las válidas, las repeticiones de una fecha que no son la de menor `fila` (motivo `fecha_repetida`).
3. Extender `modelo.dim_fecha` hasta cubrir todas las fechas válidas (para el IPC, el primer día del mes).
4. Upsert en `modelo.hecho_diario` (diaria) o `modelo.hecho_mensual` con `origen 'fuente'` y `mes = date_trunc('month', fecha)` (mensual), con `on conflict ... do update ... where valor is distinct from excluded.valor returning (xmax = 0) as insertada`. Insertadas y actualizadas salen de ese `returning`. Sin cambios = válidas − insertadas − actualizadas.
5. Si la serie es diaria: upsert en `hecho_mensual` de `avg(valor)` y `count(*)` agrupados por mes, con `origen 'promedio_diario'`, para todo el indicador.

- [ ] **Step 1: Write the failing tests** (cada uno con `conBaseDeTest`, migraciones aplicadas, indicadores sincronizados y una fila de `control.ejecucion` para el `ejecucionId`):
  - `la primera carga inserta y la segunda no cambia nada`: 3 filas diarias válidas dan `filasInsertadas 3`, y la segunda carga con las mismas filas da `filasSinCambios 3`. Los conteos de `hecho_diario` y `hecho_mensual` quedan iguales.
  - `un valor corregido se actualiza`: cambiar el valor de una fecha da `filasActualizadas 1`, y `hecho_diario` tiene el valor nuevo sin duplicar la fila.
  - `rechaza con motivo y sigue`: filas con `fecha '2026-02-30'`, `valor ''`, `valor 'abc'` y una fecha repetida dan 4 filas en `fila_rechazada` con `fecha_invalida`, `valor_invalido`, `valor_invalido` y `fecha_repetida`, y las válidas se cargan.
  - `promedio mensual con días con dato`: noviembre `[10, 20]` y diciembre `[30]` dan `hecho_mensual` `{2026-11-01: 15, dias_con_dato 2}` y `{2026-12-01: 30, dias_con_dato 1}`, ambos con `origen 'promedio_diario'`. Octubre, que no tiene datos, no tiene fila.
  - `el IPC va a hecho_mensual con origen fuente y sin días con dato`.
  - `staging guarda solo la última carga`: después de dos cargas con hashes distintos, staging tiene solo las filas del segundo `sha256`.
  - `sincronizarIndicadores guarda unidad, fuente y serie de origen`.
- [ ] **Step 2: Run** `npm run test:db -w pipeline`. Expected: FAIL.
- [ ] **Step 3: Implement** `carga.js` y el campo `unidad`.
- [ ] **Step 4: Run** `npm test` y `npm run test:db -w pipeline`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(db): carga idempotente con staging, rechazos y promedios mensuales`.

### Task 5: Orquestador con control de ejecuciones (#29, #30)

**Files:**
- Create: `pipeline/src/db/control.js`, `pipeline/src/pipeline.js`, `pipeline/src/cli-pipeline.js`
- Modify: `pipeline/src/ingesta.js` (exportar `armarFrescura` y `ultimaObservacionGuardada` para reusarlas), `pipeline/package.json` (script `pipeline`)
- Test: `pipeline/test-db/pipeline.integracion.js`

**Interfaces:**
- Consumes: adaptadores con `descargar`, `parsear`, `declarado` y `filasCrudas`; `guardarCrudo`, `leerUltimoCrudo` (M1); `fechaHoyArgentina` (M1); `sincronizarIndicadores` y `cargarFuente` (Tarea 4); `aplicarMigraciones` (Tarea 2).
- Produces:
  - En `control.js`: `iniciarEjecucion(cliente) -> ejecucionId`, `cerrarEjecucion(cliente, ejecucionId, estado)`, `registrarFuente(cliente, ejecucionId, registro)`, `ultimoHashOk(cliente, fuenteId) -> string|null`, `ultimaFechaCargada(cliente, fuente) -> string|null` (`max(fecha)` de `hecho_diario`, o `max(mes)` de `hecho_mensual` con `origen 'fuente'`, como `'AAAA-MM-DD'`), y `guardarFrescura(cliente, fuenteId, frescura)` (upsert en `control.frescura`).
  - `ejecutarPipeline({ fuentes, dirBase, fetch, ahora, cliente, obtenerAdaptador = adaptadorPara }) -> Promise<{ ok, bloqueado, ejecucionId, resultados }>`. Cada resultado tiene la forma de M1 más `estado: 'ok'|'sin_cambios'|'error'` y los conteos de `cargarFuente`.

Flujo (el del spec, sección "Flujo de `npm run pipeline`"):
1. `select pg_try_advisory_lock(<constante>)`. Si da false, devuelve `{ ok: false, bloqueado: true, ejecucionId: null, resultados: [] }` sin escribir nada. Liberar con `pg_advisory_unlock` en un `finally`.
2. `aplicarMigraciones`, `iniciarEjecucion` y `sincronizarIndicadores`.
3. Por fuente, en su propio `try/catch`: descargar, `parsear`, `guardarCrudo`. Si `sha256 === ultimoHashOk`, el estado es `sin_cambios` y no se carga. Si no, se llama a `cargarFuente(... filasCrudas(contenido) ...)`. Después, `declarado` (si falla, se anota y la fuente sigue). La frescura usa la última observación parseada. Si la descarga o la carga fallan, el estado es `error` y la última observación sale de `ultimaFechaCargada` o, si es null, de `ultimaObservacionGuardada` (M1).
4. `registrarFuente` y `guardarFrescura` van fuera de la transacción de carga.
5. La ejecución cierra con `ok` (ninguna fuente con error), `con_errores` (algunas) o `fallida` (todas, o una excepción fuera de las fuentes).

`cli-pipeline.js` lee `fuentes.json` (o la ruta de `--fuentes <archivo>`, que sirve para la prueba de la Tarea 7), `DATABASE_URL` con `leerUrl` y conecta. Corre el pipeline, escribe `data/frescura.json` como en M1 y muestra una línea por fuente con estado y conteos (`insertadas/actualizadas/sin cambios/rechazadas`). Si recibe `bloqueado`, muestra `Otra ejecución está en curso; no se hizo nada.` y sale con 1. Si `leerUrl` falla, muestra solo su mensaje y sale con 1. Script: `"pipeline": "node --env-file-if-exists=../.env src/cli-pipeline.js"`.

- [ ] **Step 1: Write the failing tests** (adaptadores falsos con `filasCrudas`, base de tests):
  - `primera corrida carga y registra`: 2 fuentes; `control.ejecucion` queda `ok` y hay 2 filas en `ejecucion_fuente` con estado `ok` y `sha256`.
  - `segunda corrida con el mismo contenido queda sin_cambios` y los conteos de `hecho_diario` no se mueven.
  - `el hash se compara contra la base y no contra el disco`: segunda corrida con otro `dirBase` vacío; igual da `sin_cambios`.
  - `una fuente que falla queda registrada y las demás cargan`: la ejecución queda `con_errores`, la fuente rota tiene `estado 'error'` y `mensaje_error`, y la otra está `ok`.
  - `frescura con la base cuando falla la descarga`: la primera corrida carga hasta `2026-11-25`; en la segunda la descarga falla y `control.frescura.ultima_observacion` es `2026-11-25`.
  - `una segunda conexión con el lock tomado no hace nada`: otro cliente toma `pg_advisory_lock(<constante>)`; `ejecutarPipeline` devuelve `bloqueado: true` y `control.ejecucion` no suma filas.
- [ ] **Step 2: Run** `npm run test:db -w pipeline`. Expected: FAIL.
- [ ] **Step 3: Implement** `control.js`, `pipeline.js`, `cli-pipeline.js` y los exports de `ingesta.js`.
- [ ] **Step 4: Run** `npm test` y `npm run test:db -w pipeline`. Expected: PASS.
- [ ] **Step 5: Verificación real local:** `npm run pipeline -w pipeline` contra el Postgres de Docker (`DATABASE_URL` local). Expected: 3 fuentes `ok`, con el IPC de 119 filas o más y las del BCRA con más de 2400. Segunda corrida: 3 `sin_cambios`, y `select count(*)` de `hecho_diario` y `hecho_mensual` iguales antes y después. Con `DATABASE_URL` vacía: el mensaje de `leerUrl` y código 1.
- [ ] **Step 6: Commit** `feat(pipeline): orquestador con registro de ejecuciones y frescura en la base`.

### Task 6: Lectura de insumos y comando simular (#46)

**Files:**
- Create: `pipeline/src/db/insumos.js`, `pipeline/src/cli-simular.js`
- Modify: `pipeline/package.json` (dependencia `"simulacion": "*"` y script `simular`)
- Test: `pipeline/test-db/insumos.integracion.js`

**Interfaces:**
- Consumes: `simular`, `ErrorSimulacion` (Tarea 1); el modelo cargado (Tarea 4).
- Produces: `leerInsumos(cliente, { desde, hasta }) -> { ipcMensual, dolarMensual, tasasDiarias }`, con la forma de entrada de `simular`. Convierte `numeric` (que `pg` devuelve como string) a `Number`. Para `tasasDiarias` trae también la última tasa anterior a `desde`, si existe.

`cli-simular.js`: `--desde AAAA-MM --hasta AAAA-MM --monto N [--csv carpeta]`. Muestra el factor, las tres opciones (nominal, real y %) y la evolución. Con `--csv` escribe `insumos.csv` (mes, ipc, dolar_promedio) y `renovaciones.csv` (inicio, vencimiento, tna, capital_inicial, capital_final, cobrada) en UTF-8 con BOM y punto decimal. Un `ErrorSimulacion` se muestra como `Error (CODIGO): mensaje` y sale con 1. Script: `"simular": "node --env-file-if-exists=../.env src/cli-simular.js"`.

- [ ] **Step 1: Write the failing test:** con datos sembrados en la base de tests, `leerInsumos` devuelve Maps con claves `'AAAA-MM'`, valores numéricos y tasas ordenadas, incluida la anterior a `desde`.
- [ ] **Step 2: Run** `npm run test:db -w pipeline`. Expected: FAIL.
- [ ] **Step 3: Implement** `insumos.js` y `cli-simular.js`.
- [ ] **Step 4: Run** `npm run test:db -w pipeline`. Expected: PASS. Después, `npm run simular -w pipeline -- --desde 2020-01 --hasta 2025-01 --monto 100000` contra la base local: muestra las tres opciones sin error.
- [ ] **Step 5: Commit** `feat(pipeline): comando simular con exportación a CSV`.

### Task 7: Neon, README y verificación de cierre (#25, #26, #28, #29, #30, #45, #46)

**Files:**
- Modify: `README.md` (secciones Arquitectura, Cómo correrlo y Estado del proyecto, más una sección Base de datos)
- Create: `docs/verificacion/simulacion-<desde>-<hasta>.xlsx` (dos planillas)

- [ ] **Step 1: Nico crea Neon:** proyecto en el plan gratuito y la URL **directa** en `DATABASE_URL` de su `.env`. Claude no la lee ni la escribe.
- [ ] **Step 2: Límites de Neon:** leer la documentación vigente del plan gratuito (almacenamiento, horas de cómputo y suspensión por inactividad) y anotarlos con la fecha de consulta. No escribirlos de memoria.
- [ ] **Step 3: Contra Neon:** `npm run pipeline -w pipeline` dos veces. Expected: la primera aplica `001` y carga las 3 fuentes `ok`; la segunda da `sin_cambios` y no cambian los conteos de `hecho_diario` ni de `hecho_mensual` (anotar los números).
- [ ] **Step 4: Fuente rota (#30):** correr con una copia de `fuentes.json` con `"variable": 999999` en una fuente del BCRA (`npm run pipeline -w pipeline -- --fuentes <copia>`). Expected: la ejecución queda `con_errores`, la fuente rota tiene `mensaje_error` y las otras quedan `ok` o `sin_cambios`.
- [ ] **Step 5: Promedios a mano (#45):** para dos meses del dólar, `select avg(valor), count(*) from modelo.hecho_diario` filtrado por mes, comparado con `hecho_mensual`. Mostrar los números a Nico.
- [ ] **Step 6: Rechazos reales (#28):** `select fuente_id, motivo, count(*) from control.fila_rechazada group by 1, 2` de la carga real. Si hay rechazos, revisar que el motivo sea correcto.
- [ ] **Step 7: Planilla (#46):** `npm run simular -- --desde 2020-01 --hasta 2025-01 --monto 100000 --csv ...` y lo mismo para un segundo período (por ejemplo `2023-06` a `2026-06`). Armar cada planilla con el skill `anthropic-skills:xlsx`, con fórmulas visibles en cada celda (factor, cada renovación, dólares comprados y valor final) que lean los insumos exportados. Expected: el resultado de la planilla coincide con el de `npm run simular` hasta el centavo. Mostrarle a Nico las fórmulas para que revise que siguen las reglas.
- [ ] **Step 8: README:** esquema (las tres capas con sus tablas y para qué sirve cada una), regla de faltantes, cómo correr con Docker (`docker compose up -d`, `.env`, `npm run pipeline`, `npm run test:db`), cómo usar Neon (URL directa), límites del plan gratuito y M2 como "Hecho" en Estado del proyecto. Prosa normal, no caveman.
- [ ] **Step 9: Commit** `docs: base de datos, verificación de M2 y cómo correr con Docker y Neon`.
- [ ] **Step 10:** Revisar el historial (`git log -p | grep -iE "postgres(ql)?://[^ ]*:[^ ]*@"` no muestra nada). Mostrarle a Nico los commits y pedirle OK para el push. Después, cerrar las 7 issues con un comentario que enlace a sus commits y moverlas a "Hecho" en el tablero a mano. Con el mismo OK, sumar a #39 un comentario: en Actions `data/raw` se pierde en cada corrida, así que las copias crudas se suben como artifact del workflow. Actualizar `HANDOFF.md`.
