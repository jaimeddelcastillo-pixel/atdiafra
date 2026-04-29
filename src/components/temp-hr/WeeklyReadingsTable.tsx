// Tabla 7 días × 3 turnos para T y HR pareados, una semana
import { Semana, DIAS, TURNOS, PuntoLectura } from "@/lib/semanas";
import { ISO_TEMP_HR, IsoClase } from "@/lib/catalogos";
import { useEffect, useState } from "react";

interface Props {
  semana: Semana;
  iso: IsoClase;
  /** Si la semana ya existe en BD (saved_at antes de esta sesión), exigimos motivo al corregir un valor previamente guardado. Si es nueva (recién extraída/manual sin guardar), no. */
  yaGuardada?: boolean;
  onChange: (s: Semana) => void;
}

function isOut(value: number | null, min: number, max: number) {
  return value != null && Number.isFinite(value) && (value < min || value > max);
}

interface NumCellProps {
  value: number | null;
  onCommit: (v: number | null) => void;
  className: string;
  title?: string;
}

/** Celda numérica con buffer local: el commit ocurre al perder foco o presionar Enter, no en cada keystroke.
 *  Esto permite escribir números de 2+ dígitos sin que dispare validaciones intermedias. */
function NumCell({ value, onCommit, className, title }: NumCellProps) {
  const [draft, setDraft] = useState<string>(value == null ? "" : String(value));

  // Sincronizar si el valor externo cambia (ej. extracción IA recarga la semana)
  useEffect(() => {
    setDraft(value == null ? "" : String(value));
  }, [value]);

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
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          setDraft(value == null ? "" : String(value));
          (e.target as HTMLInputElement).blur();
        }
      }}
      title={title}
      className={className}
    />
  );
}

