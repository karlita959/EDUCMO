-- =====================================================================
-- CONTROL ESCOLAR - Esquema para Supabase (PostgreSQL)
-- Ejecutar completo en: Supabase > SQL Editor > New query > Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PERFILES (una fila por cada usuario de auth.users)
-- ---------------------------------------------------------------------
create type rol_usuario as enum ('admin', 'docente', 'alumno');

create table public.perfiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  nombre_completo text not null,
  rol             rol_usuario not null default 'alumno',
  -- Los docentes necesitan aprobación del admin; admin y alumnos quedan aprobados
  aprobado        boolean not null default false,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. ALUMNOS (catálogo de alumnos; pueden o no tener cuenta de acceso)
-- ---------------------------------------------------------------------
create table public.alumnos (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid unique references auth.users(id) on delete set null,
  matricula       text not null unique,
  nombre_completo text not null,
  email           text,
  carrera         text,
  creado_por      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. MATERIAS (cada una pertenece a un docente)
-- ---------------------------------------------------------------------
create table public.materias (
  id          uuid primary key default gen_random_uuid(),
  docente_id  uuid not null references auth.users(id) on delete cascade,
  nombre      text not null,
  codigo      text,
  creditos    int,
  descripcion text,
  created_at  timestamptz not null default now(),
  unique (docente_id, nombre)
);

-- ---------------------------------------------------------------------
-- 4. GRUPOS (una materia impartida a un grupo en un ciclo)
-- ---------------------------------------------------------------------
create table public.grupos (
  id          uuid primary key default gen_random_uuid(),
  docente_id  uuid not null references auth.users(id) on delete cascade,
  materia_id  uuid not null references public.materias(id) on delete cascade,
  nombre      text not null,            -- ej. "Grupo A"
  ciclo       text not null,            -- ej. "2026-B"
  created_at  timestamptz not null default now()
);

-- Alumnos inscritos en cada grupo
create table public.grupo_alumnos (
  grupo_id    uuid not null references public.grupos(id) on delete cascade,
  alumno_id   uuid not null references public.alumnos(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (grupo_id, alumno_id)
);

-- ---------------------------------------------------------------------
-- 5. TAREAS asignadas a un grupo
-- ---------------------------------------------------------------------
create table public.tareas (
  id           uuid primary key default gen_random_uuid(),
  grupo_id     uuid not null references public.grupos(id) on delete cascade,
  titulo       text not null,
  descripcion  text,
  fecha_entrega timestamptz,
  puntaje_max  numeric(5,2) not null default 10,
  created_at   timestamptz not null default now()
);

-- Calificación de cada alumno en cada tarea
create table public.tarea_calificaciones (
  tarea_id    uuid not null references public.tareas(id) on delete cascade,
  alumno_id   uuid not null references public.alumnos(id) on delete cascade,
  calificacion numeric(5,2),
  entregada   boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (tarea_id, alumno_id)
);

-- =====================================================================
-- FUNCIONES AUXILIARES (usadas por las políticas de seguridad)
-- =====================================================================
create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and rol = 'admin' and aprobado
  );
$$;

create or replace function public.es_docente()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and rol = 'docente' and aprobado
  );
$$;

-- Id de alumno vinculado al usuario actual (null si no es alumno)
create or replace function public.mi_alumno_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.alumnos where user_id = auth.uid();
$$;

-- ¿El alumno actual está inscrito en el grupo indicado?
create or replace function public.alumno_en_grupo(p_grupo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.grupo_alumnos ga
    where ga.grupo_id = p_grupo and ga.alumno_id = public.mi_alumno_id()
  );
$$;

-- ¿El grupo pertenece al docente actual?
create or replace function public.es_dueno_grupo(p_grupo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.grupos g
    where g.id = p_grupo and g.docente_id = auth.uid()
  );
$$;

