import { ReactNode } from "react";
import { Navigate, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";

export function AuthGuard({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Cargando…
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" search={{ redirect: location.href }} />;
  }

  return <>{children}</>;
}
