
## Objetivo

Ampliar el Reporte Normativo PDF con análisis de control estadístico por variable (Temperatura, Humedad Relativa, Presiones Diferenciales), respetando la estructura general del reporte, la portada, el cálculo normativo, Cp/Cpk/Ppk, la lógica de especificaciones y el resumen de no conformidades.

## Puntos exactos que se modifican

- `src/lib/chart-renderer.ts` (líneas 43–159 `dibujarChart`, 171–227 `generarChartsRegistro`): se refactoriza el dibujado para soportar múltiples líneas de referencia y se añade la nueva gráfica de alerta/acción. La firma pública `generarChartsRegistro(registro, semanas, w, h)` se conserva para no romper `src/lib/export-utils.ts:225` ni ningún otro consumidor.
- `src/lib/export-normativo.ts` (líneas 387–404, dentro del bucle por registro): se sustituye la generación actual de gráficas por un bloque por serie que renderiza gráfica 1, gráfica 2, tabla de límites y conclusión, replicando la paginación y márgenes ya usados (`TOP_Y`, `FOOTER_H`, `tableMargin`).

Se conserva sin cambios: portada, hoja de resumen y no conformidades, tabla estadística consolidada (`headStats` / `filaSerie`), estilos de `Cp/Cpk/Ppk`, encabezado/pie corporativo, hojas del Excel, `statistics.ts` y `normativo.ts`.

## Precisión terminológica

- **LIE / LSE** — límites de especificación normativa.
- **LC** — línea central = media.
- **LAS / LAI** — límites de alerta estadística = media ± 2σ.
- **LACS / LACI** — límites de acción estadística = media ± 3σ.
- **LCS / LCI** — equivalentes a LACS/LACI en la carta de individuos.

## Cambios

### 1. `chart-renderer.ts`

- Nueva función interna `dibujarChartGenerico` con `refs: { y, label, color, dash?, labelPos? }[]` y `decimales`, más padding derecho ampliado para las etiquetas de referencia.
- Nueva utilidad `decimalesDe(registro)`: Temp/HR → 2; Presión → 3 si `registro.unidad` incluye `inH2O`, 2 en cualquier otro caso (Pa, etc.).
- Nueva función exportada `generarBloqueEstadisticoRegistro(registro, semanas, w, h): BloqueSerie[]` que, por serie, calcula una sola vez `media` y `σ` (vía `descriptive` de `statistics.ts`) y devuelve:
  ```
  { serie, unidad, decimales, lie, lse, n, media, sigma,
    lc, las, lai, lacs, laci, values,
    chartSpecUrl, chartAlertUrl, statsSuficientes, width, height }
  ```
- `generarChartsRegistro` se mantiene con la misma firma y devuelve la gráfica 1 (misma imagen que consume la UI existente y `export-utils.ts`).

**Gráfica 1 — `"<Registro> — Especificación + Control Estadístico · <serie>"`**
- Valores individuales + línea de tendencia.
- LIE / LSE (si existen) en rojo discontinuo.
- LC en verde-azul sólido *si* `statsSuficientes`.
- LCS / LCI = media ± 3σ en naranja punteado *si* `statsSuficientes`.
- Cuando no hay LIE/LSE, se dibuja el eje sin bandas normativas y sólo con las líneas estadísticas disponibles.
- Cuando `statsSuficientes = false`, solo se dibujan LIE/LSE (si existen) y los puntos.

**Gráfica 2 — `"<Registro> — Límites de Alerta y Acción · <serie>"`**
- Valores individuales + línea de tendencia.
- LC + LAS/LAI (ámbar discontinuo) + LACS/LACI (rojo punteado).
- **No** muestra LIE ni LSE.
- Cuando `statsSuficientes = false`, se renderiza una imagen con el título y el mensaje *“n insuficiente para control estadístico”* en el centro (sin líneas ni conclusión).

### 2. `export-normativo.ts`

