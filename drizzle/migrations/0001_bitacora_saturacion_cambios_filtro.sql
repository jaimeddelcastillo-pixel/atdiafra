ALTER TABLE public.instrumentos ADD COLUMN IF NOT EXISTS codigo_bitacora text;
ALTER TABLE public.instrumentos ADD COLUMN IF NOT EXISTS dp_final_fabricante numeric;

CREATE TABLE public.cambios_filtro (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instrumento_id uuid NOT NULL REFERENCES public.instrumentos(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  nota text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cambios_filtro_instr_fecha_idx ON public.cambios_filtro(instrumento_id, fecha);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cambios_filtro TO authenticated;
GRANT ALL ON public.cambios_filtro TO service_role;
ALTER TABLE public.cambios_filtro ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read cambios_filtro" ON public.cambios_filtro FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert cambios_filtro" ON public.cambios_filtro FOR INSERT TO authenticated WITH CHECK (public.can_write_catalogs(auth.uid()));
CREATE POLICY "Admins update cambios_filtro" ON public.cambios_filtro FOR UPDATE TO authenticated USING (public.can_write_catalogs(auth.uid())) WITH CHECK (public.can_write_catalogs(auth.uid()));
CREATE POLICY "Admins delete cambios_filtro" ON public.cambios_filtro FOR DELETE TO authenticated USING (public.can_write_catalogs(auth.uid()));
CREATE TRIGGER trg_cambios_filtro_updated BEFORE UPDATE ON public.cambios_filtro FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER audit_cambios_filtro AFTER INSERT OR UPDATE OR DELETE ON public.cambios_filtro FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();