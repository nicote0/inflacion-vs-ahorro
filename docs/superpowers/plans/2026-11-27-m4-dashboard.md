# M4 Dashboard — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Front React (workspace `web/`) con la calculadora del billete desteñido, la vista Series con tabla y CSV, y Estado de los datos, consumiendo la API de M3.

**Architecture:** Lógica pura (períodos, URL, veredicto, CSV, anotaciones) en módulos sin React, testeados con Vitest. Componentes SVG propios (`Billete`, `GraficoLineas`). Tres páginas con React Router. Un cliente de API inyectable para testear las páginas sin red.

**Tech Stack:** React 19.3, Vite 8, React Router 7, Vitest 5 + jsdom + Testing Library. CSS plano con variables.

**Spec:** `docs/superpowers/specs/2026-11-27-m4-dashboard-design.md` (aprobado el 2026-11-27). Maqueta: lienzo "Inflación vs ahorro — calculadora", artboard "Billete B · desteñido (completo)".

## Global Constraints

- Colores: fondo `#EEF0EA`, tinta `#1F2A24`, líneas `#C8D0C6`, texto secundario `#3B4740`/`#4D5A52`, "perdió" `#9A3A12`. Dólar `#24493A` (billete `#D6E2D9`), plazo fijo `#1E3F8A` / línea `#2856C4` (billete `#D9E1EF`), pesos quietos `#8F3612` / línea `#D9622B` (billete `#F2DCCE`).
- Tipografías de Google Fonts: Figtree (texto), Bodoni Moda (montos del billete), DM Mono (cifras).
- Sin sombras, degradés decorativos ni emojis. "Ganó"/"perdió" siempre en texto, no solo color.
- Billete: "INFLACIÓN VS AHORRO", monto con "$", "MUESTRA SIN VALOR · <MES AÑO>". Sin número de serie, sin monto en letras, sin "República Argentina" ni "Banco Central".
- Todo número sale de la API. La URL de la API sale de `VITE_API_URL` (dev: `http://127.0.0.1:3000`).
- Textos en español rioplatense. Commits como en M1–M3, push solo con OK de Nico. Costo cero.

## Review Focus

1. **Monto con puntos o vacío en el campo** (`100.000`, `1.000.000,50`, `""`): se interpreta como pesos enteros (`100000`) o se muestra el aviso; nunca pide `/simulacion?monto=NaN`. Test en la Tarea 1 (`leerMonto`).
2. **URL compartida con parámetros fuera de rango o mal escritos** (`?desde=2030-01`, `?monto=abc`): se cae a los valores por defecto sin romper la página. Test en la Tarea 1.
3. **Respuestas viejas que llegan tarde** (el usuario cambia el período dos veces rápido): se muestra la última consulta, no la que tardó más. Test en la Tarea 5.
4. **Una opción que le ganó a la inflación:** billete sin desteñir, "le ganó N %" y veredicto acorde. Test en las Tareas 1 y 3.
5. **API caída al abrir la página:** mensaje claro y la oración sigue usable. Test en la Tarea 5.

---

## Estructura de archivos

```
web/
  package.json, vite.config.js, index.html
  src/main.jsx                 monta <App api={crearApi(...)}>
  src/App.jsx                  router, encabezado y pie
  src/estilos.css              variables y estilos base
  src/logica/periodo.js        meses y atajos
  src/logica/consulta.js       URL <-> consulta, lectura del monto
  src/logica/resultado.js      ranking, perdido, veredicto
  src/logica/formato.js        pesos, porcentajes, meses en texto
  src/logica/anotaciones.js    hechos anotados e inflación anual
  src/logica/csv.js            armado del CSV
  src/api.js                   cliente de la API
  src/componentes/Billete.jsx
  src/componentes/GraficoLineas.jsx
  src/paginas/Calculadora.jsx, Series.jsx, Datos.jsx
  test/*.test.js(x), test/setup.js, test/datos.js (respuestas falsas)
```

## Tipos compartidos

