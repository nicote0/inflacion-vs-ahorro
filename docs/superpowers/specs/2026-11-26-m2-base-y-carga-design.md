# Diseño: M2 Base y carga

Fecha: 2026-11-26. Estado: borrador para aprobar.

Diseño general del proyecto: `docs/superpowers/specs/2026-11-25-inflacion-vs-ahorro-design.md`. Issues de M2: #25, #26, #28, #29, #30, #45 y #46.

## Intención

M1 dejó las tres series descargadas como copias crudas en disco. M2 las lleva a PostgreSQL para que la API de M3 tenga de dónde leer. Además deja listo el cálculo de la simulación, que es el núcleo del producto.

Para el portfolio, M2 es la parte que muestra trabajo de datos y no solo descargas: una capa de staging con los datos tal cual llegaron, un modelo dimensional, una carga que se puede repetir sin duplicar nada, un registro de cada ejecución y transformaciones en SQL que se pueden leer y explicar.

## Objetivos

- Esquema en Postgres con tres capas: staging, modelo y control.
- Un solo comando que descarga, guarda la copia cruda, carga y registra la ejecución.
- Una carga idempotente: correrla dos veces deja los mismos conteos, y un valor corregido en la fuente se actualiza en lugar de duplicarse.
- Promedios mensuales de las series diarias, con la cantidad de días con dato de cada mes.
- Las filas con errores se guardan con su motivo, sin frenar la carga.
- La simulación (#46) como módulo JS puro, verificado con datos reales y contra una planilla.
- La base en Neon, conectada por `DATABASE_URL`.

## No objetivos

- La API (M3), el dashboard (M4) y el workflow de Actions (M5). M2 deja interfaces pensadas para ellos, pero no los implementa.
- Historial completo de staging. Staging guarda solo la última carga de cada fuente, y el historial queda en las copias crudas y en la tabla de ejecuciones.
- Borrar del modelo fechas que desaparezcan de la fuente. Si pasara, queda registrado como aviso y no se borra nada.

## Anti-objetivos

- Rellenar meses o días sin dato. Un mes sin observaciones no tiene fila.
- Que una carga a medias deje datos mezclados. Cada fuente se carga en una transacción.
- Credenciales en el repo. `DATABASE_URL` sale solo del entorno, y `.env` sigue en `.gitignore`.

## Enfoques considerados

**Del archivo crudo a la base**
1. **Elegido: transformación en SQL.** El pipeline inserta en staging los valores como texto, tal como llegaron, y los pasa al modelo con SQL: tipado, upsert y agregación con `GROUP BY`. Así staging sirve para algo, y #28 (limpieza y tipado con registro de errores) se resuelve donde corresponde.
2. Transformación en JS, insertando solo los datos finales. Es más simple, pero staging queda de adorno.

**Migraciones**
1. **Elegido:** archivos `.sql` numerados y un script propio que los aplica en orden y los anota en `schema_migrations`. Sin dependencias.
2. `node-pg-migrate`: suma una dependencia para algo que en este proyecto es chico.

**Driver**
1. **Elegido: `pg`.** Funciona con Neon y con un Postgres local. Para la API serverless de M5 alcanza con la URL con pooling de Neon.
2. `@neondatabase/serverless`: no funciona contra un Postgres local en Docker.

**Dónde vive la simulación**
1. **Elegido: módulo JS puro**, compartido entre el pipeline (para verificar) y la API de M3. Recibe los datos ya leídos y devuelve el resultado. Es fácil de testear y de comparar con una planilla.
2. Función SQL: renovar cada 30 días buscando la última tasa publicada necesita un CTE recursivo, que es difícil de leer y de explicar.

**Dónde se prueba**
1. **Elegido: Postgres local en Docker** para desarrollo y para los tests de integración. Neon queda solo para la base real.
2. Una rama de Neon para tests: depende de la red y de la cuenta.

Nico delegó estas elecciones a Claude el 26/11/2026.

## Esquema

Tres schemas de Postgres. Los identificadores van en minúscula, sin acentos y con guion bajo.

### `staging`: lo que llegó, como texto

- `staging.indec_series(fuente_id text, sha256 text, fila int, fecha text, valor text, cargado_en timestamptz)`
- `staging.bcra_monetarias(fuente_id text, sha256 text, fila int, fecha text, valor text, cargado_en timestamptz)`

Hay una tabla por tipo de API, porque el dólar y la tasa comparten formato. `sha256` referencia la copia cruda de origen. En cada carga se borran las filas de esa fuente y se insertan las nuevas, dentro de la misma transacción.

### `modelo`: dimensiones y hechos

- `modelo.dim_indicador(indicador_id text pk, nombre, unidad, fuente, periodicidad, serie_origen)`. Se sincroniza desde `pipeline/fuentes.json` en cada ejecución, y por eso `fuentes.json` suma el campo `unidad`.
- `modelo.dim_fecha(fecha date pk, anio, mes, dia, primer_dia_mes date, dia_semana, es_fin_de_semana)`. La carga la extiende hasta cubrir las fechas de los datos.
- `modelo.hecho_diario(indicador_id fk, fecha fk, valor numeric, sha256, actualizado_en)`, con pk `(indicador_id, fecha)`. Guarda el dólar y la tasa.
- `modelo.hecho_mensual(indicador_id fk, mes date fk, valor numeric, dias_con_dato int null, origen text, actualizado_en)`, con pk `(indicador_id, mes)`. `mes` es el primer día del mes. `origen` vale `'fuente'` para el IPC y `'promedio_diario'` para los promedios del dólar y de la tasa. `dias_con_dato` es nulo cuando el origen es la fuente.

Los valores van en `numeric` sin precisión fija, para no perder decimales.

### `control`: ejecuciones, frescura y rechazos

- `control.ejecucion(ejecucion_id bigint identity pk, iniciada_en, terminada_en, estado)`, con estado `en_curso`, `ok`, `con_errores` o `fallida`.
- `control.ejecucion_fuente(ejecucion_id fk, fuente_id, iniciada_en, terminada_en, estado, sha256, filas_leidas, filas_insertadas, filas_actualizadas, filas_sin_cambios, filas_rechazadas, mensaje_error)`, con pk `(ejecucion_id, fuente_id)` y estado `ok`, `sin_cambios` o `error`.
- `control.fila_rechazada(ejecucion_id, fuente_id, fila, fecha_texto, valor_texto, motivo)`.
- `control.frescura(fuente_id pk, ultima_observacion, ultima_fecha_declarada, estado, fin_del_periodo, dias_desde_fin_del_periodo, fecha_chequeo, actualizado_en)`: el estado actual, que se pisa en cada corrida.
- `public.schema_migrations(version text pk, aplicada_en)`.

## Flujo de `npm run pipeline`

1. Toma un advisory lock de Postgres. Si otra ejecución lo tiene, termina con un aviso, así dos corridas no se pisan.
2. Aplica las migraciones pendientes. Crea la fila de `control.ejecucion` en `en_curso` y sincroniza `dim_indicador`.
3. Por cada fuente, aislada como en M1:
   1. Descarga, valida el formato con `parsear` y guarda la copia cruda en `data/raw` (igual que en M1).
   2. Compara el hash contra el de la última carga `ok` de esa fuente en `control.ejecucion_fuente`. Si es igual, la fuente queda `sin_cambios` y no se carga. **La comparación es contra la base y no contra el manifiesto local**, porque en GitHub Actions `data/raw` arranca vacío en cada corrida.
   3. En una transacción: reemplaza su staging; tipa con SQL y pasa a `fila_rechazada` las filas cuya fecha o valor no se pueden convertir; hace el upsert en el hecho que corresponde; y, si la serie es diaria, recalcula sus promedios mensuales.
   4. Escribe su fila en `control.ejecucion_fuente` (fuera de esa transacción, para que una carga fallida también quede registrada) y la frescura en `control.frescura`.
4. Cierra la ejecución con el estado final. Sale con código 1 si alguna fuente falló.

`npm run ingesta` queda como en M1, solo descarga y sin base. `data/frescura.json` se sigue escribiendo para uso local, pero la fuente de verdad pasa a ser la base.

**Upsert:** `insert ... on conflict (indicador_id, fecha) do update set valor = excluded.valor, ... where hecho.valor is distinct from excluded.valor`. Así se distingue entre filas insertadas, actualizadas y sin cambios para los conteos de la ejecución.

**Agregación (#45):** `avg(valor)` y `count(*)` de `hecho_diario`, agrupados por mes, con upsert en `hecho_mensual`. Se recalcula la serie entera de esa fuente: son unos 120 meses, así que no hace falta hacerlo de forma incremental. El mes en curso aparece con menos días; `dias_con_dato` lo deja a la vista y no se descarta.

**Regla de faltantes (#28):** una fila con fecha que no es `AAAA-MM-DD`, o con un valor vacío o no numérico, va a `fila_rechazada` con su motivo. No se rellena, no se interpola y no frena la carga. Una fecha repetida dentro de la misma copia también se rechaza, y queda la primera aparición.

El staging necesita las filas como texto antes del tipado. Para eso, cada adaptador suma `filasCrudas(contenido) -> [{ fila, fecha, valor }]` con strings sin convertir. `parsear` se mantiene para validar el formato (falla si no es el esperado).

## Simulación (#46)

Es un paquete JS puro, sin acceso a la base:

```js
simular({ desde: 'AAAA-MM', hasta: 'AAAA-MM', monto,
          ipcMensual,     // Map 'AAAA-MM' -> valor
          dolarMensual,   // Map 'AAAA-MM' -> promedio
          tasasDiarias }) // [{ fecha: 'AAAA-MM-DD', valor: TNA% }], ordenadas
// -> { factorInflacion,
//      opciones: { plazoFijo, dolar, pesosQuietos }: { valorFinalNominal, valorReal, resultadoRealPct },
//      evolucion: [{ mes, plazoFijo, dolar, pesosQuietos }] }  // en pesos del mes final
```

Las reglas son las del diseño general (sección Cálculo). Estas son las precisiones que necesita la implementación:

- **Primer día hábil del mes inicial:** la primera fecha con tasa publicada dentro de ese mes.
- **Plazo fijo:** cada tramo empieza en el día `d` con la tasa de `d`, o con la última publicada antes de `d` si ese día no hay. El tramo vence en `d + 30` días corridos. Solo suma intereses si vence a más tardar el último día del mes final. El valor de un mes en la evolución es el capital después de los vencimientos ocurridos hasta fin de ese mes, sin intereses de un tramo que todavía no venció.
- **Dólar:** `monto / dolarMensual(desde)` dólares. Su valor en el mes `m` es `dólares × dolarMensual(m)`.
- **Pesos de hoy:** la evolución expresa cada mes en pesos del mes final: `nominal(m) × IPC(hasta) / IPC(m)`. `valorReal` sigue la fórmula del diseño general (`valorFinalNominal / factor`). El resultado real en % da igual con las dos convenciones.
- **Errores:** si `hasta` no es posterior a `desde`, si `monto` no es mayor que 0, o si falta un mes de IPC o de dólar o no hay tasa en el período, lanza un `ErrorSimulacion` con un código. La API de M3 lo convierte en un 400.

Para verificarlo con datos reales sin esperar a la API: `npm run simular -- --desde 2020-01 --hasta 2025-01 --monto 100000` lee de la base y muestra el resultado. Para la planilla, el comando puede exportar a CSV los insumos y cada renovación del plazo fijo. Nico arma la planilla con eso y compara al menos dos períodos.

## Organización del código

- `npm workspaces` en la raíz, con `pipeline/` y `simulacion/` por ahora. `api/` y `web/` se suman en M3 y M4.
- `pipeline/migraciones/NNN_descripcion.sql` y `pipeline/src/db/` (conexión, migrador y carga).
- `docker-compose.yml` en la raíz, solo con el servicio `postgres` (imagen oficial, versión 17). Los valores salen de `.env`. M5 (#42) le agrega la API y el front.
- `.env.example` con `DATABASE_URL`, `TEST_DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD` y `POSTGRES_DB`, sin valores.

## Tests

- Unitarios, sin red y sin base: `simulacion`, `filasCrudas` y el armado de los resultados de la ejecución. Corren con `npm test` como en M1.
- De integración contra el Postgres local: `npm run test:db`, que usa `TEST_DATABASE_URL`. Cubren el migrador desde cero, la carga dos veces con conteos iguales, un valor corregido que se actualiza, filas rechazadas, una fuente que falla y queda registrada, el hash igual que saltea la carga y la agregación mensual.
- Si `TEST_DATABASE_URL` no está definida, `test:db` lo avisa y sale con error. No se saltea en silencio.

## Neon (#26)

Nico crea el proyecto en el plan gratuito y guarda la `DATABASE_URL` en su `.env` local. Claude nunca la ve escrita en el código ni en el chat. Antes de documentar los límites del plan gratuito en el README, se verifican en la documentación vigente de Neon y no se escriben de memoria.

## Verificación de cierre de M2

- `npm run pipeline` contra Neon, dos veces: la segunda da `sin_cambios` en las fuentes que no cambiaron, y los conteos de `hecho_diario` y `hecho_mensual` no se mueven.
- Dos meses del promedio del dólar comparados a mano contra los datos diarios (#45).
- Una ejecución con una fuente rota a propósito (por ejemplo, una variable inexistente en una copia de `fuentes.json`) queda registrada como error y las otras cargan (#30).
- La simulación de dos períodos coincide con la planilla de Nico (#46).
- README: esquema, regla de faltantes, cómo correr con Docker y con Neon, y los límites de Neon.

## Para M5 (se anota en #39)

En Actions, `data/raw` se pierde al terminar cada corrida. Para conservar las copias crudas hay que subirlas como artifact del workflow. La carga no depende de eso, porque compara el hash contra la base.

## Queda a criterio del implementador

- Los nombres exactos de las columnas auxiliares y de los índices.
- El rango inicial de `dim_fecha` y cómo se extiende.
- El formato exacto de la salida por consola de `npm run pipeline` y de `npm run simular`.
- Si `parsear` se reescribe apoyándose en `filasCrudas`.
