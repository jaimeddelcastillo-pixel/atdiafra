import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { ModuloCard } from "@/components/ModuloCard";
import { LocalMigrationCard } from "@/components/LocalMigrationCard";
import { CumplimientoCard } from "@/components/CumplimientoCard";
import { MODULOS } from "@/lib/diafra-data";
import { Activity, FlaskConical, Library, ChevronRight, Gauge } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TRACEA — Análisis de Tendencias" },
      { name: "description", content: "Módulo de Análisis de Tendencias NOM-241 | TRACEA Suite" },
    ],
  }),
  component: () => <AuthGuard><Index /></AuthGuard>,
});

function Index() {
  const activos = MODULOS.filter((m) => m.enabled);
  const proximos = MODULOS.filter((m) => !m.enabled);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <LocalMigrationCard />

        {/* Hero / contexto */}
        <section className="mb-10">
          <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/5 via-card to-accent/10 p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <div className="hidden sm:flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground shrink-0">
                <FlaskConical className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
                  TRACEA
                </h1>
                <p className="mt-1 text-sm sm:text-base font-medium text-primary">
                  Análisis de Tendencias
                </p>
                <p className="mt-3 text-sm sm:text-base text-muted-foreground max-w-3xl">
                  Registra, digitaliza desde imagen, analiza estadísticamente y visualiza tendencias
                  de los parámetros críticos de calidad.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    to="/modulo/$slug"
                    params={{ slug: "temperatura-humedad" }}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow"
                  >
                    <Activity className="h-4 w-4" /> Abrir Temperatura y HR
                  </Link>
                  <Link
                    to="/modulo/$slug"
                    params={{ slug: "presiones" }}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow"
                  >
                    <Gauge className="h-4 w-4" /> Abrir Presiones diferenciales
                  </Link>
                  <Link
                    to="/reporte/tendencias"
                    className="inline-flex items-center gap-2 rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
                  >
                    <Activity className="h-4 w-4" /> Análisis de tendencias FOR-VAL-16-02
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

        {/* Cumplimiento */}
        <section className="mb-10">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Resumen</h2>
          </div>
          <CumplimientoCard />
        </section>

        {/* Catálogo */}
        <section className="mb-10">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Administración</h2>
          </div>
          <Link
            to="/configuracion"
            className="group block rounded-xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-sm transition-all"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary/10 text-secondary shrink-0">
                <Library className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-foreground">Catálogo</h3>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Da de alta y administra <span className="font-medium text-foreground">instrumentos</span> (termohigrómetros, manómetros de filtro, manómetros diferenciales, otros), <span className="font-medium text-foreground">áreas clasificadas</span>, <span className="font-medium text-foreground">sistemas HVAC</span> y <span className="font-medium text-foreground">pares de cuartos</span>. Asigna a cada instrumento la medición que le corresponde.
                </p>
              </div>
            </div>
          </Link>
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
          © 2026 TRACEA. Todos los derechos reservados. · <a href="https://tracea.site" className="hover:text-primary">tracea.site</a> · soporte@tracea.com.mx
        </footer>
      </main>
    </div>
  );
}