```js
// Consulta = { desde: 'AAAA-MM', hasta: 'AAAA-MM', monto: number }
// Rango = { mesMinimo: 'AAAA-MM', mesMaximo: 'AAAA-MM' }
// Respuesta de /simulacion: ver docs/superpowers/specs/2026-11-27-m3-api-design.md
// OpcionOrdenada = { clave: 'plazoFijo'|'dolar'|'pesosQuietos', nombre, valorFinalNominal, valorReal,
//                    resultadoRealPct, gano: boolean, perdido: 0..100, puesto: string }
```

`test/datos.js` exporta `simulacionCasoA()`: la respuesta de `/simulacion?desde=2020-01&hasta=2020-03&monto=1000` sobre el caso A de M2 (factor 2; plazo fijo 1060.9 / −46.955 %; dólar 3000 / +50 %; pesos quietos 1000 / −50 %; `rango` `2019-12`..`2020-03`; `datosHasta` `{ ipc: '2020-03-01', dolar: '2020-03-02', tasa: '2020-01-02' }`), y `frescuraFalsa()` con tres fuentes, una `sin_verificar`.

---

### Task 1: Workspace `web` y lógica pura (#48)

**Files:**
- Create: `web/package.json`, `web/vite.config.js`, `web/index.html`, `web/test/setup.js`, `web/src/logica/periodo.js`, `consulta.js`, `resultado.js`, `formato.js`
- Modify: `package.json` (raíz: sumar `"web"` a `workspaces`)
- Test: `web/test/periodo.test.js`, `consulta.test.js`, `resultado.test.js`, `formato.test.js`

**Interfaces:**
- Produces:
  - `sumarMeses(mes, n) -> 'AAAA-MM'`; `atajo(nombre: 'ultimoAnio'|'desde2020'|'todo', rango) -> { desde, hasta }` (Último año = máximo − 12 meses; Desde 2020 = `2020-01` o el mínimo si es posterior; Todo = mínimo).
  - `leerMonto(texto: string) -> number|null` (quita `$`, puntos y espacios; descarta la parte decimal después de una coma; `null` si queda vacío o no es > 0).
  - `leerConsulta(search: string, rango) -> Consulta` (por defecto Desde 2020 y 100000; un parámetro inválido o fuera de rango cae a su valor por defecto); `escribirConsulta(consulta) -> '?desde=…&hasta=…&monto=…'`.
  - `ordenarOpciones(opciones) -> OpcionOrdenada[]` (de mayor a menor `resultadoRealPct`; `perdido = clamp(round(−pct), 0, 100)`; `gano = pct > 0`; puesto `1.º · el que más ganó` si el primero ganó, si no `1.º · el que menos perdió`; después `2.º`, `3.º`). Nombres: Plazo fijo, Dólar oficial, Pesos quietos.
  - `textoVeredicto(opcionesOrdenadas) -> string`: ninguna ganó → `Ninguna le ganó a la inflación`; todas → `Las tres le ganaron a la inflación`; si no → `Le ganó a la inflación: <nombres separados por " y ">`.
  - `pesos(n) -> '$1.699.990'` (sin decimales, es-AR); `porcentaje(n) -> '37,3 %'` (1 decimal, valor absoluto); `factor(n) -> '27,13'`; `nombreMes('2020-01', { largo }) -> 'ene 2020' | 'enero 2020'`; `mesEnMayusculas('2020-01') -> 'ENERO 2020'`.

`web/package.json`: `"type": "module"`, scripts `"dev": "vite"`, `"build": "vite build"`, `"test": "vitest run"`. Dependencias: `react@19.3.1`, `react-dom@19.3.1`, `react-router-dom@7.18.7`; dev: `vite@8.4.0`, `@vitejs/plugin-react@6.3.0`, `vitest@5.1.2`, `jsdom@31.0.1`, `@testing-library/react@16.3.3`, `@testing-library/jest-dom@8.0.0`, `@testing-library/user-event@14.6.13`. `vite.config.js` con `test: { environment: 'jsdom', setupFiles: './test/setup.js' }`.

