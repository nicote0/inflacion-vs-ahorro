# inflacion-vs-ahorro

**¿Qué le gana a la inflación?** Si en algún momento tenías pesos ahorrados, ¿te hubiera convenido un plazo fijo, comprar dólares o dejarlos quietos?

Este proyecto responde esa pregunta con datos oficiales del INDEC y del Banco Central, para el período y el monto que elijas. Incluye el recorrido completo de un producto de datos: ingesta automática, almacenamiento en PostgreSQL, API y un dashboard interactivo.

> El sitio muestra lo que pasó con datos históricos. Es un proyecto educativo: no es asesoramiento financiero ni una recomendación de inversión.

## Qué vas a poder hacer

La pantalla principal es una calculadora que se lee como una oración: *"Guardaste [$100.000] en [enero 2020] y los miraste en [enero 2025]"*.

- **Tu monto como billete.** El monto aparece en un billete ilustrado. Debajo hay un billete por opción (dólar oficial, plazo fijo y pesos quietos) con lo que tenés hoy, y la parte del billete que se comió la inflación aparece desteñida. Con $100.000 de enero 2020 a enero 2025, al dólar le queda el 63 % del poder de compra, al plazo fijo el 51 % y a los pesos quietos el 4 %.
- **El veredicto en texto.** Por ejemplo "Ninguna le ganó a la inflación", con cuánto se multiplicaron los precios.
- **Cómo fue cayendo.** Un gráfico mes a mes, en pesos del mes final, con anotaciones de lo que pasó (la inflación de 95 % en 2022, la devaluación de diciembre de 2023, la baja de tasas de 2024).
- **Atajos y links.** Atajos de período (último año, desde 2020, todo) y la consulta guardada en el link para compartirla.
- **Series y datos.** La vista **Series** muestra cada serie, o dos comparadas mes a mes, con la tabla de lo graficado y descarga en CSV. **Estado de los datos** muestra si cada fuente está al día.

