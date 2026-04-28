import { ShieldCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";

export function AppHeader() {
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
        <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full bg-muted px-2.5 py-1">NOM-241-SSA1-2025</span>
          <span className="rounded-full bg-muted px-2.5 py-1">ISO 14644</span>
          <span className="rounded-full bg-muted px-2.5 py-1">FEUM 13ª Ed.</span>
        </div>
      </div>
    </header>
  );
}
