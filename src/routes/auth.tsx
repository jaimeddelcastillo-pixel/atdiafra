import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useState, FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TraceaLogo } from "@/components/TraceaLogo";
import { TraceaSiteButton } from "@/components/TraceaSiteButton";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  validateSearch: () => ({}),
  head: () => ({
    meta: [
      { title: "Acceso — TRACEA" },
      { name: "description", content: "Inicia sesión o crea tu cuenta en TRACEA." },
      { property: "og:title", content: "Acceso — TRACEA" },
      { property: "og:description", content: "Inicia sesión o crea tu cuenta en TRACEA." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { session, signIn, signUp, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");

  if (!loading && session) {
    return <Navigate to="/" replace />;
  }

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) toast.error(error);
    else {
      toast.success("Sesión iniciada");
      navigate({ to: "/" });
    }
  };

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await signUp(email, password);
    setBusy(false);
    if (error) toast.error(error);
    else toast.success("Cuenta creada. Revisa tu correo si requiere confirmación, o inicia sesión.");
  };

  const handleForgot = async (e: FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Si el correo existe, recibirás un enlace para restablecer la contraseña.");
      setShowForgot(false);
      setForgotEmail("");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md rounded-xl shadow-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex items-center justify-center">
            <TraceaLogo size={64} />
          </div>
          <CardTitle className="text-3xl font-bold text-secondary">TRACEA</CardTitle>
          <CardDescription className="text-primary text-sm">Análisis de Tendencias · NOM-241</CardDescription>
        </CardHeader>
        <CardContent>
          {showForgot ? (
            <form onSubmit={handleForgot} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="forgot-email">Correo de tu cuenta</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="tu@correo.com"
                />
                <p className="text-xs text-muted-foreground">
                  Te enviaremos un enlace para restablecer tu contraseña.
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Enviando..." : "Enviar enlace"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setShowForgot(false)}
              >
                Volver
              </Button>
            </form>
          ) : (
            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Iniciar sesión</TabsTrigger>
                <TabsTrigger value="signup">Crear cuenta</TabsTrigger>
              </TabsList>
              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="email-in">Correo</Label>
                    <Input id="email-in" type="email" required placeholder="usuario@tracea.mx" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <TraceaSiteButton />
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="pwd-in">Contraseña</Label>
                      <button
                        type="button"
                        onClick={() => { setForgotEmail(email); setShowForgot(true); }}
                        className="text-xs text-primary hover:underline"
                      >
                        ¿Olvidaste tu contraseña?
                      </button>
                    </div>
                    <PasswordInput id="pwd-in" required value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? "Entrando..." : "Entrar"}
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="email-up">Correo</Label>
                    <Input id="email-up" type="email" required placeholder="usuario@tracea.mx" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <TraceaSiteButton />
                  <div className="space-y-2">
                    <Label htmlFor="pwd-up">Contraseña</Label>
                    <PasswordInput id="pwd-up" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    El primer usuario registrado recibe el rol <strong>super_admin</strong>. Los demás entran como <strong>viewer</strong> hasta ser promovidos.
                  </p>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? "Creando..." : "Crear cuenta"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
