import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  validateSearch: () => ({}),
  head: () => ({
    meta: [
      { title: "Restablecer contraseña — TRACEA" },
      { name: "description", content: "Define una nueva contraseña para tu cuenta de TRACEA." },
      { property: "og:title", content: "Restablecer contraseña — TRACEA" },
      { property: "og:description", content: "Define una nueva contraseña para tu cuenta de TRACEA." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Supabase emite el evento PASSWORD_RECOVERY al cargar el link de recuperación.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    // También revisamos si hay sesión activa por recovery (hash con type=recovery).
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (hash.includes("type=recovery")) setRecovery(true);
    setReady(true);
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      toast.error("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Contraseña actualizada. Inicia sesión nuevamente.");
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  if (!ready) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-gradient-to-br from-primary to-secondary text-primary-foreground mb-2">
            <KeyRound className="h-6 w-6" />
          </div>
          <CardTitle>Restablecer contraseña</CardTitle>
          <CardDescription>TRACEA · Define una nueva contraseña</CardDescription>
        </CardHeader>
        <CardContent>
          {!recovery ? (
            <div className="space-y-3 text-center">
              <p className="text-sm text-muted-foreground">
                Este enlace no es válido o ya expiró. Solicita uno nuevo desde la pantalla de inicio de sesión.
              </p>
              <Button className="w-full" onClick={() => navigate({ to: "/auth" })}>
                Ir a inicio de sesión
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-pwd">Nueva contraseña</Label>
                <PasswordInput
                  id="new-pwd"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-pwd">Confirmar contraseña</Label>
                <PasswordInput
                  id="confirm-pwd"
                  required
                  minLength={6}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Guardando..." : "Guardar nueva contraseña"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
