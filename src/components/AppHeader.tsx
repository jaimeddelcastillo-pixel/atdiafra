import { Settings, LogOut, Users, ShieldAlert } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TraceaLogo } from "@/components/TraceaLogo";

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
    <header className="border-b border-[#042C53] bg-[#042C53]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <TraceaLogo size={36} />
          <div className="leading-tight">
            <p className="text-[28px] font-bold text-white tracking-tight">DIAFRA</p>
            <p className="text-xs text-[#8587E8]">Análisis de Tendencias</p>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          {user && (
            <div className="hidden md:flex items-center gap-2 mr-2">
              <span className="text-xs text-white/80 truncate max-w-[180px]">{user.email}</span>
              <Badge variant="secondary" className="text-[10px] bg-[#8587E8] text-white border-transparent">{primaryRole}</Badge>
            </div>
          )}
          {canSeeAudit && (
            <Link
              to="/admin/auditoria"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/20 text-white hover:bg-white/10 transition-colors"
              aria-label="Auditoría"
              title="Auditoría"
            >
              <ShieldAlert className="h-4 w-4" />
            </Link>
          )}
          {isSuperAdmin && (
            <Link
              to="/admin/usuarios"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/20 text-white hover:bg-white/10 transition-colors"
              aria-label="Gestión de usuarios"
              title="Gestión de usuarios"
            >
              <Users className="h-4 w-4" />
            </Link>
          )}
          <Link
            to="/configuracion"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/20 text-white hover:bg-white/10 transition-colors"
            aria-label="Configuración / Catálogos"
            title="Configuración / Catálogos"
          >
            <Settings className="h-4 w-4" />
          </Link>
          {user && (
            <Button variant="ghost" size="sm" onClick={handleLogout} title="Cerrar sesión" className="text-white hover:bg-white/10 hover:text-white">
              <LogOut className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
