import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { ModuloCard } from "@/components/ModuloCard";
import { MODULOS } from "@/lib/diafra-data";
import { Activity, FlaskConical } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sistema de Análisis de Tendencias — DIAFRA S.A. de C.V." },
      { name: "description", content: "Tablero de validación: análisis de CQA's conforme a NOM-241-SSA1-2025, ISO 14644 y FEUM 13ª Edición." },
    ],
  }),
  component: Index,
});

function Index() {
  const activos = MODULOS.filter((m) => m.enabled);
  const proximos = MODULOS.filter((m) => !m.enabled);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {/* Hero / contexto */}
        <section className="mb-10">
          <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/5 via-card to-secondary/5 p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <div className="hidden sm:flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground shrink-0">
                <FlaskConical className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
                  Tablero de validación
                </h1>
                <p className="mt-2 text-sm sm:text-base text-muted-foreground max-w-3xl">
                  Registra, digitaliza desde imagen, analiza estadísticamente y visualiza tendencias de los
                  parámetros críticos de calidad de áreas clasificadas y sistemas auxiliares.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    to="/modulo/$slug"
                    params={{ slug: "temperatura-humedad" }}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <Activity className="h-4 w-4" /> Abrir Temperatura y HR
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Módulos activos */}
        <section className="mb-10">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Módulos disponibles</h2>
            <span className="text-xs text-muted-foreground">{activos.length} activos</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activos.map((m) => (
              <ModuloCard key={m.id} modulo={m} />
            ))}
            {/* También mostramos los 3 inactivos del bloque principal junto a los activos para no fragmentar */}
            {MODULOS.filter((m) => !m.enabled && ["filtros", "presiones", "agua"].includes(m.id)).map((m) => (
              <ModuloCard key={m.id} modulo={m} />
            ))}
          </div>
        </section>

        {/* Módulos próximos (extra) */}
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Próximos módulos</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {proximos
              .filter((m) => !["filtros", "presiones", "agua"].includes(m.id))
              .map((m) => (
                <ModuloCard key={m.id} modulo={m} />
              ))}
          </div>
        </section>

        <footer className="mt-12 pt-6 border-t border-border text-xs text-muted-foreground">
          DIAFRA S.A. de C.V. — Departamento de Validación. Herramienta interna conforme a FOR-VAL-16.
        </footer>
      </main>
    </div>
  );
}