Ver la sección [Dashboard](#dashboard).

## Fuentes de datos

Verificadas el 25/11/2026.

| Serie | Fuente | Periodicidad | Desde | Último dato |
|---|---|---|---|---|
| IPC nacional, nivel general, base dic 2016 | [API de series de tiempo](https://apis.datos.gob.ar/series/api/series/) de datos.gob.ar, ID `148.3_INIVELNAL_DICI_M_26` | Mensual | 2016-12 | 2026-10 |
| Tipo de cambio minorista, promedio vendedor | [API de estadísticas del BCRA](https://api.bcra.gob.ar/estadisticas/v4.0/monetarias) v4, variable 4 | Diaria (días hábiles) | 2010-06 | 2026-11-25 |
| Tasa de depósitos a 30 días (TNA) | API de estadísticas del BCRA v4, variable 12 | Diaria (días hábiles) | 1985-08 | 2026-11-24 |

El período comparable empieza en diciembre de 2016, primer mes del IPC nacional con esta base. Las fuentes se configuran en [`pipeline/fuentes.json`](pipeline/fuentes.json).

### Cómo responde cada API

**INDEC (API de series de tiempo).**
- Datos: `https://apis.datos.gob.ar/series/api/series/?ids=148.3_INIVELNAL_DICI_M_26&format=csv&start_date=2016-12-01&limit=1000`.
- Devuelve un CSV con las columnas `indice_tiempo,ipc_nivel_general_nacional`, con fecha `AAAA-MM-01` y punto decimal.
- Admite hasta 1000 filas por pedido. Si llegan 1000, el script avisa que la serie puede estar truncada.
- Fecha declarada: `meta[1].field.time_index_end` en la respuesta JSON con `metadata=full`.

**BCRA (API de estadísticas v4).**
- Datos: `https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/{variable}?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&limit=3000&offset=N`.
- Devuelve JSON con `results[0].detalle`, una lista de `{fecha, valor}` de la fecha más nueva a la más vieja, y el total en `metadata.resultset.count`.
- Admite hasta 3000 filas por pedido. Con más, responde 400 con el mensaje en `errorMessages`. La tasa ya tiene más de 2400 filas desde 2016, así que el script pagina con `offset`.
- Fecha declarada: `ultFechaInformada` del catálogo (`/monetarias`, unas 4000 variables en 2 páginas).

### Frescura

Para cada fuente se toma el fin del período de la última observación real: el último día del mes en series mensuales y la misma fecha en las diarias. Si desde ese día pasaron como mucho N días, la fuente está **vigente**. Si pasaron más, está **desactualizada**.

| Periodicidad | Tolerancia | Por qué |
|---|---|---|
| Mensual (IPC) | 45 días | El INDEC publica el IPC de un mes a mediados del siguiente |
| Diaria (BCRA) | 5 días | Cubre fines de semana largos y feriados |

El resultado se guarda en `control.frescura` y, para uso local, en `data/frescura.json`. Si una fuente falla, la frescura se calcula con la última fecha cargada en la base. Si la base todavía no tiene datos de esa fuente, se usa la última copia guardada. Así una caída no oculta hasta cuándo había datos.

## Cómo se calcula

- **Inflación del período:** IPC del mes final dividido por el IPC del mes inicial.
- **Pesos quietos:** el monto no cambia. Se mide cuánto poder de compra perdió.
- **Dólar oficial:** compra al tipo de cambio promedio del mes inicial y valorización al promedio del mes final.
- **Plazo fijo:** se renueva cada 30 días con la tasa vigente el día de la renovación. Un último tramo menor a 30 días no suma intereses.
- **Resultado real:** cuánto ganó o perdió cada opción después de descontar la inflación.

Supuestos: no se consideran impuestos ni comisiones, y el dólar se toma al precio de venta. La tasa es el promedio de los plazos fijos a 30 días de todos los depositantes, incluidas empresas. Se eligió sobre la tasa de personas humanas porque esa mezcla todos los plazos, y la simulación renueva cada 30 días. El detalle está en el [documento de diseño](docs/superpowers/specs/2026-11-25-inflacion-vs-ahorro-design.md).

### Verificación del cálculo

El cálculo vive en un paquete aparte, `simulacion/`, que no accede a la base. Sus tests incluyen casos chicos resueltos a mano, con la cuenta escrita en el propio test. Además, en [`docs/verificacion/`](docs/verificacion/) hay dos planillas (enero de 2020 a enero de 2025, y junio de 2023 a junio de 2026, con $100.000) que rehacen el cálculo con fórmulas de Excel a partir de los datos de la base: IPC, dólar promedio y tasas diarias. El plazo fijo se recalcula tramo por tramo. En los dos períodos, el resultado de la planilla coincide al centavo con el del programa.

## Base de datos

PostgreSQL con tres capas, cada una en su propio schema:

| Schema | Tablas | Para qué |
|---|---|---|
| `staging` | `indec_series`, `bcra_monetarias` | Los datos de la última descarga tal como llegaron, como texto, con el hash de la copia cruda de origen |
| `modelo` | `dim_indicador`, `dim_fecha`, `hecho_diario`, `hecho_mensual` | Los datos tipados. El dólar y la tasa van a `hecho_diario`. El IPC y los promedios mensuales del dólar y de la tasa van a `hecho_mensual`, con la cantidad de días con dato de cada mes |
| `control` | `ejecucion`, `ejecucion_fuente`, `fila_rechazada`, `frescura` | Cada corrida y el resultado de cada fuente (estado, filas insertadas, actualizadas, sin cambios y rechazadas, y mensaje de error), las filas que no se pudieron usar y el estado de frescura actual |

Las migraciones están en `pipeline/migraciones/`, numeradas, y se aplican solas al correr el pipeline. Las aplicadas quedan anotadas en `public.schema_migrations`.

**Cómo carga `npm run pipeline`:**

1. Toma un advisory lock de Postgres. Si otra corrida lo tiene, termina sin hacer nada.
2. Por cada fuente, descarga y guarda la copia cruda, igual que la ingesta. Si el hash es igual al de la última carga exitosa registrada en la base, la fuente queda `sin_cambios` y no se vuelve a cargar.
3. Si hay datos nuevos, en una sola transacción:
   - reemplaza el staging de esa fuente;
   - tipa fechas y valores en SQL;
   - aparta las filas que no sirven;
   - hace un upsert en el modelo por indicador y fecha;
   - recalcula los promedios mensuales de las series diarias.
4. Registra el resultado de la fuente y su frescura, también cuando falla.

Correr la carga dos veces deja las mismas filas, y un valor corregido en la fuente se actualiza en lugar de duplicarse.

**Faltantes y errores:** una fila con fecha inválida (que no es `AAAA-MM-DD` o no existe, como `2026-02-30`), con valor vacío o no numérico, o con una fecha repetida en la misma descarga se guarda en `control.fila_rechazada` con su motivo. No se rellena, no se interpola y no frena la carga del resto. Un mes sin observaciones no tiene fila. Si una fecha desaparece de la fuente, no se borra del modelo.

**Neon.** En producción la base está en el plan gratuito de Neon. El pipeline usa la URL directa, sin `-pooler` en el host, porque el advisory lock necesita una sesión propia. La URL lleva `sslmode=verify-full`. Límites del plan gratuito, según la [documentación de Neon](https://neon.com/docs/introduction/plans) y sus [preguntas frecuentes](https://neon.com/faqs/free-plan-limits-and-quotas), consultadas el 27/11/2026:

- 1 GB de almacenamiento por proyecto.
- 100 CU-horas de cómputo por proyecto y por mes.
- La base se suspende tras 5 minutos sin uso, no se puede desactivar y tarda unos segundos en despertar.
- Si se agota el cómputo, la base queda suspendida hasta el mes siguiente. Si se llena el almacenamiento, fallan las escrituras. En ningún caso se borran datos.

Con las tres series, la base ocupa unos pocos MB, y una corrida diaria dura segundos.

## API

API HTTP de solo lectura, hecha con Fastify. Devuelve JSON. La documentación interactiva (OpenAPI) está en `/docs` y se genera de los mismos schemas que validan cada pedido. Las fechas van como `AAAA-MM-DD` y los meses como `AAAA-MM`.

| Endpoint | Qué devuelve |
|---|---|
| `GET /simulacion?desde=2020-01&hasta=2025-01&monto=100000` | Las tres opciones (plazo fijo, dólar oficial y pesos quietos) con valor final nominal, valor real, resultado real en % y si le ganaron a la inflación. Suma la evolución mes a mes en pesos del mes final, hasta qué fecha llega cada fuente y el rango de meses válido |
| `GET /indicadores` | Cada indicador con nombre, unidad, fuente, periodicidad y rango de fechas con datos |
| `GET /series/dolar_minorista?desde=2026-11-01&hasta=2026-11-30` | La serie de un indicador, ordenada por fecha. Las series mensuales usan el primer día del mes |
| `GET /comparativa?indicadores=ipc_nacional,dolar_minorista&desde=2026-01&hasta=2026-10` | Dos o más indicadores alineados por mes. Por defecto da la variación % mensual (inflación del mes contra suba del dólar del mes). Con `medida=nivel` da los valores en su unidad. Un mes sin dato es `null` |
| `GET /frescura` | Cada fuente con su estado, último dato real, fecha declarada, fecha del chequeo y meses de atraso. Una fuente que nunca se verificó aparece como `sin_verificar` |

Ejemplo de `/simulacion?desde=2020-01&hasta=2025-01&monto=100000` (recortado):

```json
{
  "factorInflacion": 27.1336,
  "opciones": {
    "plazoFijo":    { "valorFinalNominal": 1375348.17, "valorReal": 50688.03, "resultadoRealPct": -49.31, "leGanoALaInflacion": false },
    "dolar":        { "valorFinalNominal": 1699989.90, "valorReal": 62652.60, "resultadoRealPct": -37.35, "leGanoALaInflacion": false },
    "pesosQuietos": { "valorFinalNominal": 100000,     "valorReal": 3685.47,  "resultadoRealPct": -96.31, "leGanoALaInflacion": false }
  },
  "evolucion": [{ "mes": "2020-01", "plazoFijo": 2713359.01, "dolar": 2713359.01, "pesosQuietos": 2713359.01 }, "..."],
  "datosHasta": { "ipc": "2026-10-01", "dolar": "2026-11-26", "tasa": "2026-11-25" },
  "rango": { "mesMinimo": "2016-12", "mesMaximo": "2026-10" }
}
```

**Errores.** Todos usan el mismo formato: `{ "error": { "codigo": "...", "mensaje": "..." } }`.

| Código | Status | Cuándo |
|---|---|---|
| `PARAMETRO_INVALIDO` | 400 | Un parámetro falta, tiene mal formato o no existe en la ruta |
| `RANGO_INVERTIDO` | 400 | `desde` es posterior a `hasta` |
| `PERIODO_INVALIDO` | 400 | En `/simulacion`, el mes final no es posterior al inicial o un mes está mal escrito |
| `MONTO_INVALIDO` | 400 | El monto no es un número mayor que 0 o supera 1e12 |
| `PERIODO_FUERA_DE_RANGO` | 400 | No hay datos para todo el período. El mensaje indica el rango válido |
| `INDICADOR_DESCONOCIDO` | 404 en `/series`, 400 en `/comparativa` | El indicador no existe |
| `RUTA_INEXISTENTE` | 404 | La ruta no existe |
| `DATOS_NO_DISPONIBLES` | 503 | La base no responde y la API todavía no tiene datos en memoria |
| `ERROR_INTERNO` | 500 | Error inesperado. Nunca incluye detalles de la base |

**Cómo protege el plan gratuito.** En el plan gratuito, pasarse de un límite no genera cobros, pero suspende el servicio. Para que un uso intensivo de la API no deje la base suspendida, hay tres capas:

1. **Datos en memoria.** La API lee todas las series de la base de una vez y las guarda en memoria por 1 hora. Cualquier consulta, incluida una simulación con cualquier monto y período, se responde desde ahí. Los pedidos simultáneos comparten una sola lectura. Si Neon no responde, la API sigue usando los últimos datos que tiene.
2. **Caché del CDN.** Las respuestas exitosas llevan `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`, así los pedidos repetidos ni llegan a la función.
3. **Tope de cómputo en Neon.** En el panel de Neon, en el proyecto, se edita la compute de la rama `production` y se fija el máximo de autoscaling en 0,25 CU. Así las 100 CU-horas del plan rinden unas 400 horas de base encendida por mes.

**Conexión.** La API usa `DATABASE_URL_POOLED`, la URL de Neon con `-pooler`. Si no está definida, usa `DATABASE_URL`. CORS permite `localhost` y los orígenes de `CORS_ORIGENES`, una lista separada por comas.

## Dashboard

Front en React 19 con Vite (workspace `web/`), con tres vistas: **Calculadora** (`/`), **Series** (`/series`) y **Estado de los datos** (`/datos`). Consume la API: la URL sale de `VITE_API_URL`, que en desarrollo es `http://127.0.0.1:3000`.

**Diseño.** Se buscó que no se viera como una plantilla:

- Paleta salvia con un color por opción.
- Tipografías Figtree, Bodoni Moda (para los montos de los billetes) y DM Mono (para las cifras).
- Gráficos en SVG propio en vez de una librería: hacían falta piezas a medida, como el billete desteñido y las anotaciones de hechos.

**El billete.** Es una ilustración inspirada en la serie argentina de animales (un hornero en un óvalo, un Sol de Mayo y tramas finas), pero no imita ningún billete real:

- Dice "INFLACIÓN VS AHORRO" y "MUESTRA SIN VALOR".
- No tiene número de serie, monto en letras, "República Argentina" ni el nombre del Banco Central.
- Los montos que muestra no existen como billetes.

**Interacción:**

- La parte lavada avanza cuando llega un resultado y los montos "cuentan" hasta el valor nuevo.
- Al pasar el mouse por un billete, se levanta y resalta su línea en el gráfico.
- El billete grande se inclina siguiendo el mouse.
- Todo se desactiva si el sistema pide reducir movimiento.

**Celular.** El gráfico se dibuja al ancho real de la pantalla para que las letras sigan legibles. Por debajo de 600 px, las anotaciones pasan a marcas numeradas con una lista. Los billetes y las tarjetas se apilan y la tabla se desplaza dentro de su caja.

**Accesibilidad.** Ganó o perdió siempre se dice en texto, no solo con color. Los billetes y gráficos tienen una descripción para lectores de pantalla. Los botones miden 44 px o más.

**Aviso legal.** Todas las vistas aclaran que es un proyecto educativo, que no es asesoramiento financiero ni recomendación de inversión, y que conviene consultar a un asesor registrado en la CNV.

## Arquitectura

```
 INDEC (datos.gob.ar)        BCRA
          │                    │
          └─────────┬──────────┘
                    ▼
 ┌──────────────────────────────┐
 │ 1. Ingesta (Node.js)         │  copia cruda con fecha y hash SHA-256
 └──────────────┬───────────────┘
                ▼
 ┌──────────────────────────────┐
 │ 2. Transformación y carga    │  tipos, series diarias a mensuales,
 │                              │  carga idempotente
 └──────────────┬───────────────┘
                ▼
 ┌──────────────────────────────────────────┐
 │ PostgreSQL (Neon)                        │
 │  staging:  datos tal cual llegan         │
 │  modelo:   dim_fecha, dim_indicador,     │
 │            hechos diarios y mensuales    │
 │  control:  ejecuciones y frescura        │
 └──────────────┬───────────────────────────┘
                ▼
 ┌──────────────────────────────┐
 │ 3. API (serverless)          │  /simulacion, /series, /comparativa,
 │                              │  /indicadores, /frescura
 └──────────────┬───────────────┘
                ▼
 ┌──────────────────────────────┐
 │ 4. Dashboard (React)         │  calculadora, series, tabla y CSV
 └──────────────────────────────┘

 5. GitHub Actions corre la ingesta y la carga todos los días.
```

## Decisiones de diseño

- **Copia cruda con hash.** Cada descarga se guarda tal como llega. Sirve para detectar cambios y para volver al dato original si la limpieza falla.
- **Dos capas en la base.** Staging guarda los datos sin tocar y el modelo los guarda limpios. Un error de limpieza se corrige sin volver a descargar.
- **Carga idempotente.** Correr la carga varias veces da el mismo resultado.
- **Chequeo de frescura.** Por cada fuente se registra hasta cuándo llegan los datos reales. La calculadora siempre muestra esa fecha.
- **No se inventan datos.** Los faltantes no se rellenan.
- **Costo cero.** Todo corre en planes gratuitos.

### Cambio de rumbo

El proyecto empezó como un observatorio de datos públicos de Córdoba. Al verificar las fuentes, el 25/11/2026, encontramos que las series cordobesas disponibles en portales abiertos no tenían datos nuevos (IPC de Córdoba hasta agosto de 2025, transporte urbano hasta abril de 2023) y que el portal provincial no respondía. Se pasó a fuentes nacionales que se actualizan solas y a una pregunta única.

## Stack

- Ingesta, transformación y API: Node.js
- Base de datos: PostgreSQL en Neon
- Dashboard: React 19 con Vite, React Router y gráficos en SVG propio
- Automatización: GitHub Actions
- Desarrollo local: Docker Compose

## Estado del proyecto

| Milestone | Contenido | Estado |
|---|---|---|
| M1 Ingesta | Verificación de APIs, descarga con copia cruda y chequeo de frescura | Hecho |
| M2 Base y carga | Esquema, series mensuales, cálculo de la simulación y carga idempotente | Hecho |
| M3 API | Simulación, series, comparativa, indicadores y frescura | Hecho |
| M4 Dashboard | Calculadora, series y tabla con CSV | Hecho |
| M5 Automatización y despliegue | Workflow diario, despliegue y Docker Compose | Pendiente |

Las tareas están en las [issues](https://github.com/nicote0/inflacion-vs-ahorro/issues) y los [milestones](https://github.com/nicote0/inflacion-vs-ahorro/milestones).

## Cómo correrlo

Requisitos: Node.js 20 o superior, y Docker para la base local.

```bash
npm install                          # en la raíz (npm workspaces: pipeline, simulacion, api y web)
cp .env.example .env                 # completar usuario, contraseña, base y las dos URLs
docker compose up -d                 # Postgres 17 local, con una base de desarrollo y una de tests
npm test                             # tests unitarios, sin red ni base
npm run test:db -w pipeline          # tests de integración contra la base de tests
npm run pipeline -w pipeline         # descarga, carga en la base de DATABASE_URL y registra la ejecución
npm run simular -w pipeline -- --desde 2020-01 --hasta 2025-01 --monto 100000
npm run test:db -w api               # integración de la API contra la base de tests
npm run api -w api                   # API en http://127.0.0.1:3000 (documentación en /docs)
npm run dev -w web                   # dashboard en http://localhost:5173 (con la API corriendo)
npm run build -w web                 # build estático del dashboard en web/dist
```

- **Base local o Neon:** `DATABASE_URL` puede apuntar al Postgres de Docker (`postgres://USUARIO:CLAVE@localhost:5432/BASE`) o a Neon. `TEST_DATABASE_URL` apunta a la base de tests local, que se crea sola con el sufijo `_test`. Los tests de integración borran y recrean su esquema, así que nunca hay que apuntarla a la base real. Si falta, `test:db` falla con un aviso; no se saltean en silencio.
- **`npm run simular`:** muestra las tres opciones y la evolución mes a mes. Con `--csv carpeta` exporta los insumos y cada renovación del plazo fijo.
- **`npm run ingesta -w pipeline`:** sigue funcionando sin base. Solo descarga, guarda las copias crudas en `data/raw/` con su manifiesto y escribe el estado de cada fuente en `data/frescura.json`.
- **Qué no se sube:** la carpeta `data/` y el `.env`.
- **Código de salida:** si alguna fuente falla, el proceso termina con 1.

## Licencia

MIT. Ver [LICENSE](LICENSE).
