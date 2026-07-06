import { createFileRoute, Navigate } from "@tanstack/react-router";
import { FormEvent, useEffect, useState } from "react";
import { KeyRound, Mail, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useAuth, type AppRole } from "@/lib/auth-context";
import { AuthGuard } from "@/components/AuthGuard";
import { AppHeader } from "@/components/AppHeader";
import { supabase } from "@/integrations/supabase/client";
import {
  createManagedUser,
  deleteManagedUser,
  inviteManagedUser,
  listManagedUsers,
  sendManagedUserPasswordRecovery,
  setManagedUserPassword,
  updateManagedUserRole,
  type AdminUserView,
} from "@/lib/admin-users.functions";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/usuarios")({
  component: () => (
    <AuthGuard>
      <UsuariosAdmin />
    </AuthGuard>
  ),
});

const ROLES: AppRole[] = ["super_admin", "admin", "editor", "viewer"];

function formatDate(value: string | null) {
  if (!value) return "Sin acceso";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
  return token;
}

function UsuariosAdmin() {
  const { isSuperAdmin, user: me, refreshRoles } = useAuth();
  const [rows, setRows] = useState<AdminUserView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [openCreate, setOpenCreate] = useState(false);
  const [openInvite, setOpenInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppRole>("viewer");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AppRole>("viewer");

  const load = async () => {
    try {
      setLoading(true);
      const accessToken = await getAccessToken();
      const data = await listManagedUsers({ data: { accessToken } });
      setRows(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudieron cargar los usuarios");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) load();
  }, [isSuperAdmin]);

  if (!isSuperAdmin) return <Navigate to="/" />;

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setBusy("create");
      const accessToken = await getAccessToken();
      const data = await createManagedUser({ data: { accessToken, email, password, role } });
      setRows(data);
      setEmail("");
      setPassword("");
      setRole("viewer");
      setOpenCreate(false);
      toast.success("Usuario creado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear el usuario");
    } finally {
      setBusy(null);
    }
  };

  const handleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setBusy("invite");
      const accessToken = await getAccessToken();
      const redirectTo =
        typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined;
      const data = await inviteManagedUser({
        data: { accessToken, email: inviteEmail, role: inviteRole, redirectTo },
      });
      setRows(data);
      setInviteEmail("");
      setInviteRole("viewer");
      setOpenInvite(false);
      toast.success("Invitación enviada por correo");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo invitar al usuario");
    } finally {
      setBusy(null);
    }
  };

  const setUserRole = async (userId: string, newRole: AppRole) => {
    try {
      setBusy(`role:${userId}`);
      const accessToken = await getAccessToken();
      const data = await updateManagedUserRole({ data: { accessToken, userId, role: newRole } });
      setRows(data);
      if (userId === me?.id) await refreshRoles();
      toast.success("Rol actualizado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar el rol");
    } finally {
      setBusy(null);
    }
  };

  const deleteUser = async (userId: string) => {
    try {
      setBusy(`delete:${userId}`);
      const accessToken = await getAccessToken();
      const data = await deleteManagedUser({ data: { accessToken, userId } });
      setRows(data);
      toast.success("Usuario eliminado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar el usuario");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Gestión de usuarios y roles</CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                size="sm"
                onClick={load}
                disabled={loading || busy !== null}
              >
                <RefreshCw />
                Actualizar
              </Button>
              <Dialog open={openCreate} onOpenChange={setOpenCreate}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus />
                    Crear usuario
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Crear usuario</DialogTitle>
                    <DialogDescription>
                      El usuario podrá entrar con correo y contraseña temporal.
                    </DialogDescription>
                  </DialogHeader>
                  <form className="space-y-4" onSubmit={handleCreate}>
                    <div className="space-y-2">
                      <Label htmlFor="new-user-email">Correo</Label>
                      <Input
                        id="new-user-email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-user-password">Contraseña temporal</Label>
                      <Input
                        id="new-user-password"
                        type="password"
                        autoComplete="new-password"
                        minLength={8}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Rol inicial</Label>
                      <Select value={role} onValueChange={(value) => setRole(value as AppRole)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((item) => (
                            <SelectItem key={item} value={item}>
                              {item}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setOpenCreate(false)}
                        disabled={busy === "create"}
                      >
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={busy === "create"}>
                        {busy === "create" ? "Creando…" : "Crear usuario"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
              <Dialog open={openInvite} onOpenChange={setOpenInvite}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="secondary">
                    <Mail />
                    Invitar por correo
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Invitar usuario</DialogTitle>
                    <DialogDescription>
                      Le enviaremos un correo con un enlace para crear su contraseña.
                    </DialogDescription>
                  </DialogHeader>
                  <form className="space-y-4" onSubmit={handleInvite}>
                    <div className="space-y-2">
                      <Label htmlFor="invite-email">Correo</Label>
                      <Input
                        id="invite-email"
                        type="email"
                        autoComplete="email"
                        value={inviteEmail}
                        onChange={(event) => setInviteEmail(event.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Rol inicial</Label>
                      <Select
                        value={inviteRole}
                        onValueChange={(value) => setInviteRole(value as AppRole)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((item) => (
                            <SelectItem key={item} value={item}>
                              {item}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setOpenInvite(false)}
                        disabled={busy === "invite"}
                      >
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={busy === "invite"}>
                        {busy === "invite" ? "Enviando…" : "Enviar invitación"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Cargando…</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin usuarios registrados.</p>
            ) : (
              <div className="space-y-3">
                {rows.map((row) => {
                  const isMe = row.user_id === me?.id;
                  const actionBusy =
                    busy === `role:${row.user_id}` || busy === `delete:${row.user_id}`;
                  return (
                    <div
                      key={row.user_id}
                      className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-[1fr_auto] sm:items-center"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {row.email ?? "Usuario sin correo"}
                        </p>
                        <p className="mt-1 truncate text-xs font-mono text-muted-foreground">
                          {row.user_id}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-1">
                          {row.roles.map((userRole) => (
                            <Badge key={userRole} variant="secondary" className="text-[10px]">
                              {userRole}
                            </Badge>
                          ))}
                          {row.roles.length === 0 && (
                            <Badge variant="outline" className="text-[10px]">
                              sin rol
                            </Badge>
                          )}
                          {isMe && (
                            <Badge variant="outline" className="text-[10px]">
                              tú
                            </Badge>
                          )}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Último acceso: {formatDate(row.last_sign_in_at)}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Select
                          value={row.primary_role}
                          onValueChange={(value) => setUserRole(row.user_id, value as AppRole)}
                          disabled={isMe || actionBusy}
                        >
                          <SelectTrigger className="w-full sm:w-[160px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map((item) => (
                              <SelectItem key={item} value={item}>
                                {item}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm" disabled={isMe || actionBusy}>
                              <Trash2 />
                              Eliminar
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Eliminar usuario</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta acción elimina el acceso de {row.email ?? row.user_id} y no se
                                puede deshacer.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteUser(row.user_id)}>
                                Eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Permisos por rol</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>
              <Badge>super_admin</Badge> Todo, incluido eliminar y gestionar usuarios.
            </p>
            <p>
              <Badge>admin</Badge> Crea y edita catálogos y registros. No elimina ni gestiona
              usuarios.
            </p>
            <p>
              <Badge>editor</Badge> Captura y edita registros. No modifica catálogos ni elimina.
            </p>
            <p>
              <Badge>viewer</Badge> Solo lectura.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
