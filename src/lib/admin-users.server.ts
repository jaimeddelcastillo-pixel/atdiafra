import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AdminRole = "super_admin" | "admin" | "editor" | "viewer";

export interface AdminUserView {
  user_id: string;
  email: string | null;
  roles: AdminRole[];
  primary_role: AdminRole;
  auth_created_at: string | null;
  last_sign_in_at: string | null;
}

const ROLE_ORDER: AdminRole[] = ["super_admin", "admin", "editor", "viewer"];
const ROLE_SET = new Set<AdminRole>(ROLE_ORDER);

function assertRole(value: string): AdminRole {
  if (!ROLE_SET.has(value as AdminRole)) throw new Error("Rol inválido.");
  return value as AdminRole;
}

async function requireRoles(accessToken: string, allowed: AdminRole[]) {
  if (!accessToken) throw new Error("Tu sesión no es válida. Vuelve a iniciar sesión.");

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
  if (userError || !userData.user)
    throw new Error("Tu sesión no es válida. Vuelve a iniciar sesión.");

  const { data: roleRows, error: roleError } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .in("role", allowed);

  if (roleError) throw new Error(roleError.message);
  if (!roleRows || roleRows.length === 0)
    throw new Error("No tienes permisos para esta acción.");

  return userData.user;
}

async function requireSuperAdmin(accessToken: string) {
  return requireRoles(accessToken, ["super_admin"]);
}

async function requireAdminOrSuper(accessToken: string) {
  return requireRoles(accessToken, ["super_admin", "admin"]);
}


export async function getManagedUsers(accessToken: string): Promise<AdminUserView[]> {
  await requireAdminOrSuper(accessToken);


  const [{ data: roleRows, error: rolesError }, { data: usersData, error: usersError }] =
    await Promise.all([
      supabaseAdmin
        .from("user_roles")
        .select("user_id, role")
        .order("created_at", { ascending: true }),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

  if (rolesError) throw new Error(rolesError.message);
  if (usersError) throw new Error(usersError.message);

  const usersById = new Map(
    (usersData.users ?? []).map((user) => [
      user.id,
      {
        email: user.email ?? null,
        auth_created_at: user.created_at ?? null,
        last_sign_in_at: user.last_sign_in_at ?? null,
      },
    ]),
  );

  const rolesByUser = new Map<string, AdminRole[]>();
  for (const row of roleRows ?? []) {
    const role = assertRole(row.role);
    rolesByUser.set(row.user_id, [...(rolesByUser.get(row.user_id) ?? []), role]);
  }

  for (const userId of usersById.keys()) {
    if (!rolesByUser.has(userId)) rolesByUser.set(userId, []);
  }

  return Array.from(rolesByUser.entries())
    .map(([userId, roles]) => {
      const user = usersById.get(userId);
      const sortedRoles = [...roles].sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));
      return {
        user_id: userId,
        email: user?.email ?? null,
        roles: sortedRoles,
        primary_role: sortedRoles[0] ?? "viewer",
        auth_created_at: user?.auth_created_at ?? null,
        last_sign_in_at: user?.last_sign_in_at ?? null,
      } satisfies AdminUserView;
    })
    .sort((a, b) => (a.email ?? a.user_id).localeCompare(b.email ?? b.user_id));
}

export async function createManagedUserAccount(
  accessToken: string,
  input: { email: string; password: string; role: string },
): Promise<AdminUserView[]> {
  await requireSuperAdmin(accessToken);

  const email = input.email.trim().toLowerCase();
  const password = input.password.trim();
  const role = assertRole(input.role);

  if (!email) throw new Error("Captura el correo del usuario.");
  if (password.length < 8)
    throw new Error("La contraseña temporal debe tener al menos 8 caracteres.");

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !created.user)
    throw new Error(createError?.message ?? "No se pudo crear el usuario.");

  const { error: roleError } = await supabaseAdmin
    .from("user_roles")
    .insert({ user_id: created.user.id, role });

  if (roleError) {
    await supabaseAdmin.auth.admin.deleteUser(created.user.id);
    throw new Error(roleError.message);
  }

  return getManagedUsers(accessToken);
}