- [ ] **Step 1: Write the failing tests:**
  - `sumarMeses('2020-01', -1)` = `'2019-12'`; `sumarMeses('2024-11', 14)` = `'2026-01'`.
  - `atajo` con rango `2016-12`..`2026-10`: `ultimoAnio` = `{ desde: '2025-10', hasta: '2026-10' }`; `desde2020` = `{ '2020-01', '2026-10' }`; `todo` = `{ '2016-12', '2026-10' }`. Con mínimo `2021-03`, `desde2020` empieza en `2021-03`.
  - `leerMonto`: `'100.000'` → 100000; `'$ 1.000.000,50'` → 1000000; `''` → null; `'0'` → null; `'abc'` → null.
  - `leerConsulta('?desde=2021-05&hasta=2023-01&monto=5000', rango)` = esos valores; `leerConsulta('', rango)` = `{ '2020-01', '2026-10', 100000 }`; `'?desde=2030-01&monto=abc'` = valores por defecto; `hasta` anterior a `desde` = valores por defecto. `escribirConsulta` da `?desde=2020-01&hasta=2025-01&monto=100000`.
  - `ordenarOpciones` sobre el caso A (dólar +50, plazo fijo −46.955, pesos quietos −50): orden dólar, plazo fijo, pesos quietos; dólar `gano: true`, `perdido: 0`, puesto `1.º · el que más ganó`; plazo fijo `perdido: 47`; pesos quietos `perdido: 50`.
  - `textoVeredicto`: caso A → `Le ganó a la inflación: Dólar oficial`; todas negativas → `Ninguna le ganó a la inflación`; dos positivas → `Le ganó a la inflación: Dólar oficial y Plazo fijo`; tres → `Las tres le ganaron a la inflación`.
  - `pesos(1699989.9)` = `'$1.699.990'`; `porcentaje(-37.347)` = `'37,3 %'`; `factor(27.1336)` = `'27,13'`; `nombreMes('2020-01')` = `'ene 2020'`; `nombreMes('2020-01', { largo: true })` = `'enero 2020'`; `mesEnMayusculas('2025-01')` = `'ENERO 2025'`.
- [ ] **Step 2: Run** `npm install` y `npm test -w web`. Expected: FAIL (módulos inexistentes).
- [ ] **Step 3: Implement** los cuatro módulos.
- [ ] **Step 4: Run** `npm test` en la raíz. Expected: PASS en los cuatro workspaces.
- [ ] **Step 5: Commit** `feat(web): proyecto del front y lógica de períodos, URL y veredicto`.

### Task 2: Cliente de la API

**Files:**
- Create: `web/src/api.js`
- Test: `web/test/api.test.js`

**Interfaces:**
- Produces: `class ErrorApi extends Error { codigo, status }`; `crearApi({ base, fetch = globalThis.fetch }) -> { simulacion(consulta), indicadores(), serie(id, { desde, hasta }), comparativa({ indicadores, desde, hasta, medida }), frescura() }`. Cada método devuelve el JSON. Un status no 2xx lanza `ErrorApi` con `codigo` y `mensaje` del cuerpo; una falla de red lanza `ErrorApi('SIN_CONEXION', 'No se pudo conectar con la API.', 0)`. Los parámetros `undefined` no van a la URL.

