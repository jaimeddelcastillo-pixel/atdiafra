// Tabla 7 días × 3 turnos para T y HR pareados, una semana
import { Semana, DIAS, TURNOS, PuntoLectura } from "@/lib/semanas";
import { ISO_TEMP_HR, IsoClase } from "@/lib/catalogos";
import { useState } from "react";

interface Props {
  semana: Semana;
  iso: IsoClase;
  onChange: (s: Semana) => void;
}

function isOut(value: number | null, min: number, max: number) {
  return value != null && Number.isFinite(value) && (value < min || value > max);
}

export function WeeklyReadingsTable({ semana, iso, onChange }: Props) {
  const limits = ISO_TEMP_HR[iso];
  const [pendingEdit, setPendingEdit] = useState<{ which: "T" | "HR"; idx: number; value: number | null } | null>(null);
  const [motivo, setMotivo] = useState("");

  const update = (which: "T" | "HR", idx: number, patch: Partial<PuntoLectura>, requireMotivo = false) => {
    const arrName = which === "T" ? "lecturas" : "lecturas_hr";
    const arr = (semana[arrName] ?? []).slice();
    const prev = arr[idx];
    if (!prev) return;
    const next: PuntoLectura = { ...prev, ...patch };
    if (requireMotivo && prev.valor != null && prev.valor !== next.valor) {
      next._edited = true;
    }
    arr[idx] = next;
    onChange({ ...semana, [arrName]: arr });
  };

  const requestEdit = (which: "T" | "HR", idx: number, value: number | null) => {
    const arrName = which === "T" ? "lecturas" : "lecturas_hr";
    const prev = (semana[arrName] ?? [])[idx];
    // Si la celda ya tenía valor y se está cambiando, solicitar motivo
    if (prev?.valor != null && prev.valor !== value) {
      setPendingEdit({ which, idx, value });
      setMotivo("");
    } else {
      update(which, idx, { valor: value });
    }
  };

  const confirmEdit = () => {
    if (!pendingEdit) return;
    if (!motivo.trim()) return;
    update(pendingEdit.which, pendingEdit.idx, { valor: pendingEdit.value, _edited: true, _motivo: motivo.trim() }, true);
    setPendingEdit(null);
    setMotivo("");
  };

  // Construir matriz visual (filas: turnos, columnas: días)
  const cellIdx = (diaIdx: number, turnoIdx: number) => diaIdx * 3 + turnoIdx;

  const setDayNA = (di: number, na: boolean) => {
    const tArr = semana.lecturas.slice();
    const hrArr = (semana.lecturas_hr ?? []).slice();
    for (let ti = 0; ti < TURNOS.length; ti++) {
      const i = cellIdx(di, ti);
      if (tArr[i]) tArr[i] = { ...tArr[i], _na: na, valor: na ? null : tArr[i].valor };
      if (hrArr[i]) hrArr[i] = { ...hrArr[i], _na: na, valor: na ? null : hrArr[i].valor };
    }
    onChange({ ...semana, lecturas: tArr, lecturas_hr: semana.lecturas_hr ? hrArr : semana.lecturas_hr });
  };

  const renderRow = (which: "T" | "HR", unidad: string, min: number, max: number) => {
    const arr = which === "T" ? semana.lecturas : (semana.lecturas_hr ?? []);
    return (
      <>
        <tr className="bg-muted/30">
          <th colSpan={1 + 7} className="px-3 py-1.5 text-left text-xs font-semibold text-foreground">
            {which === "T" ? "Temperatura (°C)" : "Humedad relativa (%HR)"} — spec {min}–{max} {unidad}
          </th>
        </tr>
        {TURNOS.map((turno, ti) => (
          <tr key={turno} className="border-t border-border">
            <td className="px-3 py-1 text-xs font-medium text-muted-foreground bg-muted/10">{turno}</td>
            {DIAS.map((dia, di) => {
              const i = cellIdx(di, ti);
              const p = arr[i];
              const na = !!p?._na;
              const out = !na && isOut(p?.valor ?? null, min, max);
              return (
                <td key={dia} className="px-1 py-1">
                  {na ? (
                    <div className="w-full rounded border border-dashed border-border bg-muted/30 px-1.5 py-1 text-center text-[10px] text-muted-foreground" title="No laborable / No aplica">N/A</div>
                  ) : (
                    <input
                      type="number"
                      step="0.1"
                      value={p?.valor ?? ""}
                      onChange={(e) => requestEdit(which, i, e.target.value === "" ? null : parseFloat(e.target.value))}
                      title={p?._edited ? `Editado · motivo: ${p._motivo ?? ""}` : ""}
                      className={`w-full rounded border px-1.5 py-1 text-right text-xs tabular-nums ${
                        out ? "border-destructive text-destructive bg-destructive/5" :
                        p?._edited ? "border-warning bg-warning/5" : "border-input bg-background"
                      }`}
                    />
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </>
    );
  };

  // Fila de control NA por día (aplica a los 3 turnos del día y a T+HR)
  const renderNAControl = () => (
    <tr className="border-t border-border bg-muted/10">
      <td className="px-3 py-1 text-[10px] text-muted-foreground">No laborable</td>
      {DIAS.map((dia, di) => {
        const naActivo = !!semana.lecturas[cellIdx(di, 0)]?._na;
        return (
          <td key={dia} className="px-1 py-1 text-center">
            <button
              type="button"
              onClick={() => setDayNA(di, !naActivo)}
              className={`text-[10px] rounded px-1.5 py-0.5 border ${naActivo ? "bg-muted text-foreground border-border" : "bg-background text-muted-foreground border-border hover:bg-muted"}`}
              title={naActivo ? "Marcar como laborable" : "Marcar día como no laborable (NA)"}
            >
              {naActivo ? "NA ✓" : "NA"}
            </button>
          </td>
        );
      })}
    </tr>
  );

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-muted/30">
        <h3 className="text-sm font-semibold text-foreground">Lecturas semanales — semana del {semana.semana_inicio}</h3>
        <p className="text-xs text-muted-foreground">7 días × 3 turnos = 21 lecturas por variable. Las celdas editadas tras una carga aparecen marcadas en amarillo.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground"></th>
              {DIAS.map((d) => (
                <th key={d} className="px-1 py-2 text-center font-medium text-muted-foreground">{d.slice(0, 3)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {renderRow("T", "°C", limits.tempMin, limits.tempMax)}
            {renderRow("HR", "%HR", limits.hrMin, limits.hrMax)}
          </tbody>
        </table>
      </div>

      {/* Modal motivo de corrección */}
      {pendingEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" onClick={() => setPendingEdit(null)}>
          <div className="w-full max-w-md rounded-lg bg-card border border-border p-5" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-sm font-semibold text-foreground">Motivo de corrección</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Estás corrigiendo un valor previamente registrado. Indica el motivo para mantener trazabilidad.
            </p>
            <input
              autoFocus
              type="text"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: error de transcripción"
              className="mt-3 w-full rounded border border-input bg-background px-3 py-2 text-sm"
              onKeyDown={(e) => { if (e.key === "Enter") confirmEdit(); }}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setPendingEdit(null)} className="rounded-md border border-border px-3 py-1.5 text-xs">Cancelar</button>
              <button onClick={confirmEdit} disabled={!motivo.trim()} className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs disabled:opacity-50">Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
