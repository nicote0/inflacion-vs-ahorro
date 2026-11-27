# inflacion-vs-ahorro

**¿Qué le gana a la inflación?** Si en algún momento tenías pesos ahorrados, ¿te hubiera convenido un plazo fijo, comprar dólares o dejarlos quietos?

Este proyecto responde esa pregunta con datos oficiales del INDEC y del Banco Central, para el período y el monto que elijas. Incluye el recorrido completo de un producto de datos: ingesta automática, almacenamiento en PostgreSQL, API y un dashboard interactivo.

> El sitio muestra lo que pasó con datos históricos. No es una recomendación de inversión.

## Qué vas a poder hacer

```
 Si en  [ ene 2020 ▾ ]  tenía  [ $ 100.000 ]
 y lo miro en  [ oct 2026 ▾ ]       [Último año] [Desde 2020] [Todo]

 ┌──────────────────┬──────────────────┬──────────────────┐
 │ Plazo fijo       │ Dólar oficial    │ Pesos quietos    │
 │ valor final      │ valor final      │ valor final      │
 │ le ganó / perdió │ le ganó / perdió │ le ganó / perdió │
 └──────────────────┴──────────────────┴──────────────────┘
 [ Gráfico de las tres opciones mes a mes, en pesos de hoy ]
 Datos al día: INDEC <mes> · BCRA <fecha>
```

- Elegir mes inicial, mes final y monto, o usar un atajo de período.
- Ver cuánto tendrías con cada opción y si le ganó o le perdió a la inflación.
- Compartir la consulta con un link.
- Explorar cada serie por separado y descargar los datos en CSV.

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
- Dashboard: React con gráficos
- Automatización: GitHub Actions
- Desarrollo local: Docker Compose

## Estado del proyecto

| Milestone | Contenido | Estado |
|---|---|---|
| M1 Ingesta | Verificación de APIs, descarga con copia cruda y chequeo de frescura | Hecho |
| M2 Base y carga | Esquema, series mensuales, cálculo de la simulación y carga idempotente | Hecho |
| M3 API | Simulación, series, comparativa, indicadores y frescura | Pendiente |
| M4 Dashboard | Calculadora, series y tabla con CSV | Pendiente |
| M5 Automatización y despliegue | Workflow diario, despliegue y Docker Compose | Pendiente |

Las tareas están en las [issues](https://github.com/nicote0/inflacion-vs-ahorro/issues) y los [milestones](https://github.com/nicote0/inflacion-vs-ahorro/milestones).

## Cómo correrlo

Requisitos: Node.js 20 o superior, y Docker para la base local.

```bash
npm install                          # en la raíz (npm workspaces: pipeline y simulacion)
cp .env.example .env                 # completar usuario, contraseña, base y las dos URLs
docker compose up -d                 # Postgres 17 local, con una base de desarrollo y una de tests
npm test                             # tests unitarios, sin red ni base
npm run test:db -w pipeline          # tests de integración contra la base de tests
npm run pipeline -w pipeline         # descarga, carga en la base de DATABASE_URL y registra la ejecución
npm run simular -w pipeline -- --desde 2020-01 --hasta 2025-01 --monto 100000
```

- **Base local o Neon:** `DATABASE_URL` puede apuntar al Postgres de Docker (`postgres://USUARIO:CLAVE@localhost:5432/BASE`) o a Neon. `TEST_DATABASE_URL` apunta a la base de tests local, que se crea sola con el sufijo `_test`. Los tests de integración borran y recrean su esquema, así que nunca hay que apuntarla a la base real. Si falta, `test:db` falla con un aviso; no se saltean en silencio.
- **`npm run simular`:** muestra las tres opciones y la evolución mes a mes. Con `--csv carpeta` exporta los insumos y cada renovación del plazo fijo.
- **`npm run ingesta -w pipeline`:** sigue funcionando sin base. Solo descarga, guarda las copias crudas en `data/raw/` con su manifiesto y escribe el estado de cada fuente en `data/frescura.json`.
- **Qué no se sube:** la carpeta `data/` y el `.env`.
- **Código de salida:** si alguna fuente falla, el proceso termina con 1.

## Licencia

MIT. Ver [LICENSE](LICENSE).