- [ ] **Step 1: Write the failing tests** (fetch falso que registra la URL): `simulacion` pide `<base>/simulacion?desde=2020-01&hasta=2025-01&monto=100000`; `serie('ipc_nacional', {})` pide `<base>/series/ipc_nacional` sin `?`; un 400 con `{error:{codigo:'MONTO_INVALIDO',mensaje:'x'}}` lanza `ErrorApi` con ese código, mensaje y status 400; un `fetch` que rechaza lanza `SIN_CONEXION`.
- [ ] **Step 2: Run** `npm test -w web`. Expected: FAIL.
- [ ] **Step 3: Implement** `api.js`.
- [ ] **Step 4: Run** `npm test -w web`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): cliente de la API con errores uniformes`.

### Task 3: Componente `Billete`

**Files:**
- Create: `web/src/componentes/Billete.jsx`, `web/src/componentes/billete.css`
- Test: `web/test/Billete.test.jsx`

**Interfaces:**
- Consumes: `pesos`, `mesEnMayusculas` (Tarea 1).
- Produces: `<Billete monto={number} mes="AAAA-MM" perdido={0..100} ganoPct={number|null} colores={{ fondo, tinta, acento }} />`. SVG `viewBox="0 0 460 200"` con el diseño de la maqueta (spec, sección "El billete"): marco doble, tramado de óvalos, ondas, óvalo con hornero, Sol de Mayo, "INFLACIÓN VS AHORRO", monto grande con halo, "MUESTRA SIN VALOR · <MES>". Con `perdido > 0`: velo `#EEF0EA` al 82 %, rayado diagonal (patrón con id único por instancia, `useId()`), corte punteado y "N % se lo comió la inflación". Con `ganoPct`: sin velo y etiqueta "le ganó N %". Tamaño del monto: `min(58, 266 / (cifras·0,6 + puntos·0,28 + 0,62))` unidades. `role="img"` con `aria-label` que dice monto, mes y estado.

- [ ] **Step 1: Write the failing tests:** muestra `$100.000` y `MUESTRA SIN VALOR · ENERO 2020`; con `perdido={37}` muestra `37 % se lo comió la inflación` y el `aria-label` lo menciona; con `perdido={0}` no hay etiqueta de pérdida; con `ganoPct={12.4}` muestra `le ganó 12,4 %`; no aparece el texto `REPÚBLICA` ni `BANCO`; dos billetes en la misma página tienen ids de patrón distintos.
- [ ] **Step 2: Run** `npm test -w web`. Expected: FAIL.
- [ ] **Step 3: Implement** `Billete.jsx`.
- [ ] **Step 4: Run** `npm test -w web`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): billete ilustrado que se destiñe con la inflación`.

### Task 4: `GraficoLineas`, anotaciones e inflación anual

**Files:**
- Create: `web/src/logica/anotaciones.js`, `web/src/componentes/GraficoLineas.jsx`
- Test: `web/test/anotaciones.test.js`, `web/test/GraficoLineas.test.jsx`

**Interfaces:**
- Produces:
  - `ANOTACIONES = [{ mes: '2022-12', serie: 'plazoFijo', lineas: ['Dic 2022: la inflación del año', 'llega a 95 %'] }, { mes: '2023-12', serie: 'dolar', lineas: ['Dic 2023: el dólar oficial', 'sube 85 % en un mes'] }, { mes: '2024-06', serie: 'plazoFijo', lineas: ['2024: la tasa cae de 120 % a 32 %', 'y el plazo fijo se queda atrás'] }]` (cifras calculadas con la base el 2026-11-27).
  - `anotacionesEn(desde, hasta) -> anotaciones dentro del período`.
  - `inflacionAnual(serieIpc: [{fecha, valor}], desde, hasta) -> [{ anio: '2021', pct: number }]` (diciembre contra diciembre; solo años con `dic(año−1) >= desde` y `dic(año) <= hasta`).
  - `<GraficoLineas meses={string[]} series={[{ id, nombre, color, punteada, valores: (number|null)[] }]} anotaciones={[]} inflacionPorAnio={[]} formatoEje={fn} formatoValor={fn} />`: SVG `viewBox 0 0 900 560` como la maqueta (guías, años abajo con su inflación, líneas, puntos de anotación con línea vertical y texto en itálica, valor final a la derecha, leyenda). Un `null` corta la línea. Al pasar el mouse o tocar, un tooltip con el mes y los valores. `role="img"` con un resumen.
- [ ] **Step 1: Write the failing tests:** `anotacionesEn('2020-01','2025-01')` da las 3; `anotacionesEn('2024-01','2025-01')` da 1; `inflacionAnual` sobre IPC de diciembre 2019–2024 `[283.44, 385.88, 582.46, 1134.59, 3533.19, 7694.01]` con período `2020-01..2025-01` da 2021, 2022, 2023 y 2024 con 50,9; 94,8; 211,4 y 117,8 % (a 0,1; 2020 no entra porque `2019-12` < `2020-01`); el gráfico renderiza un `path` por serie, el texto `Dic 2023: el dólar oficial` cuando se le pasa esa anotación y el valor final formateado de cada serie.
- [ ] **Step 2: Run** `npm test -w web`. Expected: FAIL.
- [ ] **Step 3: Implement.** Las escalas: x lineal por índice de mes entre 40 y 880; y lineal de 0 al máximo redondeado hacia arriba a un múltiplo "lindo" (1, 2 o 5 × 10ⁿ).
- [ ] **Step 4: Run** `npm test -w web`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): gráfico de líneas con anotaciones de hechos`.

