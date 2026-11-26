# Diseño: inflacion-vs-ahorro

Fecha: 2026-11-25. Estado: borrador para aprobar.

## Intención

Proyecto de portfolio de Nicolás (estudiante de Ingeniería en Software) para buscar una pasantía. Tiene que mostrar el recorrido completo de un producto de datos (ingesta, almacenamiento, API y visualización) con buena calidad de software, alrededor de un tema coherente que se entienda en una frase.

La pregunta del producto: **si en un momento tenía cierta cantidad de pesos, ¿qué le hubiera ganado a la inflación: un plazo fijo, comprar dólares o dejarlos quietos?**

### Por qué cambió el plan

La primera versión era un observatorio de datos públicos de Córdoba. Al verificar las fuentes el 25/11/2026 encontramos que las series cordobesas disponibles en portales abiertos no reciben datos nuevos (IPC de Córdoba hasta 2025-08, transporte urbano hasta 2023-04) y que el portal provincial no respondía. Además eran temas sueltos. Se cambió a fuentes nacionales al día y un tema único.

## Objetivos

- Calculadora interactiva que responde la pregunta para cualquier período y monto.
- Datos oficiales al día, actualizados de forma automática.
- Pipeline completo y defendible en una entrevista: copia cruda con hash, staging y modelo, carga idempotente, registro de ejecuciones.
- API documentada y dashboard usable en celular.
- Costo cero.

## No objetivos

- Recomendar inversiones. El sitio muestra lo que pasó, no qué conviene hacer.
- Cotizaciones no oficiales (dólar blue, MEP, CCL).
- Otros instrumentos en la primera versión (plazo fijo UVA, acciones, cripto). Quedan como posible ampliación.
- Cuentas de usuario o datos personales.

## Anti-objetivos

- Inventar o rellenar datos faltantes.
- Mostrar un resultado sin dejar claro hasta qué fecha llegan los datos.
- Esquivar bloqueos de sitios o hacer scraping de páginas.
- Presentar una simplificación del cálculo como si fuera exacta: cada supuesto se explica en la página.

## Fuentes

Verificadas el 25/11/2026.

| Serie | Fuente | Periodicidad | Desde | Último dato |
|---|---|---|---|---|
| IPC nacional, nivel general, base dic 2016 | API de series de tiempo de datos.gob.ar, ID `148.3_INIVELNAL_DICI_M_26` | Mensual | 2016-12 | 2026-10 |
| Tipo de cambio minorista, promedio vendedor | API de estadísticas del BCRA v4, variable 4 | Diaria (días hábiles) | 2010-06-01 | 2026-11-25 |
| Tasa de depósitos a 30 días de plazo (TNA, %) | API de estadísticas del BCRA v4, variable 12 | Diaria (días hábiles) | 1985-08-26 | 2026-11-24 |

La variable 12 es el promedio de todos los depositantes, incluidas empresas. Se eligió sobre la 1190 (personas humanas, todos los plazos) porque coincide con la renovación cada 30 días del cálculo (decisión del 26/11/2026). Formato, paginación y límites de cada API: ver `docs/superpowers/plans/2026-11-26-m1-ingesta.md`.

El período comparable arranca en 2016-12, primer mes del IPC nacional con esta base.

## Cálculo

La calculadora trabaja por meses. El usuario elige mes inicial, mes final y monto en pesos.

- **Inflación del período:** `factor = IPC(mes final) / IPC(mes inicial)`.
- **Debajo del colchón:** el monto nominal no cambia. Valor real = `monto / factor`.
- **Dólar oficial:** se compran dólares al promedio mensual del tipo de cambio minorista del mes inicial y se valorizan al promedio del mes final. Supuesto: la serie es la de venta, no se descuenta la diferencia con el precio de compra.
- **Plazo fijo renovado:** se constituye el primer día hábil del mes inicial y se renueva cada 30 días con la tasa vigente ese día: `monto = monto × (1 + TNA/100 × 30/365)`. Se cuentan las renovaciones completas hasta el último día del mes final. Supuestos: sin impuestos ni comisiones, y la tasa de la variable 12 como tasa de referencia.
- **Resultado real de cada opción:** `(valor final nominal / factor / monto − 1) × 100`, en porcentaje. Positivo: le ganó a la inflación.

