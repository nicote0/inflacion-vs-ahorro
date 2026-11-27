# Diseño: M3 API

Fecha: 2026-11-27. Estado: aprobado por Nico el 2026-11-27.

Diseño general: `docs/superpowers/specs/2026-11-25-inflacion-vs-ahorro-design.md` (sección Arquitectura, punto 4). Base de datos: `docs/superpowers/specs/2026-11-26-m2-base-y-carga-design.md`. Issues: #31, #32, #33, #34, #35 y #47.

## Intención

M2 dejó las series cargadas en Postgres (Neon) y la simulación como paquete JS. M3 las expone en una API HTTP que va a consumir la calculadora web de M4. Para el portfolio, M3 muestra una API documentada, con validación de entrada, errores consistentes y cuidado del plan gratuito.

## Objetivos

- Cinco endpoints: `GET /simulacion`, `GET /indicadores`, `GET /series/:indicador`, `GET /comparativa` y `GET /frescura`.
- Validación de parámetros y un único formato de error en todos los endpoints (#35).
- Documentación OpenAPI generada a partir de las mismas definiciones que validan, con una página interactiva en `/docs`.
- La API no puede agotar el plan gratuito de Neon aunque reciba muchas consultas.
- La misma app corre local (`npm run api`) y, en M5, como función serverless en Vercel.

## No objetivos

- El despliegue en Vercel (#41, M5). M3 deja la app lista para envolverla en una función, pero no la publica.
- Autenticación, cuentas o escritura de datos. La API es de solo lectura.
- Rate limit por IP. Si el plan gratuito de Vercel incluye una regla de firewall para esto, se evalúa en M5.

## Anti-objetivos

- Rellenar datos faltantes. Donde no hay dato, la respuesta dice `null`.
- Exponer detalles internos en un error 500: mensajes de Postgres, SQL, URLs ni credenciales.
- Duplicar el cálculo de la simulación: la API usa el paquete `simulacion` de M2.
- Una respuesta sin la fecha hasta la que llegan los datos de cada fuente usada.

## Enfoques considerados

1. **Elegido: Fastify en Vercel.** Fastify valida cada pedido con JSON Schema y `@fastify/swagger` genera la documentación OpenAPI con esos mismos schemas, así validación y documentación no se desincronizan. En Vercel, la API y el front de M4 quedan en el mismo dominio.
2. **Express en Vercel.** Es más conocido, pero la validación y la documentación OpenAPI van por separado y hay que mantenerlas a mano.
3. **Hono en Cloudflare Workers.** Es muy liviano, pero conectarse a Postgres desde Workers suma configuración y piezas.

Nico delegó la elección a Claude el 2026-11-27.

## Protección del plan gratuito

Nico pidió explícitamente que un uso intensivo no pueda dejar la base suspendida. En el plan gratuito, superar un límite nunca genera un cobro, pero suspende el servicio. Hay tres capas:

1. **Datos en memoria.** Las tres series ocupan unas 5000 filas. La API las lee completas de la base, con un solo conjunto de consultas, y las guarda en memoria por 1 hora (una "foto" de los datos). Todos los endpoints responden desde esa foto, incluida la simulación con cualquier monto y período. La base recibe, como mucho, una lectura por hora por cada instancia de la función.
2. **Caché HTTP.** Las respuestas exitosas llevan `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`, para que el CDN de Vercel responda los pedidos repetidos sin ejecutar la función. Los errores llevan `Cache-Control: no-store`.
3. **Tope de cómputo en Neon.** Es una configuración del proyecto en Neon, no código: el autoscaling queda fijo en 0,25 CU como máximo. Se documenta en el README y Nico lo configura en el panel; Claude le indica dónde.

Si refrescar la foto falla (por ejemplo, Neon no responde) y ya había una foto anterior, se sigue usando la anterior y se reintenta en el próximo pedido después de 1 minuto. Si no había ninguna, el endpoint responde 503 con el formato de error.

## Endpoints

Todos devuelven JSON. Las fechas van como `AAAA-MM-DD` y los meses como `AAAA-MM`.

### `GET /indicadores` (#31)

Por indicador: `id`, `nombre`, `unidad`, `fuente`, `periodicidad`, `desde` y `hasta` (primera y última fecha con dato).

### `GET /series/:indicador?desde=AAAA-MM-DD&hasta=AAAA-MM-DD` (#32)

Devuelve `{ indicador: { id, nombre, unidad, periodicidad }, datos: [{ fecha, valor }] }`, ordenado por fecha ascendente. Los filtros son opcionales e inclusivos. En las series mensuales, `fecha` es el primer día del mes. Un indicador inexistente da 404 (`INDICADOR_DESCONOCIDO`). Valores tal como están en `hecho_diario` o en `hecho_mensual` con `origen = 'fuente'`, sin promedios.

### `GET /comparativa?indicadores=a,b&desde=AAAA-MM&hasta=AAAA-MM&medida=variacion_mensual|nivel` (#33)

Alinea dos o más indicadores por mes. #33 pide comparar "inflación mensual contra variación del dólar", y comparar el nivel del IPC (un índice) con el precio del dólar no tiene sentido directo. Por eso:

- `medida=variacion_mensual` (valor por defecto): variación porcentual de cada indicador contra el mes anterior, en `%`. Para el IPC es la inflación mensual. Para el dólar y la tasa, se usa el promedio mensual.
- `medida=nivel`: el valor mensual (IPC tal cual; dólar y tasa como promedio mensual), cada uno en su unidad.

Respuesta: `{ medida, meses: ['AAAA-MM', ...], series: [{ id, nombre, unidad, valores: [n|null, ...] }], unidadesDistintas: boolean }`, donde `valores` está alineado con `meses`. Un mes sin dato es `null`. La variación de un mes también es `null` si falta el mes anterior. `unidadesDistintas` es `true` si las series no comparten unidad (#33 pide informarlo). En `variacion_mensual` todas las unidades son `%`.

Errores: menos de 2 indicadores, un indicador desconocido en la lista o una medida inválida dan 400.

### `GET /frescura` (#34)

Una entrada por cada indicador de `dim_indicador`, aunque no tenga fila en `control.frescura`. Si no la tiene, va con `estado: 'sin_verificar'` y el resto en `null`. Así, una fuente caída o nunca verificada no se oculta.

Campos: `id`, `nombre`, `estado` (`vigente`, `desactualizado`, `sin_datos` o `sin_verificar`), `ultimaObservacion`, `ultimaFechaDeclarada`, `fechaChequeo`, `diasDesdeFinDelPeriodo` y `mesesDeAtraso`. `mesesDeAtraso` es la cantidad de meses calendario entre el mes de la última observación y el mes del chequeo. El IPC de octubre chequeado en noviembre da 1, y el dólar de ayer da 0.

### `GET /simulacion?desde=AAAA-MM&hasta=AAAA-MM&monto=N` (#47)

Corre `simular()` con los insumos de la foto en memoria. Devuelve:

- `factorInflacion`.
- `opciones`: `plazoFijo`, `dolar` y `pesosQuietos`, cada una con `valorFinalNominal`, `valorReal`, `resultadoRealPct` y `leGanoALaInflacion` (boolean, `resultadoRealPct > 0`).
- `evolucion`: en pesos del mes final, como en M2. El texto "pesos de hoy" de #47 se cumple cuando el mes final es el último disponible; se documenta así.
- `datosHasta`: `{ ipc, dolar, tasa }`, la última fecha con dato de cada fuente usada.
- `rango`: `{ mesMinimo, mesMaximo }`. El mínimo es `2016-12` y el máximo es el último mes con IPC publicado.

No incluye las `renovaciones`, para mantener chica la respuesta.

Errores, siempre 400 y con el formato común:
- `PERIODO_INVALIDO`: `hasta` no es posterior a `desde`, o un mes está mal escrito.
- `MONTO_INVALIDO`: el monto no es un número mayor que 0. Tope: `1e12`, para evitar números absurdos.
- `PERIODO_FUERA_DE_RANGO`: `desde` o `hasta` está fuera de `rango`, o la simulación lanza `FALTA_IPC`, `FALTA_DOLAR` o `SIN_TASA`. El mensaje incluye el rango válido.

## Errores (#35)

Formato único: `{ "error": { "codigo": "TEXTO_EN_MAYUSCULAS", "mensaje": "texto claro en español" } }`.

- **400 `PARAMETRO_INVALIDO`:** falla la validación de Fastify por JSON Schema (formato de fecha o mes, monto no numérico, parámetro de más). Se traduce al formato común con un mensaje que nombra el parámetro.
- **400 `RANGO_INVERTIDO`:** en `/series` y `/comparativa`, `desde` es posterior a `hasta`.
- **400 o 404 `INDICADOR_DESCONOCIDO`:** 404 cuando el indicador va en la ruta (`/series/:indicador`) y 400 cuando va en la lista de `/comparativa`. #32 pide 404 para la ruta y #35 pide 400 para un parámetro.
- **404 `RUTA_INEXISTENTE`:** la ruta no existe.
- **503 `DATOS_NO_DISPONIBLES`:** no hay foto de los datos y la base no responde.
- **500 `ERROR_INTERNO`:** siempre con el mensaje fijo "Ocurrió un error interno". El detalle va solo al log del servidor.

## CORS

Con `@fastify/cors`, se permiten solo los orígenes de la variable `CORS_ORIGENES` (lista separada por comas) y `http://localhost:<cualquier puerto>`. En producción, el front y la API comparten dominio, así que CORS solo importa en desarrollo y para otros orígenes.

## Organización del código

- Workspace nuevo `api/`, con dependencias `fastify`, `@fastify/swagger`, `@fastify/swagger-ui`, `@fastify/cors`, `pg` y `simulacion`.
- `crearApp({ obtenerFoto })` arma la app sin escuchar en un puerto. `obtenerFoto()` devuelve la foto de los datos. Los tests le pasan una foto falsa; producción le pasa el cargador con caché.
- El cargador lee la foto de la base con una conexión que se abre y se cierra en cada refresco. No usa un pool, porque en serverless un pool vivo por instancia no aporta y consume conexiones. Usa `DATABASE_URL_POOLED`, la URL de Neon con `-pooler`, porque la API no necesita advisory locks. Si no está definida, usa `DATABASE_URL`, que en local es la de Docker.
- `src/servidor.js` escucha en `PORT` (por defecto 3000) para `npm run api`. La función de Vercel de M5 envuelve `crearApp`.
- `.env.example` suma `DATABASE_URL_POOLED` y `CORS_ORIGENES`, sin valores.

La foto tiene esta forma (los nombres exactos quedan a criterio del implementador): indicadores con su rango, la serie mensual de cada indicador (IPC de la fuente y promedios de dólar y tasa), las series diarias de dólar y tasa, y la frescura. Cada endpoint es una función pura sobre la foto.

## Tests

- Unitarios, sin base, con `app.inject()` y una foto falsa chica: cada endpoint, cada código de error, el formato de error, los headers de caché, CORS y que un 500 no filtre el mensaje original.
- El cálculo de la variación mensual y de `mesesDeAtraso` tiene casos calculados a mano.
- Integración (`test:db`, base de tests de Docker): el cargador arma la foto desde una base con datos sembrados.
- Verificación real: `npm run api` contra Neon, y una llamada a cada endpoint con `curl`, incluidos dos errores. `/simulacion` 2020-01 a 2025-01 con 100000 tiene que dar lo mismo que `npm run simular` y que la planilla de M2.

## Verificación de cierre de M3

- Las llamadas reales anteriores, con su salida mostrada a Nico.
- `/docs` muestra los cinco endpoints con sus parámetros y respuestas.
- README: sección API con los endpoints, un ejemplo de cada uno, el formato de error, cómo correrla, y las tres capas de protección del plan gratuito, con la indicación para fijar 0,25 CU en Neon.

## Queda a criterio del implementador

- La forma interna de la foto y los nombres de los módulos.
- Los textos exactos de los mensajes de error, siempre en español claro.
- Si `/series` y `/comparativa` exigen las dos fechas o aceptan solo una.
- La versión de OpenAPI que genera `@fastify/swagger`.
