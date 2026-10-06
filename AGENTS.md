# Project architecture

- Generate editable trend charts by augmenting SheetJS workbooks with OOXML chart parts; this preserves spreadsheet editability without adding a server-only office dependency.
- Normative capacity and alert/action limits come from src/lib/estadistica-pno.ts (T/HR subgroup = one day's shifts); keeps a single PNO-VAL-16 source of truth.
- Period filters use each reading's real date (week start + day offset) via src/lib/fechas-lectura.ts; weeks straddling period edges must not be counted whole.
- Pressure/filter alert-action limits use daily means while spec compliance uses each individual reading; keeps the FOR-VAL-16-02 package and normative report consistent.
- T/HR control charts use the 3-way X̄-MR-R (cartaXbarMRR) and capacity verdicts use Ppk; Cp/Cpk are reference-only because readings within a day are time-dependent.
- Filter change dates live in the cambios_filtro table (not on instrumentos) so multiple changes per instrument can be charted and regressed.

- /reporte/tendencias and the FOR-VAL-16-02 Excel share construirBloques() in src/lib/export-forval16.ts; screen, Excel and Word must show identical numbers.
- registro_analisis_tendencias is versioned by a DB trigger (previous row copied to registro_analisis_tendencias_historial, created_by/updated_by set server-side); history can't be bypassed by the client.