Reglas de borde:

- El mes final tiene que ser posterior al inicial. El monto tiene que ser mayor que 0.
- Si un día de renovación no tiene tasa publicada (feriado o fin de semana), se usa la última tasa publicada antes de ese día.
- El tramo final menor a 30 días no genera intereses: el plazo fijo no se cobra antes de vencer.

El mes final máximo es el último mes con IPC publicado, para que las tres opciones sean comparables. Las series diarias pueden estar más adelante y se muestran como "último dato" aparte.

Para usar promedios mensuales, las series diarias se agregan a meses en la etapa de transformación.

## Enfoques considerados

1. **"¿Qué le gana a la inflación?" (elegido).** Inflación frente a plazo fijo y dólar. Pregunta clara, fuentes al día y trabajo de datos real (alinear series diarias y mensuales, calcular rendimiento real).
2. **Monitor de precios.** Solo IPC por rubro y región. Más simple, pero se mueve una vez por mes y es menos interactivo.
3. **Observatorio de Córdoba (plan original).** Descartado: fuentes sin datos nuevos y temas sin relación entre sí.

## Arquitectura

1. **Ingesta (Node.js).** Descarga cada serie de su API, guarda copia cruda con fecha y hash SHA-256 en un manifiesto, saltea si el hash no cambió y sigue con las demás si una falla.
2. **Transformación y carga.** Staging con los datos tal cual llegan. Modelo con `dim_fecha`, `dim_indicador` (nombre, unidad, fuente, periodicidad), hechos diarios y hechos mensuales. Agregación de diarios a mensuales. Carga idempotente por clave única indicador + fecha.
3. **Control.** Tabla de ejecuciones (inicio, fin, fuente, filas, errores, estado) y tabla de frescura por fuente (último dato real, fecha declarada por la fuente, fecha del chequeo, estado).
4. **API serverless.**
   - `GET /indicadores`: lista con unidad, fuente, periodicidad y rango de fechas.
   - `GET /series/:indicador?desde&hasta`: serie de un indicador.
   - `GET /comparativa?indicadores&desde&hasta`: varias series alineadas por mes.
   - `GET /simulacion?desde&hasta&monto`: resultado de las tres opciones, con valor final nominal, valor real, resultado real en % y la evolución mes a mes.
   - `GET /frescura`: estado de cada fuente.
   - Validación de parámetros (400 con mensaje claro), formato único de errores, 500 sin detalles internos, CORS limitado.
5. **Dashboard (React).**
   - Pantalla principal: calculadora con mes inicial, mes final, monto y atajos de período (último año, desde 2020, todo). Tres tarjetas con el resultado y un gráfico de las tres opciones mes a mes en pesos de hoy. Línea al pie con la fecha de los datos de cada fuente. La consulta se guarda en la URL para compartirla.
   - Vista de series con filtros por período.
   - Tabla con descarga en CSV (UTF-8 con BOM).
   - Sección "cómo se calcula" con los supuestos.
6. **Automatización.** GitHub Actions con cron diario (las series del BCRA son diarias) y ejecución manual. Credenciales en GitHub Secrets.
7. **Local.** Docker Compose con PostgreSQL, API y front.

## Decisiones ya tomadas

- Stack JavaScript: Node.js, PostgreSQL en Neon, React, GitHub Actions, Docker Compose. Railway no se usa.
- Costo cero.
- Repo público `nicote0/inflacion-vs-ahorro` (renombrado desde `observatorio-datos-cordoba`), licencia MIT.
- Milestones M1 Ingesta, M2 Base y carga, M3 API, M4 Dashboard, M5 Automatización y despliegue.
- Nunca subir credenciales: variables de entorno y `.env.example` sin valores.

## Decisiones de Claude (corregibles)

- Plazo fijo renovado cada 30 días con la tasa del día de renovación.
- Dólar valorizado con promedios mensuales, para alinear con el IPC.
- Cálculo en la API, no en el navegador.
- Consulta guardada en la URL.
- Cron diario.

## Queda a criterio del implementador

- Express o Fastify.
- Librería de gráficos.
- Hosting del front (Cloudflare Pages, Netlify o Vercel) y proveedor de la función serverless.
- Formato de la documentación de la API (OpenAPI u otro).
