
## Alcance

Integrar el histórico 2025 de **Temperatura y Humedad Relativa** del área de Microbiología a partir del Excel `Calendario_Tendencias_Temperatura_HR_2025.xlsx` (4 hojas, una por termohigrómetro, 3 lecturas diarias: 07:30 / 13:00 / 17:00).

## Mapeo (catálogo ya existe)

| Hoja Excel | Instrumento | Área | Registro destino |
|---|---|---|---|
| INS-CMB-20 | INS-CMB-20 | DCC-03 Siembras I | nuevo |
| INS-CMB-28 | INS-CMB-28 | DCC-04 Siembras II | nuevo |
| INS-CMB-03 | INS-CMB-03 | DCC-07 Incubación | nuevo |
| INS-CMB-29 | INS-CMB-29 | DCC-05 Preparación y Lavado | nuevo (tras limpieza) |

Límites por instrumento: T 18–25 °C, HR 30–65 %.

## Paso 1 — Limpieza

Borrar los **12 registros duplicados** existentes de `DCC-05 · INS-CMB-29` (y sus semanas por cascada) para arrancar limpio.

## Paso 2 — Carga

Por cada instrumento:
1. Crear un `registro` en `registros` (módulo `temphr`) con nombre `DCC-XX Área · INS-CMB-YY` y límites 18–25 / 30–65.
2. Agrupar filas del Excel por **lunes** de cada semana (`semana_inicio`).
3. Por cada semana construir un objeto `Semana` con:
   - `lecturas` (T °C) y `lecturas_hr` (%HR) — 7 días × 3 turnos.
   - Turnos: 07:30 → **Mañana**, 13:00 → **Media tarde**, 17:00 → **Tarde**.
   - **Sábado y Domingo**: siempre `_na: true`.
   - **Días L–V sin fila en el Excel** (festivos oficiales + Jueves y Viernes Santo): también `_na: true`. Regla automática — si no hay dato en el Excel para un día laborable, se marca N/A.
   - `source: "imagen"`, `quien: "Carga histórica 2025"`, `hora` = "07:30" / "13:00" / "17:00".
4. Insertar `registros` + `registro_semanas` vía la herramienta de inserción SQL (JSON preconstruido en Python).

## Paso 3 — Verificación

- Contar semanas insertadas por instrumento (esperado ≈ 52) y lecturas totales.
- Reportar días marcados N/A detectados (festivos + Semana Santa) para que los revises.
- Abrir el módulo T/HR y confirmar que aparecen los 4 registros con sus tendencias.

## Detalle técnico

Script Python en el sandbox:
1. `psql DELETE FROM registros WHERE nombre = 'DCC-05 Preparación y Lavado · INS-CMB-29';`
2. Parsear el Excel con `pandas`, iterar por hoja.
3. Construir arrays de `lecturas` y `lecturas_hr` según reglas.
4. Emitir un `.sql` con `INSERT INTO registros (…)` + `INSERT INTO registro_semanas (…, lecturas::jsonb, lecturas_hr::jsonb, …)`.
5. Ejecutar con la herramienta `supabase--insert` (una sola llamada por chunk).
