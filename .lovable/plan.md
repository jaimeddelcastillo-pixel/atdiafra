# Visibilidad y control de lo capturado

## Qué pasa hoy
- La pantalla "Reporte consolidado" agrupa todo por el área del registro. Los 10 registros de presiones no tienen área propia (sus instrumentos sí la tienen en el catálogo), así que todos caen en "Sin área".
- No hay un listado que diga "qué falta capturar esta semana" por instrumento o área.

## Qué se va a construir

### 1. Ningún registro vuelve a decir "Sin área"
- Si el registro no tiene área, se toma la del instrumento (o el área libre del instrumento). Para pares de cuartos se muestra "Cuarto X vs Cuarto Y".
- Solo si ni el registro ni el instrumento tienen área aparece "Instrumento sin área asignada", con un enlace a Configuración para corregirlo.
- El mismo criterio se aplica en el reporte normativo y en los formatos exportados.

### 2. Pestañas en el Reporte consolidado: "Por área" | "Por instrumento" | "Avance semanal"
- **Por área**: como hoy, pero con los registros de presiones ya en su área.
- **Por instrumento**: lista plana de todos los instrumentos con datos (código, tipo, área, módulo, primera y última semana, cantidad de semanas, % completo en el periodo, estado Cumple/No cumple). Con buscador y filtro por módulo.
- **Avance semanal** (nuevo, para el seguimiento diario): tabla con una fila por instrumento/registro y una columna por semana del periodo:
  - Verde = completa, amarillo = parcial (ej. 9/15), gris = sin captura, rojo = alguna lectura fuera de límites.
  - Al dar clic en una celda se abre esa semana en su módulo para capturar o corregir.
  - Encabezado con resumen: "X de Y instrumentos al día esta semana", semanas pendientes, lecturas fuera de límites.

### 3. Ayuda para capacitar
- Una leyenda corta arriba de cada pestaña que explica qué muestra y qué significan los colores.
- Botón "Exportar avance" (Excel) con la tabla de avance semanal, útil para juntas y capacitación.

## Fuera de alcance
- No se cambian datos guardados (el área se lee del instrumento al mostrar; no se reescriben registros).
- No se cambia la lógica de NC/alertas/capacidad.

## Detalles técnicos
- Nuevo helper compartido `areaEfectiva(registro, areasMap, instrMap, objetivosMap)` en `src/lib/normativo.ts`; lo usan `reporte.index.tsx` (`etiquetaArea`/`claveArea`), `reporte.normativo.tsx` y `export-normativo.ts` (sustituye los fallbacks "Sin área" en líneas ~634/654).
- `esRegistroDeInstrumento` se mantiene para separar áreas vs. instrumentos.
- Avance semanal reutiliza `semanasDelPeriodo`, `lecturasCapturadas`, `lecturasEsperadas` y `consolidarPorInstrumento`; enlace de celda a `/modulo/$slug` con el registro y la semana como parámetros de búsqueda (el módulo abre esa semana si viene en la URL).
- Exportación del avance con la librería de Excel ya usada en `export-utils.ts`.
