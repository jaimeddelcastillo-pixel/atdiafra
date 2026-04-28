-- Tabla de auditoría
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid,
  operation text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  changed_by_email text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_table_name ON public.audit_log(table_name);
CREATE INDEX idx_audit_log_record_id ON public.audit_log(record_id);
CREATE INDEX idx_audit_log_changed_at ON public.audit_log(changed_at DESC);
CREATE INDEX idx_audit_log_changed_by ON public.audit_log(changed_by);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Solo super_admin y admin pueden leer la auditoría
CREATE POLICY "Admins read audit log"
ON public.audit_log
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Nadie puede insertar/modificar/borrar manualmente (solo triggers SECURITY DEFINER)
-- Sin políticas para INSERT/UPDATE/DELETE = bloqueado para todos los roles authenticated

-- Función trigger genérica para auditoría
CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_record_id uuid;
  v_old jsonb;
  v_new jsonb;
BEGIN
  v_user_id := auth.uid();
  
  -- Obtener email del usuario
  IF v_user_id IS NOT NULL THEN
    SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_new := NULL;
    v_record_id := (v_old->>'id')::uuid;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_record_id := (v_new->>'id')::uuid;
  ELSE -- INSERT
    v_old := NULL;
    v_new := to_jsonb(NEW);
    v_record_id := (v_new->>'id')::uuid;
  END IF;
  
  INSERT INTO public.audit_log (table_name, record_id, operation, old_data, new_data, changed_by, changed_by_email)
  VALUES (TG_TABLE_NAME, v_record_id, TG_OP, v_old, v_new, v_user_id, v_user_email);
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Triggers en todas las tablas relevantes
CREATE TRIGGER audit_registros
AFTER INSERT OR UPDATE OR DELETE ON public.registros
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_registro_semanas
AFTER INSERT OR UPDATE OR DELETE ON public.registro_semanas
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_sistemas_hvac
AFTER INSERT OR UPDATE OR DELETE ON public.sistemas_hvac
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_areas_clasificadas
AFTER INSERT OR UPDATE OR DELETE ON public.areas_clasificadas
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_instrumentos
AFTER INSERT OR UPDATE OR DELETE ON public.instrumentos
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_pares_cuartos
AFTER INSERT OR UPDATE OR DELETE ON public.pares_cuartos
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_user_roles
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();