export function WeeklyReadingsTable({ semana, iso, yaGuardada = false, onChange }: Props) {
  const limits = ISO_TEMP_HR[iso];
  const [pendingEdit, setPendingEdit] = useState<{ which: "T" | "HR"; idx: number; value: number | null; prevValor: number | null } | null>(null);
  const [motivo, setMotivo] = useState("");

  const update = (which: "T" | "HR", idx: number, patch: Partial<PuntoLectura>, marcarEditado = false) => {
    const arrName = which === "T" ? "lecturas" : "lecturas_hr";
    const arr = (semana[arrName] ?? []).slice();
    const prev = arr[idx];
    if (!prev) return;
    const next: PuntoLectura = { ...prev, ...patch };
    if (marcarEditado) next._edited = true;
    arr[idx] = next;
    onChange({ ...semana, [arrName]: arr });
  };

  const requestEdit = (which: "T" | "HR", idx: number, value: number | null) => {
    const arrName = which === "T" ? "lecturas" : "lecturas_hr";
    const prev = (semana[arrName] ?? [])[idx];
    if (!prev) return;

    // No pedir motivo cuando: la semana es nueva, no hay valor previo, o la IA marcó la celda como dudosa.
    // Sólo pedir motivo cuando hay un valor previo "estable" (ya guardado y no dudoso) que cambia.
    const requiereMotivo =
      yaGuardada &&
      prev.valor != null &&
      prev.valor !== value &&
      !prev._dudoso;

    if (requiereMotivo) {
      setPendingEdit({ which, idx, value, prevValor: prev.valor });
      setMotivo("");
    } else {
      // Limpiar marca de dudoso si el operador confirmó/corrigió manualmente
      update(which, idx, { valor: value, _dudoso: false });
    }
  };

  const confirmEdit = () => {
    if (!pendingEdit) return;
    if (!motivo.trim()) return;
    update(pendingEdit.which, pendingEdit.idx, {
      valor: pendingEdit.value,
      _motivo: motivo.trim(),
      _dudoso: false,
    }, true);
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

  /** Mueve los 3 turnos (T y HR) de un día al día contiguo (←/→). El día origen queda con valor:null pero NO se marca NA.
   *  Útil cuando la IA recorrió valores por un festivo: corres todo un día hacia su columna correcta. */
  const shiftDay = (fromDi: number, dir: -1 | 1) => {
    const toDi = fromDi + dir;
    if (toDi < 0 || toDi >= DIAS.length) return;
    const tArr = semana.lecturas.slice();
    const hrArr = (semana.lecturas_hr ?? []).slice();
    for (let ti = 0; ti < TURNOS.length; ti++) {
      const iFrom = cellIdx(fromDi, ti);
      const iTo = cellIdx(toDi, ti);
      if (tArr[iFrom] && tArr[iTo]) {
        tArr[iTo] = { ...tArr[iTo], valor: tArr[iFrom].valor, _dudoso: false, _edited: true, _motivo: tArr[iTo]._motivo ?? "Recorrido manual" };
        tArr[iFrom] = { ...tArr[iFrom], valor: null, _dudoso: false };
      }
      if (hrArr[iFrom] && hrArr[iTo]) {
        hrArr[iTo] = { ...hrArr[iTo], valor: hrArr[iFrom].valor, _dudoso: false, _edited: true, _motivo: hrArr[iTo]._motivo ?? "Recorrido manual" };
        hrArr[iFrom] = { ...hrArr[iFrom], valor: null, _dudoso: false };
      }
    }
    onChange({ ...semana, lecturas: tArr, lecturas_hr: semana.lecturas_hr ? hrArr : semana.lecturas_hr });
  };

  /** Limpia los valores (T y HR) de un día sin marcarlo NA — útil para borrar columna que la IA llenó por error. */
  const clearDay = (di: number) => {
    const tArr = semana.lecturas.slice();
    const hrArr = (semana.lecturas_hr ?? []).slice();
    for (let ti = 0; ti < TURNOS.length; ti++) {
      const i = cellIdx(di, ti);
      if (tArr[i]) tArr[i] = { ...tArr[i], valor: null, _dudoso: false };
      if (hrArr[i]) hrArr[i] = { ...hrArr[i], valor: null, _dudoso: false };
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
              const dudoso = !na && !!p?._dudoso;
              const className = `w-full rounded border px-1.5 py-1 text-right text-xs tabular-nums ${
                out ? "border-destructive text-destructive bg-destructive/5" :
                dudoso ? "border-yellow-500 bg-yellow-100 dark:bg-yellow-500/20 ring-1 ring-yellow-400" :
                p?._edited ? "border-warning bg-warning/5" : "border-input bg-background"
              }`;
              const title =
                p?._edited
                  ? `Editado · motivo: ${p._motivo ?? ""}`
                  : dudoso
                  ? "Lectura dudosa detectada por la IA — verifica contra la bitácora original"
                  : "";
              return (
                <td key={dia} className="px-1 py-1">
                  {na ? (
                    <div className="w-full rounded border border-dashed border-border bg-muted/30 px-1.5 py-1 text-center text-[10px] text-muted-foreground" title="No laborable / No aplica">N/A</div>
                  ) : (
                    <NumCell
                      value={p?.valor ?? null}
                      onCommit={(v) => requestEdit(which, i, v)}
                      className={className}
                      title={title}
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

  // Fila de controles para corregir recorridos por festivo: ← mueve los 3 turnos al día anterior, → al siguiente, ✕ limpia.
  const renderShiftControls = () => (
    <tr className="border-t border-border bg-muted/5">
      <td className="px-3 py-1 text-[10px] text-muted-foreground" title="Mover toda la columna al día anterior/siguiente o limpiarla. Útil cuando la IA recorrió valores por un festivo.">
        Mover día
      </td>
      {DIAS.map((dia, di) => {
        const naActivo = !!semana.lecturas[cellIdx(di, 0)]?._na;
        if (naActivo) {
          return <td key={dia} className="px-1 py-1 text-center text-[10px] text-muted-foreground">—</td>;
        }
        return (
          <td key={dia} className="px-1 py-1">
            <div className="flex items-center justify-center gap-0.5">
              <button
                type="button"
                onClick={() => shiftDay(di, -1)}
                disabled={di === 0}
                className="text-[10px] rounded px-1 py-0.5 border border-border bg-background hover:bg-muted disabled:opacity-30"
                title={`Mover valores de ${dia} a ${DIAS[di - 1] ?? ""}`}
              >
                ←
              </button>
              <button
                type="button"
                onClick={() => clearDay(di)}
                className="text-[10px] rounded px-1 py-0.5 border border-border bg-background hover:bg-destructive/10 hover:text-destructive"
                title={`Limpiar valores de ${dia}`}
              >
                ✕
              </button>
              <button
                type="button"
                onClick={() => shiftDay(di, 1)}
                disabled={di === DIAS.length - 1}
                className="text-[10px] rounded px-1 py-0.5 border border-border bg-background hover:bg-muted disabled:opacity-30"
                title={`Mover valores de ${dia} a ${DIAS[di + 1] ?? ""}`}
              >
                →
              </button>
            </div>
          </td>
        );
      })}
    </tr>
  );

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-muted/30">
        <h3 className="text-sm font-semibold text-foreground">Lecturas semanales — semana del {semana.semana_inicio}</h3>
        <p className="text-xs text-muted-foreground">
          7 días × 3 turnos = 21 lecturas por variable. Semana inglesa: Sáb/Dom marcados como <span className="font-medium">NA</span> por defecto. Toca <span className="font-medium">NA</span> para alternar si ese día sí se trabajó.
          {!yaGuardada && (
            <span className="block mt-1 text-[11px] text-primary">
              ✏️ Modo edición libre: corrige los valores que necesites antes de guardar (no se pide motivo). Los cambios se confirman al salir de la celda o presionar Enter.
            </span>
          )}
        </p>
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
            {renderNAControl()}
            {renderRow("T", "°C", limits.tempMin, limits.tempMax)}
            {renderRow("HR", "%HR", limits.hrMin, limits.hrMax)}
          </tbody>
        </table>
      </div>

      {/* Modal motivo de corrección — sólo aplica a semanas ya guardadas */}
      {pendingEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" onClick={() => setPendingEdit(null)}>
          <div className="w-full max-w-md rounded-lg bg-card border border-border p-5" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-sm font-semibold text-foreground">Motivo de corrección</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Estás corrigiendo un valor previamente guardado ({pendingEdit.prevValor} → {pendingEdit.value ?? "—"}). Indica el motivo para mantener trazabilidad.
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
