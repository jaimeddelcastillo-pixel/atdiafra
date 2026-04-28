-- Tabla de registros (módulo + área + instrumento + límites)
CREATE TABLE public.registros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  instrumento_id UUID,
  par_cuartos_id UUID,
  hvac_id UUID,
  etapa TEXT,
  area_id UUID,
  codigo_area_libre TEXT,
  nombre_area_libre TEXT,
  iso TEXT,
  lse NUMERIC,
  lie NUMERIC,
  lse_t NUMERIC,
  lie_t NUMERIC,
  lse_hr NUMERIC,
  lie_hr NUMERIC,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_registros_modulo ON public.registros(modulo);
CREATE INDEX idx_registros_area ON public.registros(area_id);

ALTER TABLE public.registros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read registros" ON public.registros FOR SELECT USING (true);
CREATE POLICY "public write registros" ON public.registros FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER trg_registros_updated
  BEFORE UPDATE ON public.registros
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Semanas (una por registro × lunes). Lecturas como JSONB para mantener forma actual.
CREATE TABLE public.registro_semanas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registro_id UUID NOT NULL REFERENCES public.registros(id) ON DELETE CASCADE,
  semana_inicio DATE NOT NULL,
  mes TEXT NOT NULL,
  anio TEXT NOT NULL,
  unidad TEXT NOT NULL,
  lecturas JSONB NOT NULL DEFAULT '[]'::jsonb,
  lecturas_hr JSONB,
  observaciones TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (registro_id, semana_inicio)
);

CREATE INDEX idx_semanas_registro ON public.registro_semanas(registro_id);
CREATE INDEX idx_semanas_inicio ON public.registro_semanas(semana_inicio);

ALTER TABLE public.registro_semanas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read semanas" ON public.registro_semanas FOR SELECT USING (true);
CREATE POLICY "public write semanas" ON public.registro_semanas FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER trg_semanas_updated
  BEFORE UPDATE ON public.registro_semanas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();