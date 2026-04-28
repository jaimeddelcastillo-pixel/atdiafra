import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth, type AppRole } from "@/lib/auth-context";
import { AuthGuard } from "@/components/AuthGuard";
import { AppHeader } from "@/components/AppHeader";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/usuarios")({
  component: () => (
    <AuthGuard>
      <UsuariosAdmin />
    </AuthGuard>
  ),
});

interface UserRoleRow {
  id: string;
  user_id: string;
  role: AppRole;
}

const ROLES: AppRole[] = ["super_admin", "admin", "editor", "viewer"];

function UsuariosAdmin() {
  const { isSuperAdmin, user: me } = useAuth();
  const [rows, setRows] = useState<UserRoleRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("user_roles").select("*").order("created_at");
    if (error) toast.error(error.message);
    setRows((data ?? []) as UserRoleRow[]);
    setLoading(false);
  };

  useEffect(() => {
    if (isSuperAdmin) load();
  }, [isSuperAdmin]);

  if (!isSuperAdmin) return <Navigate to="/" />;

  // group by user_id
  const byUser = new Map<string, AppRole[]>();
  rows.forEach((r) => {
    const arr = byUser.get(r.user_id) ?? [];
    arr.push(r.role);
    byUser.set(r.user_id, arr);
  });

  const setUserRole = async (userId: string, newRole: AppRole) => {
    // simple model: each user has exactly one role here
    const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", userId);
    if (delErr) return toast.error(delErr.message);
    const { error: insErr } = await supabase.from("user_roles").insert({ user_id: userId, role: newRole });
    if (insErr) return toast.error(insErr.message);
    toast.success("Rol actualizado");
    load();
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Gestión de usuarios y roles</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Cargando…</p>
            ) : byUser.size === 0 ? (
              <p className="text-sm text-muted-foreground">Sin usuarios registrados.</p>
            ) : (
              <div className="space-y-3">
                {Array.from(byUser.entries()).map(([userId, userRoles]) => {
                  const isMe = userId === me?.id;
                  const currentRole = userRoles[0] ?? "viewer";
                  return (
                    <div key={userId} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-mono text-foreground truncate">{userId}</p>
                        <div className="flex gap-1 mt-1">
                          {userRoles.map((r) => (
                            <Badge key={r} variant="secondary" className="text-[10px]">{r}</Badge>
                          ))}
                          {isMe && <Badge variant="outline" className="text-[10px]">tú</Badge>}
                        </div>
                      </div>
                      <Select
                        value={currentRole}
                        onValueChange={(v) => setUserRole(userId, v as AppRole)}
                        disabled={isMe}
                      >
                        <SelectTrigger className="w-[160px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-4">
              Para invitar a un nuevo usuario, comparte el enlace de la app y pídele que se registre. Aparecerá aquí como <strong>viewer</strong> y podrás cambiarle el rol.
            </p>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Permisos por rol</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p><Badge>super_admin</Badge> Todo, incluido eliminar y gestionar usuarios.</p>
            <p><Badge>admin</Badge> Crea y edita catálogos y registros. No elimina ni gestiona usuarios.</p>
            <p><Badge>editor</Badge> Captura y edita registros. No modifica catálogos ni elimina.</p>
            <p><Badge>viewer</Badge> Solo lectura.</p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
