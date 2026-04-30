-- 1. Agregar columnas LIE/LSE en Pa a instrumentos (para manómetros de equipo/filtro)
ALTER TABLE public.instrumentos
  ADD COLUMN IF NOT EXISTS lie_pa numeric,
  ADD COLUMN IF NOT EXISTS lse_pa numeric;

-- 2. Crear enum para tipo de objetivo de presión
DO $$ BEGIN
  CREATE TYPE public.tipo_objetivo_presion AS ENUM ('par_cuartos', 'equipo', 'filtro_hepa');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Crear tabla unificada de objetivos de presión
CREATE TABLE IF NOT EXISTS public.objetivos_presion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo public.tipo_objetivo_presion NOT NULL,
  codigo text NOT NULL,
  nombre text NOT NULL,
  -- Para par_cuartos
  par_cuartos_id uuid,
  cuarto_x_id uuid,
  cuarto_y_id uuid,
  iso text,
  -- Para equipo / filtro_hepa
  hvac_id uuid,
  etapa text,                 -- ej. "Prefiltro", "HEPA H14", "Etapa 1"
  equipo_codigo text,         -- ej. "UMA-01", "Autoclave-02"
  -- Comunes
  instrumento_id uuid,
  unidad text NOT NULL DEFAULT 'Pa',
  limite_normativo_pa numeric,  -- usado por par_cuartos (≥ X)
  lie_pa numeric,                -- usado por equipo / filtro
  lse_pa numeric,                -- usado por equipo / filtro
  baseline_pa numeric,           -- línea base para alertas de tendencia (filtros)
  baseline_tolerancia_pct numeric DEFAULT 25,  -- % de desviación que dispara alerta
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, codigo)
);

ALTER TABLE public.objetivos_presion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read objetivos_presion"
  ON public.objetivos_presion FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins insert objetivos_presion"
  ON public.objetivos_presion FOR INSERT TO authenticated
  WITH CHECK (can_write_catalogs(auth.uid()));

CREATE POLICY "Admins update objetivos_presion"
  ON public.objetivos_presion FOR UPDATE TO authenticated
  USING (can_write_catalogs(auth.uid()))
  WITH CHECK (can_write_catalogs(auth.uid()));

CREATE POLICY "Super admin delete objetivos_presion"
  ON public.objetivos_presion FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER trg_objetivos_presion_updated
  BEFORE UPDATE ON public.objetivos_presion
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Migrar pares existentes a la tabla unificada
INSERT INTO public.objetivos_presion
  (tipo, codigo, nombre, par_cuartos_id, cuarto_x_id, cuarto_y_id, iso, instrumento_id, unidad, limite_normativo_pa, activo)
SELECT
  'par_cuartos'::tipo_objetivo_presion,
  COALESCE(p.nombre, p.id::text),
  p.nombre,
  p.id,
  p.cuarto_x_id,
  p.cuarto_y_id,
  p.iso::text,
  p.instrumento_id,
  'Pa',
  p.limite_normativo_pa,
  p.activo
FROM public.pares_cuartos p
ON CONFLICT (tipo, codigo) DO NOTHING;

-- 5. Agregar columna objetivo_presion_id a registro_semanas (nullable, coexiste con registro_id)
ALTER TABLE public.registro_semanas
  ADD COLUMN IF NOT EXISTS objetivo_presion_id uuid;

CREATE INDEX IF NOT EXISTS idx_registro_semanas_objetivo
  ON public.registro_semanas(objetivo_presion_id);

CREATE INDEX IF NOT EXISTS idx_objetivos_presion_tipo
  ON public.objetivos_presion(tipo) WHERE activo = true;