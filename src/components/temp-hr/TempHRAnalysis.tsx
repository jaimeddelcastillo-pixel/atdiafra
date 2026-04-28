import { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Line, ReferenceLine, ReferenceArea,
  XAxis, YAxis, Tooltip, CartesianGrid, Scatter, Legend,
} from "recharts";
import { descriptive, capability, westernElectric, fmt } from "@/lib/statistics";
import { ISO_TEMP_HR, IsoClase } from "@/lib/catalogos";
import { Semana, flattenLecturas } from "@/lib/semanas";
import { AlertTriangle, CheckCircle2, TrendingUp } from "lucide-react";

interface Props {
  semanas: Semana[];
  iso: IsoClase;
}

interface VarConfig {
  campo: "lecturas" | "lecturas_hr";
  label: string;
  unit: string;
  LSL: number;
  USL: number;
  color: string;
}

function StatCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "ok" | "warn" | "bad" }) {
  const toneClass =
    tone === "ok" ? "text-success" : tone === "warn" ? "text-warning" : tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${toneClass}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function AnalysisBlock({ semanas, cfg }: { semanas: Semana[]; cfg: VarConfig }) {
  const series = useMemo(() => flattenLecturas(semanas, cfg.campo), [semanas, cfg.campo]);
  const values = series.map((s) => s.value);
  const stats = descriptive(values);
  const cap = capability(values, cfg.LSL, cfg.USL);
  const we = stats ? westernElectric(values, stats.mean, stats.stdev) : [];
  const sigma = stats?.stdev ?? 0;
  const mean = stats?.mean ?? 0;

  const enriched = series.map((s) => {
    const oos = s.value < cfg.LSL || s.value > cfg.USL;
    const ooc = sigma ? Math.abs(s.value - mean) > 3 * sigma : false;
    return { ...s, oos, ooc };
  });
  const outliers = enriched.filter((d) => d.oos || d.ooc);
  const editados = enriched.filter((d) => d.edited);

  if (!stats) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        Sin datos suficientes para analizar {cfg.label.toLowerCase()}.
      </div>
    );
  }

  const cpkTone: "ok" | "warn" | "bad" = cap.Cpk == null ? "warn" : cap.Cpk >= 1.33 ? "ok" : cap.Cpk >= 1 ? "warn" : "bad";
  const oosTone: "ok" | "warn" | "bad" = cap.withinSpec >= 100 ? "ok" : cap.withinSpec >= 95 ? "warn" : "bad";

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{cfg.label}</h3>
          <p className="text-xs text-muted-foreground">
            Especificación: {cfg.LSL}–{cfg.USL} {cfg.unit} · n = {stats.n}
          </p>
        </div>
        {we.length === 0 && outliers.length === 0 ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
            <CheckCircle2 className="h-3.5 w-3.5" /> En control
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" /> {we.length + outliers.length} alerta(s)
          </span>
        )}
      </div>

      <div className="p-5 space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          <StatCard label="Media" value={`${fmt(stats.mean)} ${cfg.unit}`} />
          <StatCard label="σ (s)" value={fmt(stats.stdev, 3)} />
          <StatCard label="Mín / Máx" value={`${fmt(stats.min)} / ${fmt(stats.max)}`} />
          <StatCard label="P5 / P95" value={`${fmt(stats.p5)} / ${fmt(stats.p95)}`} />
          <StatCard label="Cpk / Ppk" value={`${fmt(cap.Cpk)} / ${fmt(cap.Ppk)}`} tone={cpkTone}
            sub={cap.Cp != null ? `Cp ${fmt(cap.Cp)}` : undefined} />
          <StatCard label="Dentro de spec" value={`${fmt(cap.withinSpec, 1)} %`} tone={oosTone} />
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={enriched} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.012 250)" />
              <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]}
                tickFormatter={(v) => new Date(v).toLocaleDateString()} fontSize={11} stroke="oklch(0.5 0.025 260)" />
              <YAxis domain={[
                  (dataMin: number) => Math.min(dataMin, cfg.LSL) - sigma,
                  (dataMax: number) => Math.max(dataMax, cfg.USL) + sigma,
                ]} fontSize={11} stroke="oklch(0.5 0.025 260)" width={40} />
              <Tooltip labelFormatter={(v) => new Date(v as number).toLocaleString()}
                formatter={(val) => [`${fmt(Number(val))} ${cfg.unit}`, cfg.label]}
                contentStyle={{ borderRadius: 8, border: "1px solid oklch(0.9 0.012 250)" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />

              <ReferenceArea y1={mean - sigma} y2={mean + sigma} fill="oklch(0.62 0.16 150)" fillOpacity={0.06} />
              <ReferenceArea y1={mean - 2 * sigma} y2={mean - sigma} fill="oklch(0.78 0.16 75)" fillOpacity={0.07} />
              <ReferenceArea y1={mean + sigma} y2={mean + 2 * sigma} fill="oklch(0.78 0.16 75)" fillOpacity={0.07} />

              <ReferenceLine y={mean} stroke="oklch(0.51 0.21 264)" strokeDasharray="4 4" label={{ value: "X̄", position: "right", fontSize: 11 }} />
              <ReferenceLine y={mean + 2 * sigma} stroke="oklch(0.78 0.16 75)" strokeDasharray="2 4" />
              <ReferenceLine y={mean - 2 * sigma} stroke="oklch(0.78 0.16 75)" strokeDasharray="2 4" />
              <ReferenceLine y={mean + 3 * sigma} stroke="oklch(0.6 0.23 27)" strokeDasharray="2 2" label={{ value: "+3σ", position: "right", fontSize: 11 }} />
              <ReferenceLine y={mean - 3 * sigma} stroke="oklch(0.6 0.23 27)" strokeDasharray="2 2" label={{ value: "-3σ", position: "right", fontSize: 11 }} />

              <ReferenceLine y={cfg.USL} stroke="oklch(0.6 0.23 27)" label={{ value: `LSE ${cfg.USL}`, position: "insideTopRight", fontSize: 11, fill: "oklch(0.6 0.23 27)" }} />
              <ReferenceLine y={cfg.LSL} stroke="oklch(0.6 0.23 27)" label={{ value: `LIE ${cfg.LSL}`, position: "insideBottomRight", fontSize: 11, fill: "oklch(0.6 0.23 27)" }} />

              <Line type="monotone" dataKey="value" name={cfg.label} stroke={cfg.color} strokeWidth={2}
                dot={{ r: 3, fill: cfg.color }} activeDot={{ r: 5 }} isAnimationActive={false} />
              <Scatter data={outliers} dataKey="value" fill="oklch(0.6 0.23 27)" name="Fuera de spec / 3σ" />
              {/* Editados se muestran como triángulos (shape) */}
              <Scatter data={editados} dataKey="value" fill="oklch(0.78 0.16 75)" shape="triangle" name="Editado manualmente" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {we.length > 0 && (
          <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-warning" />
              <p className="text-sm font-semibold text-foreground">Reglas Western Electric activadas</p>
            </div>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {we.slice(-6).map((h, i) => (
                <li key={i}>
                  <span className="inline-block min-w-12 font-medium text-foreground">Regla {h.rule}</span>
                  · punto #{h.index + 1} ({enriched[h.index]?.label}) — {h.description}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export function TempHRAnalysis({ semanas, iso }: Props) {
  const limits = ISO_TEMP_HR[iso];
  const configs: VarConfig[] = [
    { campo: "lecturas",    label: "Temperatura",       unit: "°C", LSL: limits.tempMin, USL: limits.tempMax, color: "oklch(0.51 0.21 264)" },
    { campo: "lecturas_hr", label: "Humedad Relativa",  unit: "%",  LSL: limits.hrMin,   USL: limits.hrMax,   color: "oklch(0.66 0.115 190)" },
  ];
  return (
    <div className="space-y-5">
      {configs.map((c) => (
        <AnalysisBlock key={c.campo} semanas={semanas} cfg={c} />
      ))}
    </div>
  );
}
