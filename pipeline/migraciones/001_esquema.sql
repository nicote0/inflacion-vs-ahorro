-- Esquema inicial: staging (lo que llegó, como texto), modelo (dimensiones y hechos)
-- y control (ejecuciones, rechazos y frescura).

create schema staging;
create schema modelo;
create schema control;

-- ---------- staging ----------

create table staging.indec_series (
  fuente_id   text not null,
  sha256      text not null,
  fila        int  not null,
  fecha       text,
  valor       text,
  cargado_en  timestamptz not null default now(),
  primary key (fuente_id, fila)
);

create table staging.bcra_monetarias (
  fuente_id   text not null,
  sha256      text not null,
  fila        int  not null,
  fecha       text,
  valor       text,
  cargado_en  timestamptz not null default now(),
  primary key (fuente_id, fila)
);

-- true si el texto es AAAA-MM-DD y además es una fecha que existe (2026-02-30 no).
create function staging.fecha_valida(texto text) returns boolean
language plpgsql immutable as $$
begin
  if texto is null or texto !~ '^\d{4}-\d{2}-\d{2}$' then
    return false;
  end if;
  perform texto::date;
  return true;
exception when others then
  return false;
end;
$$;

-- true si el texto es un número decimal (con punto) o en notación científica.
create function staging.valor_valido(texto text) returns boolean
language sql immutable as $$
  select texto is not null and texto ~ '^-?\d+(\.\d+)?([eE][-+]?\d+)?$'
$$;

-- ---------- modelo ----------

create table modelo.dim_indicador (
  indicador_id  text primary key,
  nombre        text not null,
  unidad        text not null,
  fuente        text not null,
  periodicidad  text not null check (periodicidad in ('diaria', 'mensual')),
  serie_origen  text not null
);

create table modelo.dim_fecha (
  fecha             date primary key,
  anio              int  not null,
  mes               int  not null,
  dia               int  not null,
  primer_dia_mes    date not null,
  dia_semana        int  not null,  -- ISO: 1 lunes ... 7 domingo
  es_fin_de_semana  boolean not null
);

create table modelo.hecho_diario (
  indicador_id    text not null references modelo.dim_indicador,
  fecha           date not null references modelo.dim_fecha,
  valor           numeric not null,
  sha256          text not null,
  actualizado_en  timestamptz not null default now(),
  primary key (indicador_id, fecha)
);

create table modelo.hecho_mensual (
  indicador_id    text not null references modelo.dim_indicador,
  mes             date not null references modelo.dim_fecha,
  valor           numeric not null,
  dias_con_dato   int,
  origen          text not null check (origen in ('fuente', 'promedio_diario')),
  actualizado_en  timestamptz not null default now(),
  primary key (indicador_id, mes),
  check (extract(day from mes) = 1),
  check ((origen = 'fuente') = (dias_con_dato is null))
);

-- ---------- control ----------

create table control.ejecucion (
  ejecucion_id  bigint generated always as identity primary key,
  iniciada_en   timestamptz not null default now(),
  terminada_en  timestamptz,
  estado        text not null check (estado in ('en_curso', 'ok', 'con_errores', 'fallida'))
);

create table control.ejecucion_fuente (
  ejecucion_id        bigint not null references control.ejecucion,
  fuente_id           text not null,
  iniciada_en         timestamptz not null,
  terminada_en        timestamptz not null,
  estado              text not null check (estado in ('ok', 'sin_cambios', 'error')),
  sha256              text,
  filas_leidas        int not null default 0,
  filas_insertadas    int not null default 0,
  filas_actualizadas  int not null default 0,
  filas_sin_cambios   int not null default 0,
  filas_rechazadas    int not null default 0,
  mensaje_error       text,
  primary key (ejecucion_id, fuente_id)
);

create index ejecucion_fuente_ultima_ok
  on control.ejecucion_fuente (fuente_id, terminada_en desc)
  where estado = 'ok';

create table control.fila_rechazada (
  ejecucion_id  bigint not null references control.ejecucion,
  fuente_id     text not null,
  fila          int  not null,
  fecha_texto   text,
  valor_texto   text,
  motivo        text not null check (motivo in ('fecha_invalida', 'valor_invalido', 'fecha_repetida'))
);

create table control.frescura (
  fuente_id                    text primary key,
  ultima_observacion           date,
  ultima_fecha_declarada       date,
  estado                       text not null check (estado in ('vigente', 'desactualizado', 'sin_datos')),
  fin_del_periodo              date,
  dias_desde_fin_del_periodo   int,
  fecha_chequeo                date not null,
  actualizado_en               timestamptz not null default now()
);
