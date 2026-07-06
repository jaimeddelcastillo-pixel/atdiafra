## Alcance

Integrar los 7 instrumentos de presión diferencial del `Calendario_Presiones_Diferenciales_2025.xlsx` a la plataforma: validar catálogo, cargar límites y sembrar todas las lecturas históricas 2025 para que aparezcan en el módulo Presiones y en el Reporte Normativo.

## Inventario detectado en el Excel

| Instrumento | Área A | Área B | LIE | LSE |
|---|---|---|---|---|
| INS-CMB-10 | DCC-01 Entrada de Personal | DCC-02 Esclusa de Siembras | 5 | 8 |
| INS-CMB-11 | DCC-03 Siembras 01 | DCC-02 Esclusa de Siembras | 13 | 16 |
| INS-CMB-12 | DCC-03 Siembras 01 | DCC-04 Siembras 02 | 10 | 13 |
| INS-CMB-18 | DCC-01 Entrada Personal Microbiología | DOF-02 Pasillo Oficinas | 5 | 8 |
| INS-CMB-19 | DCC-06 Preparación y Lavado | DCC-01 Entrada Personal Microbiología | 10 | 12 |
| INS-CMB-21 | DCC-07 Incubación | DPR-10 Pasillo Producción y Sistema de Agua | 22 | 25 |
| INS-CMB-22 | DCC-07 Incubación | DCC-06 Preparación y Lavado | 5 | 8 |

En BD ya existen los 7 instrumentos (`manometro_diferencial`) y los 7 registros en `objetivos_presion` con el par correcto de cuartos, pero **sin LIE/LSE**. Las áreas DCC-*/DOF-02/DPR-10 también existen.

Nota: `objetivos_presion` tiene entradas duplicadas para algunos pares (ej. `DCC-01 vs DCC-02` y `DCC-01 Entrada personal vs DCC-02 Esclusa siembras`). Se conservará la versión con nombre descriptivo y se desactivará el duplicado corto para evitar confusión en el selector.

## Paso 1 — Actualizar catálogo (migración/UPDATE)

- `UPDATE instrumentos SET lie_pa, lse_pa` para los 7 instrumentos con los valores del Excel.
- `UPDATE objetivos_presion SET lie_pa, lse_pa` para las 7 filas (empatadas por `instrumento_id`).
- Desactivar los 4 objetivos duplicados con nombre corto (`DCC-01 vs DCC-02`, `DCC-01 vs DOF-02`, y equivalentes) → `activo=false`. Los descriptivos quedan activos.

## Paso 2 — Importar lecturas históricas 2025

Script Python (fuera del repo) que lee el XLSX y produce un SQL `INSERT` masivo:

- Un `registros` por instrumento (`modulo='presiones'`, `nombre="<cuartoX> vs <cuartoY> · INS-CMB-XX"`, `iso` del área más limpia, `lie/lse` del Excel, `instrumento_id`, `par_cuartos_id` apuntando al objetivo descriptivo).
- Agrupar filas del Excel por `lunesDe(fecha)` → un `registro_semanas` por semana con `unidad='Pa'`, `source='imagen'` (para marcar que vinieron de calendario), `saved_at=now()`, `mes`, `anio`.
- `lecturas` jsonb: array `PuntoLectura[]` de 7 días × 3 turnos con `_na=true` para Sáb/Dom sin datos; mapear horas `07:30→Mañana`, `13:00→Media tarde`, `17:00→Tarde`; setear `valor`, `hora`, `quien=null`.
- Si el instrumento/registro ya existe (por `instrumento_id` + `modulo='presiones'`), se **omite la creación del encabezado** y solo se agregan las semanas que aún no existen (por `semana_inicio`), para no duplicar datos capturados por usuarios.

Se entrega el SQL vía `supabase--insert` en 1–2 lotes (aprox. 5,300 lecturas → ~350 semanas → ~350 filas jsonb, muy manejable).

## Paso 3 — Verificación

- Query de conteo: `SELECT registro_id, count(*) FROM registro_semanas WHERE registro_id IN (…) GROUP BY 1` → esperado ~50 semanas × 7.
- Abrir en preview `/modulo/presiones`: los 7 registros deben listarse con su rango de fechas 2025, y una semana muestra los 3 turnos poblados de Lun–Vie con Sáb/Dom en NA.
- Exportar Reporte Normativo con periodo 2025-01-01 → 2025-12-31 → validar que las 7 presiones aparezcan con Cp/Cpk, LIE/LSE y las gráficas de control estadístico (gráficas ya implementadas anteriormente).

## Fuera de alcance

- Nada de cambios al PDF (ya integra presiones).
- No se modifica la UI del módulo.
- No se tocan otros catálogos ni instrumentos ajenos al Excel.