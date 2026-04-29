// Tabla semanal 7 días × 3 turnos para PRESIÓN DIFERENCIAL (Pa) — 1 sola variable.
// Versión simplificada de WeeklyReadingsTable (que es para T y HR pareados).
import { Semana, DIAS, TURNOS, PuntoLectura } from "@/lib/semanas";
import { useEffect, useRef, useState } from "react";

interface Props {
  semana: Semana;
  /** Límite mínimo normativo (Pa). Lecturas < límite se marcan fuera. */
  limiteMinPa: number;
  /** Etiqueta legible del par para el header. */
  parLabel: string;
  /** Si la semana ya estaba guardada antes, exigimos motivo al editar lecturas previas. */
  yaGuardada?: boolean;
  onChange: (s: Semana) => void;
}

function isOut(value: number | null, min: number) {
  return value != null && Number.isFinite(value) && value < min;
}

function NumCell({ value, onCommit, className, title }: {
  value: number | null;
  onCommit: (v: number | null) => void;
  className: string;
  title?: string;
}) {
  const [draft, setDraft] = useState<string>(value == null ? "" : String(value));
  const focusedRef = useRef(false);
  useEffect(() => { if (!focusedRef.current) setDraft(value == null ? "" : String(value)); }, [value]);

  const commit = () => {
    const trimmed = draft.trim();
    const v = trimmed === "" ? null : parseFloat(trimmed);
    const final = v == null || Number.isNaN(v) ? null : v;
    if (final !== value) onCommit(final);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => { focusedRef.current = true; }}
      onBlur={() => { focusedRef.current = false; commit(); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        else if (e.key === "Escape") {
          setDraft(value == null ? "" : String(value));
          (e.target as HTMLInputElement).blur();
        }
      }}
      title={title}
      className={className}
    />
  );
}

export function WeeklyReadingsTablePresion({ semana, limiteMinPa, parLabel, yaGuardada = false, onChange }: Props) {
  const [pendingEdit, setPendingEdit] = useState<{ idx: number; value: number | null; prevValor: number | null } | null>(null);
  const [motivo, setMotivo] = useState("");

  const update = (idx: number, patch: Partial<PuntoLectura>, marcarEditado = false) => {
    const arr = (semana.lecturas ?? []).slice();
    const prev = arr[idx];
    if (!prev) return;
    const next: PuntoLectura = { ...prev, ...patch };
    if (marcarEditado) next._edited = true;
    arr[idx] = next;
    onChange({ ...semana, lecturas: arr });
  };

  const commitValor = (idx: number, v: number | null) => {
    const prev = semana.lecturas[idx];
    if (!prev) return;
    const cambioRealValor = (prev.valor ?? null) !== v;
    if (yaGuardada && cambioRealValor && prev.valor != null) {
      setPendingEdit({ idx, value: v, prevValor: prev.valor });
      setMotivo("");
      return;
    }
    update(idx, { valor: v }, cambioRealValor);
  };

  const confirmarEdicion = () => {
    if (!pendingEdit) return;
    if (!motivo.trim()) { alert("Indica un motivo de la edición"); return; }
    update(pendingEdit.idx, { valor: pendingEdit.value, _motivo: motivo.trim() }, true);
    setPendingEdit(null);
    setMotivo("");
  };

  const flat = DIAS.flatMap((dia) => TURNOS.map((turno) => ({ dia, turno })));

  return (
    <div className="rounded-xl border border-border bg-card p-3 overflow-x-auto">
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div>
          <h4 className="text-sm font-semibold">Lecturas de la semana — {parLabel}</h4>
          <p className="text-[11px] text-muted-foreground">
            Unidad: <span className="font-mono">Pa</span> · Límite normativo: ≥ {limiteMinPa} Pa
            · 7 días × 3 turnos = 21 lecturas
          </p>
        </div>
        <span className="text-[10px] text-muted-foreground">
          Sáb/Dom marcados N/A por defecto (semana inglesa). Desmárcalos si hubo lectura.
        </span>
      </div>

      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-muted/40">
            <th className="border border-border px-2 py-1 text-left">Día</th>
            <th className="border border-border px-2 py-1">Turno</th>
            <th className="border border-border px-2 py-1">Hora</th>
            <th className="border border-border px-2 py-1">Quien</th>
            <th className="border border-border px-2 py-1">Presión (Pa)</th>
            <th className="border border-border px-2 py-1">N/A</th>
          </tr>
        </thead>
        <tbody>
          {flat.map((cell, idx) => {
            const p = semana.lecturas[idx];
            if (!p) return null;
            const naCell = !!p._na;
            const out = !naCell && isOut(p.valor, limiteMinPa);
            const dudoso = !!p._dudoso;
            const editado = !!p._edited;
            return (
              <tr key={`${cell.dia}-${cell.turno}`} className={naCell ? "opacity-50" : ""}>
                <td className="border border-border px-2 py-1 font-medium">{cell.dia}</td>
                <td className="border border-border px-2 py-1">{cell.turno}</td>
                <td className="border border-border px-2 py-1">
                  <input
                    type="time"
                    value={p.hora ?? ""}
                    disabled={naCell}
                    onChange={(e) => update(idx, { hora: e.target.value || null })}
                    className="w-full bg-transparent border-0 text-xs"
                  />
                </td>
                <td className="border border-border px-2 py-1">
                  <input
                    type="text"
                    value={p.quien ?? ""}
                    disabled={naCell}
                    onChange={(e) => update(idx, { quien: e.target.value || null })}
                    className="w-full bg-transparent border-0 text-xs"
                    placeholder="Iniciales"
                  />
                </td>
                <td className={`border border-border px-2 py-1 ${out ? "bg-destructive/10" : ""} ${dudoso ? "bg-warning/10" : ""}`}>
                  <NumCell
                    value={p.valor}
                    onCommit={(v) => commitValor(idx, v)}
                    title={
                      out ? `Fuera de límite: < ${limiteMinPa} Pa`
                        : dudoso ? "Lectura marcada de baja confianza por la IA — verifica"
                          : editado ? `Editado: ${p._motivo ?? "manual"}`
                            : undefined
                    }
                    className={`w-full bg-transparent border-0 text-xs text-right font-mono ${out ? "text-destructive font-semibold" : ""}`}
                  />
                </td>
                <td className="border border-border px-2 py-1 text-center">
                  <input
                    type="checkbox"
                    checked={naCell}
                    onChange={(e) => update(idx, { _na: e.target.checked, valor: e.target.checked ? null : p.valor })}
                    title="Marcar día/turno como No Aplica (festivo, paro, etc.)"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {pendingEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card rounded-lg shadow-xl p-4 max-w-md w-full space-y-3 border border-border">
            <h3 className="text-sm font-semibold">Confirmar edición</h3>
            <p className="text-xs text-muted-foreground">
              Vas a cambiar una lectura previamente guardada
              ({pendingEdit.prevValor ?? "—"} → {pendingEdit.value ?? "—"} Pa). Indica el motivo:
            </p>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              autoFocus
              className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
              placeholder="Ej. corrección OCR, error de captura…"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setPendingEdit(null); setMotivo(""); }}
                className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted">
                Cancelar
              </button>
              <button
                onClick={confirmarEdicion}
                className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90">
                Guardar edición
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
