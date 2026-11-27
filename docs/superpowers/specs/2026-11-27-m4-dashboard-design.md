# Diseño: M4 Dashboard

Fecha: 2026-11-27. Estado: borrador para aprobar.

Diseño general: `docs/superpowers/specs/2026-11-25-inflacion-vs-ahorro-design.md`. API que consume: `docs/superpowers/specs/2026-11-27-m3-api-design.md`. Issues: #48 (calculadora), #36 (series), #37 (estado de los datos) y #38 (tabla y CSV).

Maqueta visual aprobada por Nico: el lienzo "Inflación vs ahorro — calculadora" (artifact privado de Nico, artboard **Billete B · desteñido (completo)**, con los componentes **Billete** y **Gráfico de la caída**). Este documento describe esa maqueta en palabras para que se pueda construir sin abrirla.

## Intención

Es la cara visible del proyecto y lo primero que ve un entrevistador. Tiene que responder la pregunta en segundos y verse hecha con intención, no como una plantilla. Nico pidió explícitamente que no parezca "un front típico hecho con IA".

## Objetivos

- Calculadora como pantalla principal (#48): período, monto, atajos, veredicto, tres opciones, gráfico de la caída, cómo se calcula, de dónde salen los datos, compartir y fecha de los datos.
- Vista **Series** (#36 y #38): gráfico de una serie o comparación entre dos, filtro de período, y debajo la tabla con los mismos datos y la descarga en CSV.
- Vista **Estado de los datos** (#37).
- Consume la API real de M3. Se usa bien en celular.

## No objetivos

- El despliegue (#40 y #41, M5). M4 corre local contra la API local.
- Modo oscuro: se exploró y se descartó por ahora.
- Cuentas, guardado de consultas o cualquier dato personal.

## Anti-objetivos

- Que parezca una plantilla: nada de tarjetas redondeadas con sombra, degradés decorativos ni emojis.
- Mostrar un resultado sin la fecha hasta la que llegan los datos.
- Que el color sea la única forma de entender algo: "ganó" o "perdió" siempre en texto.
- Que el billete pueda confundirse con un billete real (ver "El billete").
- Inventar datos: todo número sale de la API.

## Enfoques considerados

1. **Elegido: React con Vite y gráficos en SVG propios.** El diseño depende de piezas a medida (el billete desteñido, el gráfico con anotaciones de lo que pasó) que una librería de gráficos no da. Los gráficos son pocos y simples (líneas), y hacerlos a mano muestra criterio en el portfolio. Vite da un build estático que Vercel sirve gratis.
2. Recharts o Chart.js: más rápido para el gráfico básico, pero las anotaciones y el estilo quedan genéricos, que es justo lo que Nico no quiere.
3. Next.js: el renderizado en servidor no aporta acá (los datos vienen de la API y cambian una vez por día) y suma complejidad.

Nico delegó estas elecciones a Claude.

## Identidad visual

- **Fondo** salvia claro `#EEF0EA`, tinta `#1F2A24`, líneas `#C8D0C6`.
- **Colores por opción:** dólar oficial verde `#24493A` (billete `#D6E2D9`), plazo fijo azul `#1E3F8A` / línea `#2856C4` (billete `#D9E1EF`), pesos quietos terracota `#8F3612` / línea `#D9622B` (billete `#F2DCCE`). "Perdió" en `#9A3A12`.
- **Tipografías** (Google Fonts): Figtree para textos, Bodoni Moda para los montos del billete, DM Mono para cifras en tablas y datos.
- Botones y navegación en forma de píldora; separadores finos; sin sombras.

## El billete

Componente `Billete` (SVG con proporción 460×200, escala al ancho de su contenedor). Inspirado en la serie argentina de animales, sin copiar ningún billete:

- Óvalo a la izquierda con un hornero dibujado en trazos simples, rodeado de un tramado de óvalos finos; líneas onduladas de fondo; doble marco.
- Arriba: **"INFLACIÓN VS AHORRO"**. Al centro: el monto con "$", grande, con un halo del color del billete para leerse sobre la parte desteñida. Abajo: "MUESTRA SIN VALOR · <MES AÑO>". Un Sol de Mayo estilizado arriba a la derecha.
- **Sin** número de serie, **sin** monto en letras, **sin** "República Argentina" ni el nombre del Banco Central (decisión de Nico del 27/11/2026 para evitar cualquier parecido con un billete real; ver la investigación en la conversación: el art. 282 del Código Penal exige una imitación idónea para engañar).
- Prop `perdido` (0 a 100): la parte derecha del billete se ve lavada (velo claro con rayado diagonal y un corte punteado) y una etiqueta "N % se lo comió la inflación".
- El tamaño del monto se ajusta a la cantidad de cifras para no salirse.

Lección de la maqueta: el motor del lienzo no reemplazaba datos dentro de `<text>` SVG. En React eso no pasa, así que los textos pueden ir dentro del SVG; si se prefieren en HTML superpuesto, también vale.

## Calculadora (`/`)

De arriba hacia abajo:

1. **Encabezado:** logo (mini billete medio desteñido + "inflación vs ahorro") y navegación: Calculadora, Series, Estado de los datos.
2. **Consulta como oración:** "Guardaste [$100.000] en [enero 2020] y los miraste en [enero 2025]." El monto es un campo numérico; los meses son selectores con el rango de la API (`rango.mesMinimo` a `rango.mesMaximo`). Debajo, los **atajos**: Último año, Desde 2020, Todo (desde dic 2016). El atajo activo se marca relleno.
3. **Billete grande entero** con el monto ingresado y la fecha inicial. Leyenda: "Tus $X de <mes inicial>, enteros. Más abajo, lo que quedó de ellos según dónde los pusiste."
4. **Veredicto** como titular, con el contexto: "Los precios se multiplicaron por F. Lo que en <mes inicial> costaba $X, en <mes final> costaba $X·F."
5. **Tres billetes**, uno por opción, **ordenados de mejor a peor resultado**, con "1.º · el que menos perdió" (o "el que más ganó"), 2.º y 3.º. Cada uno: billete con el monto nominal de hoy y la fecha final, desteñido según lo perdido; nombre, cómo se calcula esa opción en una línea, "Tenés hoy" y "Vale en <año inicial>", y el resultado en texto.
6. **Gráfico "Cómo fue cayendo"** (ver Gráficos).
7. **Tres desplegables:** De dónde salen los datos, Cómo se calcula, Compartir esta consulta.
8. **Pie:** hasta qué fecha llega cada fuente (de `datosHasta`) y "Muestra lo que pasó, no lo que conviene. No es una recomendación de inversión."

Reglas:

- **Veredicto:** ninguna con `resultadoRealPct > 0` → "Ninguna le ganó a la inflación"; las tres → "Las tres le ganaron a la inflación"; si no, "Le ganó a la inflación: <nombres>".
- **Opción que le ganó:** su billete no se destiñe; en lugar de la etiqueta de pérdida lleva "le ganó N %" y el texto va en verde `#24493A`. `perdido = clamp(-resultadoRealPct, 0, 100)` redondeado.
- **Atajos:** Último año = (máximo − 12 meses, máximo); Desde 2020 = (2020-01, máximo); Todo = (mínimo, máximo).
- **Valores por defecto:** Desde 2020 y $100.000.
- **URL:** la consulta vive en `?desde=AAAA-MM&hasta=AAAA-MM&monto=N`. Al cambiar algo se reemplaza la URL (sin recargar) y se vuelve a pedir `/simulacion` con un retraso de 400 ms tras la última tecla. Abrir un link con esos parámetros muestra esa consulta.
- **Estados:** cargando (billetes y gráfico en gris, sin números); error de la API (se muestra `error.mensaje` debajo de la oración, sin romper la página); 503 ("Los datos no están disponibles en este momento"); monto vacío o 0 (aviso en la oración y no se consulta).
- **Compartir:** botón "Copiar link" que copia la URL actual.

## Gráficos

Componente `GraficoLineas` en SVG propio, reutilizado por la calculadora y por Series:

- Ejes con guías horizontales y montos en el lateral; años abajo. En la calculadora, debajo de cada año completo del período, su inflación anual (diciembre contra diciembre, calculada con `/series/ipc_nacional`).
- **Anotaciones de hechos:** una lista fija en el código con fecha, texto y la serie donde se marca (punto, línea vertical y texto en itálica). Solo se muestran las que caen dentro del período. Las cifras se calcularon con la base el 27/11/2026: dic 2022 "la inflación del año llega a 95 %"; dic 2023 "el dólar oficial sube 85 % en un mes"; jun 2024 "la tasa cae de 120 % a 32 % y el plazo fijo se queda atrás".
- Valor final de cada línea a la derecha; leyenda arriba; pesos quietos en línea punteada (además del color).
- Un tooltip al tocar o pasar el mouse con el mes y los tres valores.

## Series (`/series`) (#36, #38)

- Selector de indicador (de `/indicadores`) y, opcional, un segundo para comparar. Filtro de período con los mismos atajos.
- Una serie: gráfico de `/series/:indicador` en su unidad. Dos series: gráfico de `/comparativa` con `medida=variacion_mensual` (y un selector para ver `nivel` cuando la unidad coincide).
- Debajo, **tabla con exactamente los datos del gráfico** y el botón "Descargar CSV": UTF-8 con BOM, separador `;`, coma decimal y fechas `AAAA-MM-DD` (para que Excel en castellano lo abra bien), nombre `<indicador>_<desde>_<hasta>.csv`.
- Estados de carga, error y "sin datos para ese período".

## Estado de los datos (`/datos`) (#37)

- Una fila o bloque por fuente (de `/frescura`): nombre, estado en texto ("Al día", "Desactualizada", "Sin datos", "Sin verificar") con su color, último dato real, fecha declarada por la fuente, último chequeo y meses de atraso.
- Una línea que explica la regla de frescura (45 días para mensuales, 5 para diarias) y que las fuentes caídas también aparecen.

## Organización del código

- Workspace nuevo `web/` (React 18 + Vite). La URL de la API sale de `VITE_API_URL` (en desarrollo, `http://127.0.0.1:3000`), como pide #40.
- Rutas con React Router: `/`, `/series`, `/datos`.
- Lógica pura separada de los componentes para testearla sin navegador: veredicto y ranking, atajos de período, lectura y escritura de la URL, armado del CSV, inflación anual, filtrado de anotaciones.
- Un cliente chico de la API que convierte el formato de error en un `Error` con `codigo` y `mensaje`.

## Tests

- Vitest para la lógica pura, con casos calculados a mano (por ejemplo, el veredicto con dos opciones que ganan, el CSV con acentos y BOM, los atajos en el borde del rango).
- Testing Library para los componentes clave: la calculadora muestra el veredicto y los tres billetes ordenados a partir de una respuesta falsa de la API; el error de la API se muestra sin romper la página.
- Verificación real: la app contra la API local conectada a Neon, en escritorio y en ancho de celular, con capturas para Nico.

## Queda a criterio del implementador

- La estructura interna de componentes y estilos (CSS Modules o CSS plano con variables).
- El diseño exacto del tooltip y del estado de carga.
- Cómo se ve la tabla en celular (scroll horizontal en una caja).
