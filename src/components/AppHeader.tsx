import { ShieldCheck, Settings, LogOut, Users, ShieldAlert } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function AppHeader() {
  const { user, roles, isSuperAdmin, hasRole, signOut } = useAuth();
  const canSeeAudit = isSuperAdmin || hasRole("admin");
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/auth" });
  };

  const primaryRole = roles[0] ?? "—";

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gradient-to-br from-primary to-secondary text-primary-foreground">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-foreground">Sistema de Análisis de Tendencias</p>
            <p className="text-xs text-muted-foreground">DIAFRA S.A. de C.V. — Validación · FOR-VAL-16</p>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          {user && (
            <div className="hidden md:flex items-center gap-2 mr-2">
              <span className="text-xs text-muted-foreground truncate max-w-[180px]">{user.email}</span>
              <Badge variant="secondary" className="text-[10px]">{primaryRole}</Badge>
            </div>
          )}
          {canSeeAudit && (
            <Link
              to="/admin/auditoria"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Auditoría"
              title="Auditoría"
            >
              <ShieldAlert className="h-4 w-4" />
            </Link>
          )}
          {isSuperAdmin && (
            <Link
              to="/admin/usuarios"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Gestión de usuarios"
              title="Gestión de usuarios"
            >
              <Users className="h-4 w-4" />
            </Link>
          )}
          <Link
            to="/configuracion"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Configuración / Catálogos"
            title="Configuración / Catálogos"
          >
            <Settings className="h-4 w-4" />
          </Link>
          {user && (
            <Button variant="ghost" size="sm" onClick={handleLogout} title="Cerrar sesión">
              <LogOut className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
