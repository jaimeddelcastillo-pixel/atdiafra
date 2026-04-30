
-- 1) Agregar campos de monitoreo a instrumentos (LIE/LSE existen ya; agregamos baseline para filtros HEPA)
ALTER TABLE public.instrumentos
  ADD COLUMN IF NOT EXISTS baseline_pa numeric,
  ADD COLUMN IF NOT EXISTS baseline_tolerancia_pct numeric DEFAULT 25;

-- 2) Limpiar objetivos_presion: borrar tipos que ya no existirán
DELETE FROM public.objetivos_presion WHERE tipo IN ('equipo','filtro_hepa');

-- 3) Restringir tipo_objetivo_presion a solo 'par_cuartos'
-- Recrear enum sin los otros valores
ALTER TYPE public.tipo_objetivo_presion RENAME TO tipo_objetivo_presion_old;
CREATE TYPE public.tipo_objetivo_presion AS ENUM ('par_cuartos');
ALTER TABLE public.objetivos_presion
  ALTER COLUMN tipo TYPE public.tipo_objetivo_presion
  USING tipo::text::public.tipo_objetivo_presion;
DROP TYPE public.tipo_objetivo_presion_old;

-- 4) Quitar columnas de objetivos_presion que solo aplicaban a equipo/filtro
ALTER TABLE public.objetivos_presion
  DROP COLUMN IF EXISTS equipo_codigo,
  DROP COLUMN IF EXISTS hvac_id,
  DROP COLUMN IF EXISTS etapa,
  DROP COLUMN IF EXISTS baseline_pa,
  DROP COLUMN IF EXISTS baseline_tolerancia_pct;