En el bloque `if (incluirGraficas)` actual, por cada `BloqueSerie` devuelto:

1. Renderizar **Gráfica 1** (spec + control).
2. Renderizar **Gráfica 2** (alerta y acción) — o su versión "n insuficiente".
3. Si `statsSuficientes`, insertar **tabla compacta** (autoTable) con:
   `Variable | Media | σ | LC | LAS | LAI | LACS | LACI | LIE | LSE`
   redondeada según `decimales`. Cuando no hay LIE/LSE se imprimen como `—`.
4. Si `statsSuficientes`, insertar **conclusión automática** en una línea coloreada:
   - Verde — “Proceso bajo control estadístico” (sin puntos fuera de ±3σ y sin reglas Western Electric activas).
   - Ámbar — “Proceso en alerta estadística” (algún punto fuera de ±2σ pero dentro de ±3σ y sin regla WE crítica).
   - Rojo — “Proceso fuera de control estadístico” (algún punto fuera de ±3σ o cualquier hit de reglas WE 1–4).
5. Si NO `statsSuficientes`, mostrar en su lugar la línea `"n insuficiente para control estadístico"` (gris) — sin tabla, sin conclusión, sin ejecutar Western Electric.
6. Debajo, en gris pequeño y fijo:
   *“La conclusión estadística evalúa el control del proceso y no sustituye el cumplimiento normativo LIE/LSE.”*

La detección de reglas usa `westernElectric(values, media, sigma)` de `statistics.ts` **solo** cuando `statsSuficientes = true`.

### 3. Criterio único de suficiencia estadística

`statsSuficientes = n >= 2 && Number.isFinite(sigma) && sigma > 0`.

Cuando es falso: **no** se calculan LAS/LAI/LACS/LACI, **no** se ejecutan reglas Western Electric, **no** se pinta tabla de límites ni conclusión, y las etiquetas LC/LCS/LCI se omiten de la gráfica 1. La gráfica 1 sigue mostrando LIE/LSE si existen; la gráfica 2 muestra el mensaje de n insuficiente.

### 4. Paginación

Antes de dibujar cada bloque (gráfica 1, gráfica 2, tabla, conclusión) se verifica el espacio restante contra `pageH - FOOTER_H - 8`. Si no cabe, `doc.addPage()` con encabezado de continuación (`"<registro> — gráficas"`), replicando el patrón actual del archivo.

## Validación (checklist manual sobre el PDF exportado)

Se probará el flujo `exportarNormativoPDF` (invocado desde `/reporte`) con estos escenarios:

1. **Registro `temphr` con datos suficientes en Temp y HR** — el PDF debe generar dos bloques (Temperatura, Humedad), cada uno con dos gráficas, tabla de límites y conclusión.
2. **Registro `presiones` únicamente** — un solo bloque de "Presión (unidad)" con decimales correctos (3 para inH2O, 2 para Pa).
3. **Lecturas insuficientes** (`n < 2`) — se muestra la gráfica 1 con LIE/LSE y puntos; la gráfica 2 con el mensaje "n insuficiente"; sin tabla ni conclusión; el resto del reporte sigue exportando.
4. **Sin LIE/LSE definidos** — las gráficas se dibujan sin bandas normativas; la tabla y conclusión aparecen si `statsSuficientes`; en la tabla LIE/LSE se muestran como `—`.
5. **σ = 0 o n < 2** — no se calculan LAS/LAI/LACS/LACI, no se ejecutan reglas WE, se muestra "n insuficiente para control estadístico".

Validación técnica: build limpio (typecheck del proyecto), y verificación de que `src/lib/export-utils.ts` (que también consume `generarChartsRegistro`) siga compilando sin cambios.

## Fuera de alcance

- Cartas X̄-R / MR / EWMA / CUSUM.
- Reglas de Nelson adicionales.
- Cambios en cálculo o interpretación de Cp/Cpk/Ppk.
- Cambios en el resumen de no conformidades, portada, Excel o UI web.
