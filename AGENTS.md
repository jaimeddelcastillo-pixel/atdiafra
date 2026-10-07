# Project architecture

- Generate editable trend charts by augmenting SheetJS workbooks with OOXML chart parts; this preserves spreadsheet editability without adding a server-only office dependency.
- Normative capacity and alert/action limits come from src/lib/estadistica-pno.ts (T/HR subgroup = one day's shifts); keeps a single PNO-VAL-16 source of truth.
- Period filters use each reading's real date (week start + day offset) via src/lib/fechas-lectura.ts; weeks straddling period edges must not be counted whole.
- Pressure/filter alert-action limits use daily means while spec compliance uses each individual reading; keeps the FOR-VAL-16-02 package and normative report consistent.
- T/HR control charts use the 3-way X̄-MR-R (cartaXbarMRR) and capacity verdicts use Ppk; Cp/Cpk are reference-only because readings within a day are time-dependent.
- Filter change dates live in the cambios_filtro table (not on instrumentos) so multiple changes per instrument can be charted and regressed.

- /reporte/tendencias and the FOR-VAL-16-02 Excel share construirBloques() in src/lib/export-forval16.ts; screen, Excel and Word must show identical numbers.
- registro_analisis_tendencias is versioned by a DB trigger (previous row copied to registro_analisis_tendencias_historial, created_by/updated_by set server-side); history can't be bypassed by the client.
- AT records have estado borrador/emitido enforced by the registro_at_versionar trigger (emitido rows reject edits; only admins emit or reopen with a motivo); the app's read-only mode is just a convenience.
- The FOR-VAL-16-02 Word is generated client-side with docx (src/lib/word-forval16.ts) from the same Bloque/PNG/texto as screen and Excel; template texts live in the versioned formato_forval16 table (insert-only, latest wins) so past exports stay reproducible.
- Manometer operating range (instrumentos.op_min_pa/op_max_pa) is informational only (grey band); LIE/LSE alone drive compliance and capacity, so normative spec and process setpoints never mix.
- Signer names/positions come from the perfiles table (one row per auth user); FOR-VAL-16-02 change control and "Sustituye a" count only emitted versions.
- Every drizzle/migrations file is mirrored to supabase/migrations with a reference header so the full schema is reviewable in GitHub; historial AT is immutable via triggers and deletes leave an ELIMINADO row.
