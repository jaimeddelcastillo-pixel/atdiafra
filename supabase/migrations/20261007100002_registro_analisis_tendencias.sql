-- Copia de referencia de drizzle/migrations/0002_registro_analisis_tendencias.sql (ya aplicada en Lovable Cloud).
CREATE TABLE public.registro_analisis_tendencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE CHECK (codigo ~ '^AT-[0-9]{4}-[0-9]{3}$'),
  fecha date NOT NULL DEFAULT current_date,
  sistema text NOT NULL,
  periodo_desde date NOT NULL,
  periodo_hasta date NOT NULL,
  periodo_etiqueta text,
  instrumentos jsonb NOT NULL DEFAULT '[]'::jsonb,
  usuario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  usuario_email text,
  dictamen_global text,
  justificaciones jsonb NOT NULL DEFAULT '{}'::jsonb,
  texto jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.registro_analisis_tendencias TO authenticated;
GRANT ALL ON public.registro_analisis_tendencias TO service_role;
ALTER TABLE public.registro_analisis_tendencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leer registro AT" ON public.registro_analisis_tendencias FOR SELECT TO authenticated USING (true);
CREATE POLICY "Crear registro AT" ON public.registro_analisis_tendencias FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'editor') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "Editar registro AT" ON public.registro_analisis_tendencias FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'editor') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'editor') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "Borrar registro AT" ON public.registro_analisis_tendencias FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'));