-- =====================================================================
-- TRIGGER: crear perfil al registrarse
--  - Solo permite registrarse como 'docente' o 'alumno'.
--  - Nunca permite registrarse como admin (se asigna a mano).
--  - Si el alumno pone una matrícula que ya existe en el catálogo,
--    se vincula su cuenta automáticamente.
-- =====================================================================
create or replace function public.manejar_nuevo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_rol rol_usuario;
  v_matricula text;
begin
  v_rol := case
    when new.raw_user_meta_data->>'rol' = 'docente' then 'docente'::rol_usuario
    else 'alumno'::rol_usuario
  end;

  insert into public.perfiles (id, nombre_completo, rol, aprobado)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre_completo', new.email),
    v_rol,
    v_rol = 'alumno'            -- alumnos aprobados de inmediato, docentes no
  );

  if v_rol = 'alumno' then
    v_matricula := new.raw_user_meta_data->>'matricula';
    if v_matricula is not null then
      update public.alumnos
         set user_id = new.id
       where matricula = v_matricula and user_id is null;
    end if;
  end if;

  return new;
end;
$$;

create trigger al_crear_usuario
after insert on auth.users
for each row execute function public.manejar_nuevo_usuario();

-- Si el alumno se registró ANTES de que lo dieran de alta en el catálogo,
-- se vincula su cuenta al insertar el alumno.
create or replace function public.vincular_alumno_existente()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is null then
    update public.alumnos a
       set user_id = u.id
      from auth.users u
     where a.id = new.id
       and u.raw_user_meta_data->>'matricula' = new.matricula
       and u.raw_user_meta_data->>'rol' is distinct from 'docente'
       and not exists (select 1 from public.alumnos x where x.user_id = u.id);
  end if;
  return null;
end;
$$;

create trigger al_crear_alumno
after insert on public.alumnos
for each row execute function public.vincular_alumno_existente();

-- =====================================================================
-- ROW LEVEL SECURITY (seguridad real: aplica aunque alguien manipule el JS)
-- =====================================================================
alter table public.perfiles            enable row level security;
alter table public.alumnos             enable row level security;
alter table public.materias            enable row level security;
alter table public.grupos              enable row level security;
alter table public.grupo_alumnos       enable row level security;
alter table public.tareas              enable row level security;
alter table public.tarea_calificaciones enable row level security;

-- PERFILES
create policy "perfil: ver el propio o admin ve todos"
  on public.perfiles for select
  using (id = auth.uid() or public.es_admin());

create policy "perfil: admin gestiona"
  on public.perfiles for all
  using (public.es_admin()) with check (public.es_admin());

-- Cada usuario solo puede cambiar su nombre; rol y aprobado no se tocan desde la app
create or replace function public.perfil_protegido_ok(p_id uuid, p_rol rol_usuario, p_aprobado boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.perfiles
    where id = p_id and rol = p_rol and aprobado = p_aprobado
  );
$$;

create policy "perfil: actualizar nombre propio"
  on public.perfiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and public.perfil_protegido_ok(id, rol, aprobado));

-- ALUMNOS
create policy "alumnos: admin gestiona todo"
  on public.alumnos for all
  using (public.es_admin()) with check (public.es_admin());

create policy "alumnos: docente crea"
  on public.alumnos for insert
  with check (public.es_docente() and creado_por = auth.uid());

-- Los docentes pueden CONSULTAR el catálogo de alumnos para poder inscribirlos
-- en sus grupos (solo lectura; no pueden modificar ni borrar alumnos ajenos).
create policy "alumnos: docente consulta catalogo"
  on public.alumnos for select
  using (public.es_docente());

create policy "alumnos: alumno ve su propio registro"
  on public.alumnos for select
  using (user_id = auth.uid());

-- MATERIAS
create policy "materias: docente gestiona las suyas"
  on public.materias for all
  using (docente_id = auth.uid() and public.es_docente())
  with check (docente_id = auth.uid() and public.es_docente());

create policy "materias: admin gestiona todas"
  on public.materias for all
  using (public.es_admin()) with check (public.es_admin());

