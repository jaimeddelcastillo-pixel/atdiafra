import { Reading } from "./types";
import { Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ISO_LIMITS, IsoClass } from "@/lib/diafra-data";

interface Props {
  rows: Reading[];
  iso: IsoClass;
  onChange: (rows: Reading[]) => void;
}

function isOutOfRange(value: number | null, min: number, max: number): boolean {
  return value != null && Number.isFinite(value) && (value < min || value > max);
}

export function ReadingsTable({ rows, iso, onChange }: Props) {
  const limits = ISO_LIMITS[iso];

  const update = (idx: number, patch: Partial<Reading>) => {
    onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const remove = (idx: number) => onChange(rows.filter((_, i) => i !== idx));
  const add = () =>
    onChange([
      ...rows,
      {
        id: crypto.randomUUID(),
        fecha: new Date().toISOString().slice(0, 10),
        hora: "08:00",
        temperatura: null,
        humedad: null,
        turno: "",
        operador: "",
      },
    ]);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Lecturas registradas</h3>
          <p className="text-xs text-muted-foreground">
            Límites {iso}: T {limits.tempMin}–{limits.tempMax} °C · HR {limits.hrMin}–{limits.hrMax} %
          </p>
        </div>
        <Button size="sm" onClick={add} className="gap-1">
          <Plus className="h-4 w-4" /> Nueva lectura
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Fecha</th>
              <th className="px-3 py-2 text-left font-medium">Hora</th>
              <th className="px-3 py-2 text-right font-medium">T (°C)</th>
              <th className="px-3 py-2 text-right font-medium">HR (%)</th>
              <th className="px-3 py-2 text-left font-medium">Turno</th>
              <th className="px-3 py-2 text-left font-medium">Operador</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Sin lecturas todavía. Sube una imagen o agrega una lectura manualmente.
                </td>
              </tr>
            )}
            {rows.map((r, i) => {
              const tOut = isOutOfRange(r.temperatura, limits.tempMin, limits.tempMax);
              const hOut = isOutOfRange(r.humedad, limits.hrMin, limits.hrMax);
              return (
                <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                  <td className="px-2 py-1">
                    <input
                      type="date"
                      value={r.fecha ?? ""}
                      onChange={(e) => update(i, { fecha: e.target.value })}
                      className="w-full rounded border border-input bg-background px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="time"
                      value={r.hora ?? ""}
                      onChange={(e) => update(i, { hora: e.target.value })}
                      className="w-full rounded border border-input bg-background px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="number"
                      step="0.1"
                      value={r.temperatura ?? ""}
                      onChange={(e) =>
                        update(i, { temperatura: e.target.value === "" ? null : parseFloat(e.target.value) })
                      }
                      className={`w-20 rounded border px-2 py-1 text-right text-sm tabular-nums ${
                        tOut ? "border-destructive text-destructive bg-destructive/5" : "border-input bg-background"
                      }`}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="number"
                      step="0.1"
                      value={r.humedad ?? ""}
                      onChange={(e) =>
                        update(i, { humedad: e.target.value === "" ? null : parseFloat(e.target.value) })
                      }
                      className={`w-20 rounded border px-2 py-1 text-right text-sm tabular-nums ${
                        hOut ? "border-destructive text-destructive bg-destructive/5" : "border-input bg-background"
                      }`}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="text"
                      value={r.turno ?? ""}
                      onChange={(e) => update(i, { turno: e.target.value })}
                      className="w-16 rounded border border-input bg-background px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="text"
                      value={r.operador ?? ""}
                      onChange={(e) => update(i, { operador: e.target.value })}
                      className="w-24 rounded border border-input bg-background px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="px-2 py-1 text-right">
                    <button
                      onClick={() => remove(i)}
                      className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      aria-label="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
