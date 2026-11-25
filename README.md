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

El período comparable empieza en diciembre de 2016, primer mes del IPC nacional con esta base. Antes de programar cada fuente se confirma el formato de respuesta, la paginación y los límites de la API ([#20](https://github.com/nicote0/inflacion-vs-ahorro/issues/20), [#44](https://github.com/nicote0/inflacion-vs-ahorro/issues/44)).

## Cómo se calcula

- **Inflación del período:** IPC del mes final dividido por el IPC del mes inicial.
- **Pesos quietos:** el monto no cambia. Se mide cuánto poder de compra perdió.
- **Dólar oficial:** compra al tipo de cambio promedio del mes inicial y valorización al promedio del mes final.
- **Plazo fijo:** se renueva cada 30 días con la tasa vigente el día de la renovación. Un último tramo menor a 30 días no suma intereses.
- **Resultado real:** cuánto ganó o perdió cada opción después de descontar la inflación.

Supuestos: no se consideran impuestos ni comisiones, y el dólar se toma al precio de venta. El detalle está en el [documento de diseño](docs/superpowers/specs/2026-11-25-inflacion-vs-ahorro-design.md).

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
| M1 Ingesta | Verificación de APIs, descarga con copia cruda y chequeo de frescura | En curso |
| M2 Base y carga | Esquema, series mensuales, cálculo de la simulación y carga idempotente | Pendiente |
| M3 API | Simulación, series, comparativa, indicadores y frescura | Pendiente |
| M4 Dashboard | Calculadora, series y tabla con CSV | Pendiente |
| M5 Automatización y despliegue | Workflow diario, despliegue y Docker Compose | Pendiente |

Las tareas están en las [issues](https://github.com/nicote0/inflacion-vs-ahorro/issues) y los [milestones](https://github.com/nicote0/inflacion-vs-ahorro/milestones).

## Cómo correrlo

Se completa a medida que avance el proyecto. Las credenciales se configuran con variables de entorno. El repo incluirá un `.env.example` con los nombres de las variables, sin valores.

## Licencia

MIT. Ver [LICENSE](LICENSE).
