ALTER TABLE public.registro_analisis_tendencias
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','emitido')),
  ADD COLUMN IF NOT EXISTS emitido_at timestamptz,
  ADD COLUMN IF NOT EXISTS emitido_by uuid,
  ADD COLUMN IF NOT EXISTS emitido_by_email text,
  ADD COLUMN IF NOT EXISTS motivo_version text,
  ADD COLUMN IF NOT EXISTS seleccion jsonb;

CREATE OR REPLACE FUNCTION public.registro_at_versionar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text; v_admin boolean;
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
    -- Reapertura: el contenido se conserva tal cual
    NEW.codigo := OLD.codigo; NEW.sistema := OLD.sistema; NEW.periodo_desde := OLD.periodo_desde; NEW.periodo_hasta := OLD.periodo_hasta;
    NEW.periodo_etiqueta := OLD.periodo_etiqueta; NEW.texto := OLD.texto; NEW.justificaciones := OLD.justificaciones;
    NEW.instrumentos := OLD.instrumentos; NEW.dictamen_global := OLD.dictamen_global; NEW.seleccion := OLD.seleccion;
    NEW.emitido_at := NULL; NEW.emitido_by := NULL; NEW.emitido_by_email := NULL;
  ELSIF NEW.estado = 'emitido' THEN
    IF NOT v_admin THEN RAISE EXCEPTION 'Solo admin o super_admin pueden emitir el registro.'; END IF;
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
END $$;
REVOKE EXECUTE ON FUNCTION public.registro_at_versionar() FROM PUBLIC, anon, authenticated;