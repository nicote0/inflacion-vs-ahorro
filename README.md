# Observatorio de datos públicos de Córdoba

Pipeline, API y dashboard para datos públicos de la Provincia y la Ciudad de Córdoba, Argentina.

El proyecto cubre el recorrido completo de un producto de datos. Descarga datasets públicos, los limpia, los guarda en PostgreSQL, los expone en una API y los muestra en un dashboard web.

## Objetivo

- Automatizar la descarga de datasets públicos y conservar una copia cruda de cada versión.
- Limpiar y modelar los datos en PostgreSQL, con cargas que se pueden repetir sin duplicar filas.
- Exponer los indicadores en una API documentada.
- Visualizarlos en un dashboard con filtros por período y descarga en CSV.
- Mantener el costo en cero, usando planes gratuitos.

## Fuentes de datos

Antes de programar cada fuente se verifica su disponibilidad, formato, columnas y frecuencia de actualización. El resultado se documenta en esta sección.

| Fuente | Contenido | Formato esperado | Estado |
|---|---|---|---|
| [Datos Gestión Abierta, Provincia de Córdoba](https://datosgestionabierta.cba.gov.ar) | Datasets provinciales | CSV, XLSX | Pendiente de verificar |
| [datos.gob.ar](https://datos.gob.ar) | IPC de la Provincia de Córdoba (base 2014 = 100) | CSV | Pendiente de verificar |
| Gobierno Abierto, Municipalidad de Córdoba | Transporte | A confirmar | Pendiente de verificar |

## Arquitectura

```
 Portales de datos abiertos
            │
            ▼
 ┌─────────────────────┐
 │ 1. Ingesta (Node.js) │  descarga + copia cruda con fecha y hash
 └──────────┬──────────┘
            ▼
 ┌─────────────────────┐
 │ 2. Transformación   │  limpieza de columnas, tipos y faltantes
 │    y carga          │
 └──────────┬──────────┘
            ▼
 ┌─────────────────────────────────────┐
 │ PostgreSQL (Neon)                   │
 │  staging: datos tal cual llegan     │
 │  modelo: dim_fecha + hechos         │
 │  ejecuciones: registro del pipeline │
 └──────────┬──────────────────────────┘
            ▼
 ┌─────────────────────┐
 │ 3. API (serverless) │  indicadores, series, comparativas
 └──────────┬──────────┘
            ▼
 ┌─────────────────────┐
 │ 4. Dashboard React  │  gráficos, filtros, tabla y CSV
 └─────────────────────┘

 5. GitHub Actions ejecuta la ingesta de forma programada (cron).
```

## Stack

- Ingesta y transformación: Node.js
- Base de datos: PostgreSQL en Neon (plan gratuito)
- API: Node.js (Express o Fastify), desplegada como función serverless
- Dashboard: React con gráficos
- Automatización: GitHub Actions
- Desarrollo local: Docker Compose

## Estado del proyecto

| Milestone | Contenido | Estado |
|---|---|---|
| M1 Ingesta | Verificación de fuentes y descarga con copia cruda | Pendiente |
| M2 Base y carga | Esquema, limpieza, carga idempotente, registro de ejecuciones | Pendiente |
| M3 API | Endpoints, validación y documentación | Pendiente |
| M4 Dashboard | Gráficos, filtros y tabla con CSV | Pendiente |
| M5 Automatización y despliegue | Workflow programado, despliegue y Docker Compose | Pendiente |

El detalle de cada tarea está en las [issues](https://github.com/nicote0/observatorio-datos-cordoba/issues) y los [milestones](https://github.com/nicote0/observatorio-datos-cordoba/milestones).

## Cómo correrlo

Se completa a medida que avance el proyecto. Las credenciales se configuran con variables de entorno. El repo incluirá un `.env.example` con los nombres de las variables, sin valores.

## Licencia

MIT. Ver [LICENSE](LICENSE).