create policy "materias: alumno ve las de sus grupos"
  on public.materias for select
  using (exists (
    select 1 from public.grupos g
    where g.materia_id = materias.id and public.alumno_en_grupo(g.id)
  ));

-- GRUPOS
create policy "grupos: docente gestiona los suyos"
  on public.grupos for all
  using (docente_id = auth.uid() and public.es_docente())
  with check (docente_id = auth.uid() and public.es_docente());

create policy "grupos: admin gestiona todos"
  on public.grupos for all
  using (public.es_admin()) with check (public.es_admin());

create policy "grupos: alumno ve SOLO sus grupos"
  on public.grupos for select
  using (public.alumno_en_grupo(id));

-- GRUPO_ALUMNOS
create policy "grupo_alumnos: docente gestiona en sus grupos"
  on public.grupo_alumnos for all
  using (public.es_dueno_grupo(grupo_id) and public.es_docente())
  with check (public.es_dueno_grupo(grupo_id) and public.es_docente());

create policy "grupo_alumnos: admin gestiona"
  on public.grupo_alumnos for all
  using (public.es_admin()) with check (public.es_admin());

create policy "grupo_alumnos: alumno ve sus inscripciones"
  on public.grupo_alumnos for select
  using (alumno_id = public.mi_alumno_id());

-- TAREAS
create policy "tareas: docente gestiona las de sus grupos"
  on public.tareas for all
  using (public.es_dueno_grupo(grupo_id) and public.es_docente())
  with check (public.es_dueno_grupo(grupo_id) and public.es_docente());

create policy "tareas: admin gestiona"
  on public.tareas for all
  using (public.es_admin()) with check (public.es_admin());

create policy "tareas: alumno ve SOLO las de sus grupos"
  on public.tareas for select
  using (public.alumno_en_grupo(grupo_id));

-- CALIFICACIONES DE TAREAS
create policy "calificaciones: docente gestiona en sus tareas"
  on public.tarea_calificaciones for all
  using (exists (
    select 1 from public.tareas t
    where t.id = tarea_id and public.es_dueno_grupo(t.grupo_id)
  ) and public.es_docente())
  with check (exists (
    select 1 from public.tareas t
    where t.id = tarea_id and public.es_dueno_grupo(t.grupo_id)
  ) and public.es_docente());

create policy "calificaciones: admin gestiona"
  on public.tarea_calificaciones for all
  using (public.es_admin()) with check (public.es_admin());

create policy "calificaciones: alumno ve solo las suyas"
  on public.tarea_calificaciones for select
  using (alumno_id = public.mi_alumno_id());


-- ---------------------------------------------------------------------
-- 9. HISTORIAL DE MINUTAS DESCARGADAS
-- ---------------------------------------------------------------------
create table public.minutas_descargadas (
  id             bigint generated always as identity primary key,
  grupo_id       uuid references public.grupos(id) on delete set null,
  docente_id     uuid references auth.users(id) on delete set null,
  nombre_archivo text not null,
  formato        text not null default 'excel',
  descargado_en  timestamptz not null default now()
);
alter table public.minutas_descargadas enable row level security;

create policy "minutas: docente registra en sus grupos"
  on public.minutas_descargadas for insert
  with check (docente_id = auth.uid() and public.es_docente() and public.es_dueno_grupo(grupo_id));

create policy "minutas: docente ve las suyas"
  on public.minutas_descargadas for select
  using (docente_id = auth.uid() and public.es_docente());

create policy "minutas: admin ve todas"
  on public.minutas_descargadas for select
  using (public.es_admin());

-- =====================================================================
-- CÓMO CREAR AL PRIMER ADMINISTRADOR
-- 1) Regístrate normalmente en la app (o crea el usuario en
--    Authentication > Users de Supabase).
-- 2) Ejecuta esto cambiando el correo por el tuyo:
--
--   update public.perfiles
--     set rol = 'admin', aprobado = true
--   where id = (select id from auth.users where email = 'tu@correo.com');
-- =====================================================================
