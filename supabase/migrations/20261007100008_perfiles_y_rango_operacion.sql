-- Copia de referencia de drizzle/migrations/0008_perfiles_y_rango_operacion.sql (ya aplicada en Lovable Cloud).
CREATE TABLE public.perfiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre text NOT NULL DEFAULT '',
  cargo text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.perfiles TO authenticated;
GRANT ALL ON public.perfiles TO service_role;
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Perfiles visibles a usuarios" ON public.perfiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Cada usuario crea su perfil" ON public.perfiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "Cada usuario edita su perfil" ON public.perfiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

ALTER TABLE public.instrumentos ADD COLUMN op_min_pa numeric, ADD COLUMN op_max_pa numeric;
COMMENT ON COLUMN public.instrumentos.op_min_pa IS 'Rango de operación (informativo, no se usa para cumplimiento ni capacidad)';
UPDATE public.instrumentos SET op_min_pa = lie_pa, op_max_pa = lse_pa
  WHERE tipo = 'manometro_diferencial' AND lie_pa IS NOT NULL AND lse_pa IS NOT NULL;
