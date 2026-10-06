CREATE TABLE public.formato_forval16 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL,
  version_formato text NOT NULL DEFAULT 'FOR-VAL-16-02 (00)',
  logo text,
  firmantes jsonb NOT NULL DEFAULT '[]'::jsonb,
  textos jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid DEFAULT auth.uid(),
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version)
);
GRANT SELECT, INSERT ON public.formato_forval16 TO authenticated;
GRANT ALL ON public.formato_forval16 TO service_role;
ALTER TABLE public.formato_forval16 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read formato" ON public.formato_forval16 FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert formato" ON public.formato_forval16 FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.registrar_exportacion_at(_registro_id uuid, _version integer, _estado text, _archivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.audit_log (table_name, record_id, operation, new_data, changed_by, changed_by_email)
  VALUES ('registro_analisis_tendencias', _registro_id, 'EXPORT_WORD',
          jsonb_build_object('version', _version, 'estado', _estado, 'archivo', _archivo), auth.uid(), v_email);
END $$;
REVOKE EXECUTE ON FUNCTION public.registrar_exportacion_at(uuid, integer, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.registrar_exportacion_at(uuid, integer, text, text) TO authenticated;