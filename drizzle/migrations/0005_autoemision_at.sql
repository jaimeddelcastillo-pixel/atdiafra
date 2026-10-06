CREATE TABLE IF NOT EXISTS public.app_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  permitir_autoemision boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.app_config TO authenticated;
GRANT ALL ON public.app_config TO service_role;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read app_config" ON public.app_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins update app_config" ON public.app_config FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));
INSERT INTO public.app_config (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.registro_at_versionar()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_email text; v_admin boolean; v_auto boolean;
BEGIN
  IF auth.uid() IS NOT NULL THEN SELECT email INTO v_email FROM auth.users WHERE id = auth.uid(); END IF;
  v_admin := auth.uid() IS NULL OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin');
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
    NEW.created_by_email := COALESCE(v_email, NEW.created_by_email);
    NEW.updated_by := NEW.created_by; NEW.updated_by_email := NEW.created_by_email;
    NEW.version := 1;
    NEW.estado := 'borrador'; NEW.emitido_at := NULL; NEW.emitido_by := NULL; NEW.emitido_by_email := NULL; NEW.motivo_version := NULL;
    RETURN NEW;
  END IF;
  IF OLD.estado = 'emitido' THEN
    IF NEW.estado <> 'borrador' THEN
      RAISE EXCEPTION 'El registro % está emitido y no se puede modificar. Crea una nueva versión.', OLD.codigo;
    END IF;
    IF NOT v_admin THEN RAISE EXCEPTION 'Solo admin o super_admin pueden crear una nueva versión.'; END IF;
    IF COALESCE(btrim(NEW.motivo_version), '') = '' THEN RAISE EXCEPTION 'Indica el motivo de la nueva versión.'; END IF;
    NEW.codigo := OLD.codigo; NEW.sistema := OLD.sistema; NEW.periodo_desde := OLD.periodo_desde; NEW.periodo_hasta := OLD.periodo_hasta;
    NEW.periodo_etiqueta := OLD.periodo_etiqueta; NEW.texto := OLD.texto; NEW.justificaciones := OLD.justificaciones;
    NEW.instrumentos := OLD.instrumentos; NEW.dictamen_global := OLD.dictamen_global; NEW.seleccion := OLD.seleccion;
    NEW.emitido_at := NULL; NEW.emitido_by := NULL; NEW.emitido_by_email := NULL;
  ELSIF NEW.estado = 'emitido' THEN
    IF NOT v_admin THEN RAISE EXCEPTION 'Solo admin o super_admin pueden emitir el registro.'; END IF;
    SELECT permitir_autoemision INTO v_auto FROM public.app_config WHERE id = 1;
    IF auth.uid() IS NOT NULL AND NOT COALESCE(v_auto, false)
       AND auth.uid() = COALESCE(OLD.updated_by, OLD.created_by) THEN
      RAISE EXCEPTION 'Separación de funciones: quien creó o modificó la versión vigente no puede emitirla. Debe emitirla otro admin o super_admin.';
    END IF;
    NEW.emitido_at := now(); NEW.emitido_by := auth.uid(); NEW.emitido_by_email := v_email;
    NEW.motivo_version := OLD.motivo_version;
  ELSE
    NEW.emitido_at := NULL; NEW.emitido_by := NULL; NEW.emitido_by_email := NULL;
    NEW.motivo_version := OLD.motivo_version;
  END IF;
  INSERT INTO public.registro_analisis_tendencias_historial (registro_id, codigo, version, datos, usuario_id, usuario_email)
  VALUES (OLD.id, OLD.codigo, OLD.version, to_jsonb(OLD), auth.uid(), v_email);
  NEW.created_by := OLD.created_by; NEW.created_by_email := OLD.created_by_email;
  NEW.updated_by := auth.uid(); NEW.updated_by_email := v_email;
  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END $function$;