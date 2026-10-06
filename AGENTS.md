# Project architecture

- Generate editable trend charts by augmenting SheetJS workbooks with OOXML chart parts; this preserves spreadsheet editability without adding a server-only office dependency.
- Normative capacity and alert/action limits come from src/lib/estadistica-pno.ts (T/HR subgroup = one day's shifts); keeps a single PNO-VAL-16 source of truth.
- Period filters use each reading's real date (week start + day offset) via src/lib/fechas-lectura.ts; weeks straddling period edges must not be counted whole.
