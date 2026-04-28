-- 1. Enum de roles
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'editor', 'viewer');

-- 2. Tabla user_roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. Función security definer para chequear roles (evita recursión en RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- Helper: cualquier rol con privilegios de escritura de registros
CREATE OR REPLACE FUNCTION public.can_write_records(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'super_admin')
      OR public.has_role(_user_id, 'admin')
      OR public.has_role(_user_id, 'editor');
$$;

CREATE OR REPLACE FUNCTION public.can_write_catalogs(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'super_admin')
      OR public.has_role(_user_id, 'admin');
$$;

-- 4. Trigger: primer usuario => super_admin, resto => viewer
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count INT;
BEGIN
  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'viewer');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

-- 5. RLS para user_roles (solo super_admin gestiona; cada usuario puede ver sus propios roles)
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- 6. Reemplazar políticas públicas por políticas basadas en rol

-- registros
DROP POLICY IF EXISTS "public read registros" ON public.registros;
DROP POLICY IF EXISTS "public write registros" ON public.registros;
CREATE POLICY "Auth read registros" ON public.registros FOR SELECT TO authenticated USING (true);
CREATE POLICY "Editors insert registros" ON public.registros FOR INSERT TO authenticated WITH CHECK (public.can_write_records(auth.uid()));
CREATE POLICY "Editors update registros" ON public.registros FOR UPDATE TO authenticated USING (public.can_write_records(auth.uid())) WITH CHECK (public.can_write_records(auth.uid()));
CREATE POLICY "Super admin delete registros" ON public.registros FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

-- registro_semanas
DROP POLICY IF EXISTS "public read semanas" ON public.registro_semanas;
DROP POLICY IF EXISTS "public write semanas" ON public.registro_semanas;
CREATE POLICY "Auth read semanas" ON public.registro_semanas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Editors insert semanas" ON public.registro_semanas FOR INSERT TO authenticated WITH CHECK (public.can_write_records(auth.uid()));
CREATE POLICY "Editors update semanas" ON public.registro_semanas FOR UPDATE TO authenticated USING (public.can_write_records(auth.uid())) WITH CHECK (public.can_write_records(auth.uid()));
CREATE POLICY "Super admin delete semanas" ON public.registro_semanas FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

-- areas_clasificadas
DROP POLICY IF EXISTS "public read areas" ON public.areas_clasificadas;
DROP POLICY IF EXISTS "public write areas" ON public.areas_clasificadas;
CREATE POLICY "Auth read areas" ON public.areas_clasificadas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert areas" ON public.areas_clasificadas FOR INSERT TO authenticated WITH CHECK (public.can_write_catalogs(auth.uid()));
CREATE POLICY "Admins update areas" ON public.areas_clasificadas FOR UPDATE TO authenticated USING (public.can_write_catalogs(auth.uid())) WITH CHECK (public.can_write_catalogs(auth.uid()));
CREATE POLICY "Super admin delete areas" ON public.areas_clasificadas FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

-- instrumentos
DROP POLICY IF EXISTS "public read instrumentos" ON public.instrumentos;
DROP POLICY IF EXISTS "public write instrumentos" ON public.instrumentos;
CREATE POLICY "Auth read instrumentos" ON public.instrumentos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert instrumentos" ON public.instrumentos FOR INSERT TO authenticated WITH CHECK (public.can_write_catalogs(auth.uid()));
CREATE POLICY "Admins update instrumentos" ON public.instrumentos FOR UPDATE TO authenticated USING (public.can_write_catalogs(auth.uid())) WITH CHECK (public.can_write_catalogs(auth.uid()));
CREATE POLICY "Super admin delete instrumentos" ON public.instrumentos FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

-- sistemas_hvac
DROP POLICY IF EXISTS "public read sistemas_hvac" ON public.sistemas_hvac;
DROP POLICY IF EXISTS "public write sistemas_hvac" ON public.sistemas_hvac;
CREATE POLICY "Auth read hvac" ON public.sistemas_hvac FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert hvac" ON public.sistemas_hvac FOR INSERT TO authenticated WITH CHECK (public.can_write_catalogs(auth.uid()));
CREATE POLICY "Admins update hvac" ON public.sistemas_hvac FOR UPDATE TO authenticated USING (public.can_write_catalogs(auth.uid())) WITH CHECK (public.can_write_catalogs(auth.uid()));
CREATE POLICY "Super admin delete hvac" ON public.sistemas_hvac FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

-- pares_cuartos
DROP POLICY IF EXISTS "public read pares" ON public.pares_cuartos;
DROP POLICY IF EXISTS "public write pares" ON public.pares_cuartos;
CREATE POLICY "Auth read pares" ON public.pares_cuartos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert pares" ON public.pares_cuartos FOR INSERT TO authenticated WITH CHECK (public.can_write_catalogs(auth.uid()));
CREATE POLICY "Admins update pares" ON public.pares_cuartos FOR UPDATE TO authenticated USING (public.can_write_catalogs(auth.uid())) WITH CHECK (public.can_write_catalogs(auth.uid()));
CREATE POLICY "Super admin delete pares" ON public.pares_cuartos FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));