// Resumen rápido de cumplimiento del año vigente para el tablero principal.
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Activity, ArrowRight } from "lucide-react";
import { listRegistros, lunesDe, type Registro } from "@/lib/semanas";

export function CumplimientoCard() {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listRegistros()
      .then(setRegistros)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const anio = new Date().getFullYear();
  const inicio = new Date(anio, 0, 1);
  const hoy = new Date();
  const lunes: string[] = [];
  let cursor = new Date(lunesDe(inicio) + "T00:00:00");
  while (cursor <= hoy) {
    lunes.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 7);
  }
  const totalSemanas = lunes.length;

  let totalEsperado = 0;
  let totalCompletas = 0;
  const porModulo: Record<string, { reg: number; completas: number; esperado: number }> = {};
  for (const r of registros) {
    const necesarias = r.modulo === "temphr" ? 42 : 21;
    const completas = r.semanas.filter((s) => {
      const t = (s.lecturas ?? []).filter((p) => p.valor != null).length;
      const hr = (s.lecturas_hr ?? []).filter((p) => p.valor != null).length;
      return (t + hr) >= necesarias && s.semana_inicio.startsWith(String(anio));
    }).length;
    totalEsperado += totalSemanas;
    totalCompletas += completas;
    const k = r.modulo;
    porModulo[k] = porModulo[k] ?? { reg: 0, completas: 0, esperado: 0 };
    porModulo[k].reg += 1;
    porModulo[k].completas += completas;
    porModulo[k].esperado += totalSemanas;
  }

  const pct = totalEsperado > 0 ? Math.round((totalCompletas / totalEsperado) * 100) : 0;
  const color = pct >= 90 ? "text-success" : pct >= 60 ? "text-warning" : "text-destructive";

  return (
    <Link
      to="/reporte"
      className="group block rounded-xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-sm transition-all"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
          <Activity className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-foreground">Cumplimiento {anio}</h3>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground mt-1">Cargando…</p>
          ) : registros.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-1">Aún no hay registros en la nube.</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mt-1">
                <span className={`text-lg font-semibold ${color} mr-1`}>{pct}%</span>
                semanas completas vs. esperadas a la fecha ({totalCompletas} / {totalEsperado}).
              </p>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {Object.entries(porModulo).map(([m, v]) => (
                  <span key={m}>
                    <span className="font-medium text-foreground">{m}</span>: {v.completas}/{v.esperado} ({v.reg} reg)
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