### Task 5: Calculadora y estructura de la app (#48)

**Files:**
- Create: `web/src/main.jsx`, `web/src/App.jsx`, `web/src/estilos.css`, `web/src/paginas/Calculadora.jsx`
- Test: `web/test/Calculadora.test.jsx`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: `<App api />` con `BrowserRouter`, encabezado (logo mini billete + navegación Calculadora / Series / Estado de los datos) y pie (fechas de datos de `/frescura` y el aviso); `<Calculadora api />` con la estructura de la spec (sección "Calculadora", puntos 2 a 7).

Comportamiento: lee la consulta de la URL al montar (`leerConsulta` con el `rango` que devuelve la primera `/simulacion`; antes de conocerlo, usa los valores de la URL tal cual o los por defecto). Al cambiar un campo: `escribirConsulta` con `history.replaceState` y consulta tras 400 ms. Cada pedido lleva un número; solo se aplica la respuesta del último. Pide `/series/ipc_nacional` una vez para la inflación anual. Los desplegables usan `<details>`; "Copiar link" usa `navigator.clipboard.writeText(location.href)`.

- [ ] **Step 1: Write the failing tests** (api falsa con `simulacionCasoA()`):
  - Muestra el veredicto `Le ganó a la inflación: Dólar oficial`, el billete grande `$1.000`, y los tres billetes en orden Dólar oficial, Plazo fijo, Pesos quietos, con `1.º · el que más ganó`.
  - Muestra `Tenés hoy` y `$3.000` para el dólar, y `Perdió 50,0 % contra la inflación` (texto) para los pesos quietos.
  - Con `?desde=2020-01&hasta=2020-03&monto=1000` en la URL, la primera llamada a `simulacion` usa esos valores.
  - Cambiar el monto a `2.000` hace una sola llamada nueva después de 400 ms (timers falsos) con `monto: 2000`, y la URL queda con `monto=2000`.
  - Respuestas fuera de orden: dos consultas seguidas donde la primera responde después; se muestra la segunda.
  - Si `simulacion` lanza `ErrorApi('PERIODO_FUERA_DE_RANGO', 'El período tiene que estar entre…')`, se muestra ese mensaje y los campos siguen habilitados.
  - Monto vacío: muestra `Ingresá un monto mayor que 0` y no llama a la API.
- [ ] **Step 2: Run** `npm test -w web`. Expected: FAIL.
- [ ] **Step 3: Implement** `estilos.css` con los tokens de Global Constraints y el layout de la maqueta (contenedor de 1120 px, billetes en grilla `auto-fit minmax(min(100%, 320px), 1fr)`, todo apilado en celular), `App.jsx`, `Calculadora.jsx` y `main.jsx` (`crearApi({ base: import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3000' })`).
- [ ] **Step 4: Run** `npm test -w web`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): calculadora con billetes, veredicto y consulta en la URL`.

### Task 6: Series con tabla y CSV (#36, #38)

**Files:**
- Create: `web/src/logica/csv.js`, `web/src/paginas/Series.jsx`
- Test: `web/test/csv.test.js`, `web/test/Series.test.jsx`

**Interfaces:**
- Produces: `armarCsv(columnas: [{ titulo, clave, tipo: 'texto'|'numero' }], filas) -> string` (empieza con `﻿`, separador `;`, números con coma decimal y sin separador de miles, `null` como celda vacía, saltos `\r\n`, comillas si el texto tiene `;` o `"`); `nombreCsv(id, desde, hasta) -> '<id>_<desde>_<hasta>.csv'`; `<Series api />`.