export async function inviteManagedUserAccount(
  accessToken: string,
  input: { email: string; role: string; redirectTo?: string },
): Promise<AdminUserView[]> {
  await requireSuperAdmin(accessToken);

  const email = input.email.trim().toLowerCase();
  const role = assertRole(input.role);
  if (!email) throw new Error("Captura el correo del usuario.");

  const { data: invited, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    email,
    input.redirectTo ? { redirectTo: input.redirectTo } : undefined,
  );

  if (inviteError || !invited.user) {
    throw new Error(inviteError?.message ?? "No se pudo enviar la invitación.");
  }

  const { error: roleError } = await supabaseAdmin
    .from("user_roles")
    .upsert({ user_id: invited.user.id, role }, { onConflict: "user_id,role" });

  if (roleError) throw new Error(roleError.message);

  return getManagedUsers(accessToken);
}

export async function updateManagedUserAccountRole(
  accessToken: string,
  input: { userId: string; role: string },
): Promise<AdminUserView[]> {
  const currentUser = await requireSuperAdmin(accessToken);
  const role = assertRole(input.role);

  if (input.userId === currentUser.id && role !== "super_admin") {
    throw new Error("No puedes quitarte el rol super_admin a ti mismo.");
  }

  const { error: deleteError } = await supabaseAdmin
    .from("user_roles")
    .delete()
    .eq("user_id", input.userId);
  if (deleteError) throw new Error(deleteError.message);

  const { error: insertError } = await supabaseAdmin
    .from("user_roles")
    .insert({ user_id: input.userId, role });
  if (insertError) throw new Error(insertError.message);

  return getManagedUsers(accessToken);
}

export async function deleteManagedUserAccount(
  accessToken: string,
  input: { userId: string },
): Promise<AdminUserView[]> {
  const currentUser = await requireSuperAdmin(accessToken);

  if (input.userId === currentUser.id) throw new Error("No puedes eliminar tu propia cuenta.");

  const { error: rolesError } = await supabaseAdmin
    .from("user_roles")
    .delete()
    .eq("user_id", input.userId);
  if (rolesError) throw new Error(rolesError.message);

  const { error: userError } = await supabaseAdmin.auth.admin.deleteUser(input.userId);
  if (userError && !userError.message.toLowerCase().includes("not found"))
    throw new Error(userError.message);

  return getManagedUsers(accessToken);
}

export async function setManagedUserPasswordAccount(
  accessToken: string,
  input: { userId: string; password: string },
): Promise<{ ok: true }> {
  const currentUser = await requireAdminOrSuper(accessToken);
  const password = input.password.trim();
  if (password.length < 8)
    throw new Error("La contraseña debe tener al menos 8 caracteres.");

  if (currentUser.id !== input.userId) {
    const { data: superRows, error: superErr } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", input.userId)
      .eq("role", "super_admin")
      .maybeSingle();
    if (superErr) throw new Error(superErr.message);
    if (superRows) {
      const { data: meSuper } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", currentUser.id)
        .eq("role", "super_admin")
        .maybeSingle();
      if (!meSuper) throw new Error("No puedes modificar la contraseña de un super_admin.");
    }
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(input.userId, {
    password,
  });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function sendManagedUserPasswordRecoveryEmail(
  accessToken: string,
  input: { email: string; redirectTo?: string },
): Promise<{ ok: true }> {
  const currentUser = await requireAdminOrSuper(accessToken);
  const email = input.email.trim().toLowerCase();
  if (!email) throw new Error("Correo requerido.");

  // Block admins (non-super) from triggering recovery on super_admin accounts
  const { data: meSuper } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", currentUser.id)
    .eq("role", "super_admin")
    .maybeSingle();

  if (!meSuper) {
    const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (usersError) throw new Error(usersError.message);
    const target = (usersData.users ?? []).find(
      (u) => (u.email ?? "").toLowerCase() === email,
    );
    if (target) {
      const { data: targetSuper } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", target.id)
        .eq("role", "super_admin")
        .maybeSingle();
      if (targetSuper) throw new Error("No puedes enviar recuperación a un super_admin.");
    }
  }

  const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
    redirectTo: input.redirectTo,
  });
  if (error) throw new Error(error.message);
  return { ok: true };
}
