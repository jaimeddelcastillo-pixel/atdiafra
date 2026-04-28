
-- Enums
CREATE TYPE public.iso_clase AS ENUM ('ISO-5', 'ISO-7 (Clase C)', 'ISO-8 (Clase D)', 'ISO-9');
CREATE TYPE public.instrumento_tipo AS ENUM ('termohigrometro', 'manometro_filtro', 'manometro_diferencial', 'otro');

-- updated_at helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 1. Sistemas HVAC
CREATE TABLE public.sistemas_hvac (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  nombre_uma TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  etapas TEXT[] NOT NULL DEFAULT '{}',
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sistemas_hvac ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read sistemas_hvac" ON public.sistemas_hvac FOR SELECT USING (true);
CREATE POLICY "public write sistemas_hvac" ON public.sistemas_hvac FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER trg_sistemas_hvac_updated BEFORE UPDATE ON public.sistemas_hvac FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Áreas clasificadas
CREATE TABLE public.areas_clasificadas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  iso public.iso_clase NOT NULL,
  hvac_id UUID REFERENCES public.sistemas_hvac(id) ON DELETE SET NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.areas_clasificadas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read areas" ON public.areas_clasificadas FOR SELECT USING (true);
CREATE POLICY "public write areas" ON public.areas_clasificadas FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER trg_areas_updated BEFORE UPDATE ON public.areas_clasificadas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Instrumentos
CREATE TABLE public.instrumentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  tipo public.instrumento_tipo NOT NULL,
  area_id UUID REFERENCES public.areas_clasificadas(id) ON DELETE SET NULL,
  area_libre TEXT, -- para casos como "EQU-CMB-08 etapa 35%" o "Sistema agua" que no son áreas clasificadas
  parametro TEXT NOT NULL,
  especificacion TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.instrumentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read instrumentos" ON public.instrumentos FOR SELECT USING (true);
CREATE POLICY "public write instrumentos" ON public.instrumentos FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER trg_instrumentos_updated BEFORE UPDATE ON public.instrumentos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Pares de cuartos
CREATE TABLE public.pares_cuartos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  instrumento_id UUID REFERENCES public.instrumentos(id) ON DELETE SET NULL,
  cuarto_x_id UUID REFERENCES public.areas_clasificadas(id) ON DELETE SET NULL,
  cuarto_y_id UUID REFERENCES public.areas_clasificadas(id) ON DELETE SET NULL,
  iso public.iso_clase NOT NULL,
  limite_normativo_pa NUMERIC NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pares_cuartos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read pares" ON public.pares_cuartos FOR SELECT USING (true);
CREATE POLICY "public write pares" ON public.pares_cuartos FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER trg_pares_updated BEFORE UPDATE ON public.pares_cuartos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ SEEDS ============

-- Sistemas HVAC
INSERT INTO public.sistemas_hvac (codigo, nombre_uma, descripcion, etapas) VALUES
  ('EQU-PRO-16', 'UMA-01', 'Producción y Acondicionamiento', ARRAY['35%','65%','95%']),
  ('EQU-ALM-02', 'UMA-03', 'Almacén de surtido y muestreo', ARRAY['35%','65%','95%']),
  ('EQU-CMB-08', 'UMA-02', 'Microbiología', ARRAY['35%','85%','99.97%']);

-- Áreas clasificadas
INSERT INTO public.areas_clasificadas (codigo, nombre, iso, hvac_id) VALUES
  ('DCC-01', 'Entrada personal',     'ISO-8 (Clase D)', (SELECT id FROM public.sistemas_hvac WHERE codigo='EQU-CMB-08')),
  ('DCC-02', 'Esclusa de siembras',  'ISO-8 (Clase D)', (SELECT id FROM public.sistemas_hvac WHERE codigo='EQU-CMB-08')),
  ('DCC-03', 'Siembras I',           'ISO-7 (Clase C)', (SELECT id FROM public.sistemas_hvac WHERE codigo='EQU-CMB-08')),
  ('DCC-04', 'Siembras II',          'ISO-7 (Clase C)', (SELECT id FROM public.sistemas_hvac WHERE codigo='EQU-CMB-08')),
  ('DCC-05', 'Preparación y Lavado', 'ISO-8 (Clase D)', (SELECT id FROM public.sistemas_hvac WHERE codigo='EQU-CMB-08')),
  ('DCC-06', 'Área DCC-06',          'ISO-8 (Clase D)', (SELECT id FROM public.sistemas_hvac WHERE codigo='EQU-CMB-08')),
  ('DCC-07', 'Incubación',           'ISO-8 (Clase D)', (SELECT id FROM public.sistemas_hvac WHERE codigo='EQU-CMB-08')),
  ('DOF-02', 'Pasillo oficinas',     'ISO-9',           (SELECT id FROM public.sistemas_hvac WHERE codigo='EQU-CMB-08')),
  ('DPR-10', 'Pasillo producción',   'ISO-9',           (SELECT id FROM public.sistemas_hvac WHERE codigo='EQU-PRO-16'));

-- Instrumentos
INSERT INTO public.instrumentos (codigo, tipo, area_id, area_libre, parametro, especificacion) VALUES
  ('INS-CMB-03', 'termohigrometro',        (SELECT id FROM public.areas_clasificadas WHERE codigo='DCC-07'), NULL,                          'T °C y HR %',      '18–25°C / 30–65% HR'),
  ('INS-CMB-07', 'manometro_filtro',       NULL,                                                              'EQU-CMB-08 etapa 35%',        'Presión inH₂O',    'Según etapa'),
  ('INS-CMB-08', 'manometro_filtro',       NULL,                                                              'EQU-CMB-08 etapa 85%',        'Presión inH₂O',    'Según etapa'),
  ('INS-CMB-09', 'manometro_filtro',       NULL,                                                              'EQU-CMB-08 etapa 99.97%',     'Presión inH₂O',    'Según etapa'),
  ('INS-CMB-10', 'manometro_diferencial',  NULL,                                                              'DCC-01 vs DCC-02',            'Presión Pa',       '≥5 Pa'),
  ('INS-CMB-11', 'manometro_diferencial',  NULL,                                                              'DCC-03 vs DCC-02',            'Presión Pa',       '≥10 Pa'),
  ('INS-CMB-12', 'manometro_diferencial',  NULL,                                                              'DCC-04 vs DCC-03',            'Presión Pa',       '≥10 Pa'),
  ('INS-CMB-18', 'manometro_diferencial',  NULL,                                                              'DCC-01 vs DOF-02',            'Presión Pa',       '≥5 Pa'),
  ('INS-CMB-19', 'manometro_diferencial',  NULL,                                                              'DCC-06 vs DCC-01',            'Presión Pa',       '≥5 Pa'),
  ('INS-CMB-20', 'termohigrometro',        (SELECT id FROM public.areas_clasificadas WHERE codigo='DCC-03'), NULL,                          'T °C y HR %',      '18–25°C / 30–65% HR'),
  ('INS-CMB-21', 'manometro_diferencial',  NULL,                                                              'DCC-07 vs DPR-10',            'Presión Pa',       '≥5 Pa'),
  ('INS-CMB-22', 'manometro_diferencial',  NULL,                                                              'DCC-07 vs DCC-06',            'Presión Pa',       '≥5 Pa'),
  ('INS-CMB-29', 'termohigrometro',        (SELECT id FROM public.areas_clasificadas WHERE codigo='DCC-05'), NULL,                          'T °C y HR %',      '18–25°C / 30–65% HR'),
  ('INS-PRO-28', 'otro',                   NULL,                                                              'Sistema agua',                'pH',               '5.0–7.0'),
  ('INS-PRO-29', 'otro',                   NULL,                                                              'Sistema agua',                'Conductividad µS/cm','< 5.1 µS/cm'),
  ('INS-PRO-40', 'otro',                   NULL,                                                              'Sistema agua',                'Cl⁻ residual mg/L','0.2–1.5 mg/L');

-- Pares de cuartos
INSERT INTO public.pares_cuartos (nombre, instrumento_id, cuarto_x_id, cuarto_y_id, iso, limite_normativo_pa) VALUES
  ('DCC-01 vs DCC-02', (SELECT id FROM public.instrumentos WHERE codigo='INS-CMB-10'), (SELECT id FROM public.areas_clasificadas WHERE codigo='DCC-01'), (SELECT id FROM public.areas_clasificadas WHERE codigo='DCC-02'), 'ISO-8 (Clase D)', 5),
  ('DCC-03 vs DCC-02', (SELECT id FROM public.instrumentos WHERE codigo='INS-CMB-11'), (SELECT id FROM public.areas_clasificadas WHERE codigo='DCC-03'), (SELECT id FROM public.areas_clasificadas WHERE codigo='DCC-02'), 'ISO-7 (Clase C)', 10),
  ('DCC-04 vs DCC-03', (SELECT id FROM public.instrumentos WHERE codigo='INS-CMB-12'), (SELECT id FROM public.areas_clasificadas WHERE codigo='DCC-04'), (SELECT id FROM public.areas_clasificadas WHERE codigo='DCC-03'), 'ISO-7 (Clase C)', 10),
  ('DCC-01 vs DOF-02', (SELECT id FROM public.instrumentos WHERE codigo='INS-CMB-18'), (SELECT id FROM public.areas_clasificadas WHERE codigo='DCC-01'), (SELECT id FROM public.areas_clasificadas WHERE codigo='DOF-02'), 'ISO-8 (Clase D)', 5),
  ('DCC-06 vs DCC-01', (SELECT id FROM public.instrumentos WHERE codigo='INS-CMB-19'), (SELECT id FROM public.areas_clasificadas WHERE codigo='DCC-06'), (SELECT id FROM public.areas_clasificadas WHERE codigo='DCC-01'), 'ISO-8 (Clase D)', 5),
  ('DCC-07 vs DPR-10', (SELECT id FROM public.instrumentos WHERE codigo='INS-CMB-21'), (SELECT id FROM public.areas_clasificadas WHERE codigo='DCC-07'), (SELECT id FROM public.areas_clasificadas WHERE codigo='DPR-10'), 'ISO-8 (Clase D)', 5),
  ('DCC-07 vs DCC-06', (SELECT id FROM public.instrumentos WHERE codigo='INS-CMB-22'), (SELECT id FROM public.areas_clasificadas WHERE codigo='DCC-07'), (SELECT id FROM public.areas_clasificadas WHERE codigo='DCC-06'), 'ISO-8 (Clase D)', 5);