Página: selector de indicador (y "Comparar con…" opcional), filtro de período con los atajos, `GraficoLineas` y debajo la tabla con exactamente las filas graficadas. Con un indicador: `/series/:id` (fechas `AAAA-MM-DD`); con dos: `/comparativa` (`variacion_mensual` por defecto, y `nivel` si las unidades coinciden). El botón descarga con `Blob` y un `<a download>`. Estados: cargando, error y `No hay datos para ese período`.

- [ ] **Step 1: Write the failing tests:** `armarCsv` con `[{fecha:'2020-01-01', valor:1632.65}, {fecha:'2020-02-01', valor:null}]` da `'﻿fecha;valor\r\n2020-01-01;1632,65\r\n2020-02-01;\r\n'`; un texto `a;b` sale como `"a;b"`; `Series` con api falsa muestra la tabla con las mismas filas que la respuesta de `serie`, y con dos indicadores pide `comparativa` y la tabla tiene una columna por indicador; respuesta vacía muestra `No hay datos para ese período`.
- [ ] **Step 2: Run** `npm test -w web`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test -w web`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): vista de series con comparación, tabla y CSV`.

### Task 7: Estado de los datos (#37)

**Files:**
- Create: `web/src/paginas/Datos.jsx`
- Test: `web/test/Datos.test.jsx`

Por fuente: nombre, estado en texto (`vigente` → "Al día", `desactualizado` → "Desactualizada", `sin_datos` → "Sin datos", `sin_verificar` → "Sin verificar") con su color, último dato, fecha declarada, último chequeo y meses de atraso; más la regla de frescura (45 días mensuales, 5 diarias).

- [ ] **Step 1: Write the failing test:** con `frescuraFalsa()` muestra las tres fuentes, el texto `Sin verificar` para la que no tiene chequeo y `Al día` para una vigente, y `1 mes de atraso` (singular) / `0 meses` según corresponda.
- [ ] **Step 2: Run** `npm test -w web`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test -w web`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): vista del estado de cada fuente`.

### Task 8: Verificación real, README y cierre (#36, #37, #38, #48)

- [ ] **Step 1:** `npm run api -w api` (contra Neon) y `npm run dev -w web`. Claude verifica con `curl` que la app y la API responden, y le pide a Nico que abra la app y mande capturas (Claude no tiene navegador en esta máquina). Revisar, en escritorio y a 390 px de ancho: calculadora con la consulta por defecto (veredicto "Ninguna le ganó a la inflación", billetes $1.699.990 / $1.375.348 / $100.000 para 2020-01..2025-01 con $100.000), los tres atajos, un link compartido, un error forzado (`?desde=2030-01` cae al defecto), Series con una y dos series y la descarga del CSV abierto en Excel o LibreOffice, y Estado de los datos. Sacar capturas para Nico.
- [ ] **Step 2:** `npm run build -w web` sin errores ni advertencias de tamaño fuera de lo razonable.
- [ ] **Step 3: README:** sección Dashboard (qué muestra cada vista, captura, cómo correrlo con `VITE_API_URL`), la decisión de diseño del billete y por qué no lleva elementos de billetes reales, y M4 como "Hecho".
- [ ] **Step 4: Commit** `docs: dashboard, capturas y cómo correrlo`.
- [ ] **Step 5:** revisión final, OK de Nico para el push y el cierre de #36, #37, #38 y #48 con comentario y tablero a mano. Actualizar `HANDOFF.md` y la memoria.
