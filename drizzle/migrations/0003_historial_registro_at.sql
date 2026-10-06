ALTER TABLE public.registro_analisis_tendencias
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS created_by_email text,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by_email text,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

UPDATE public.registro_analisis_tendencias
  SET created_by = COALESCE(created_by, usuario_id), created_by_email = COALESCE(created_by_email, usuario_email);

CREATE TABLE public.registro_analisis_tendencias_historial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registro_id uuid NOT NULL,
  codigo text NOT NULL,
  version integer NOT NULL,
  datos jsonb NOT NULL,
  usuario_id uuid,
  usuario_email text,
  fecha timestamptz NOT NULL DEFAULT now(),
  UNIQUE (registro_id, version)
);
GRANT SELECT ON public.registro_analisis_tendencias_historial TO authenticated;
GRANT ALL ON public.registro_analisis_tendencias_historial TO service_role;
ALTER TABLE public.registro_analisis_tendencias_historial ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read historial AT" ON public.registro_analisis_tendencias_historial
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.registro_at_versionar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text;
BEGIN
  IF auth.uid() IS NOT NULL THEN SELECT email INTO v_email FROM auth.users WHERE id = auth.uid(); END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
    NEW.created_by_email := COALESCE(v_email, NEW.created_by_email);
    NEW.updated_by := NEW.created_by; NEW.updated_by_email := NEW.created_by_email;
    NEW.version := 1;
    RETURN NEW;
  END IF;
  INSERT INTO public.registro_analisis_tendencias_historial (registro_id, codigo, version, datos, usuario_id, usuario_email)
  VALUES (OLD.id, OLD.codigo, OLD.version, to_jsonb(OLD), auth.uid(), v_email);
  NEW.created_by := OLD.created_by; NEW.created_by_email := OLD.created_by_email;
  NEW.updated_by := auth.uid(); NEW.updated_by_email := v_email;
  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.registro_at_versionar() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_registro_at_versionar BEFORE INSERT OR UPDATE ON public.registro_analisis_tendencias
  FOR EACH ROW EXECUTE FUNCTION public.registro_at_versionar();
CREATE TRIGGER audit_registro_analisis_tendencias AFTER INSERT OR UPDATE OR DELETE ON public.registro_analisis_tendencias
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();