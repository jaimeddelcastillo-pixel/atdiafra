# Diferenciación del Reporte Normativo de Presiones

## Problema observado

En el PDF `normativo-01_01_2025_-_31_03_2025`:

1. **Título genérico**: dice "REPORTE NORMATIVO DE MONITOREO AMBIENTAL" aunque el módulo filtrado sea Presiones Diferenciales.
2. **Agrupación por área vacía**: los registros de presiones no tienen `area_id` (usan `par_cuartos_id` o solo `instrumento_id`), así que caen todos bajo "Sin área". Instrumentos tipo manómetro/HEPA se mezclan con pares de cuartos en el mismo bloque.

## Objetivo

- Título del PDF adaptativo al módulo filtrado.
- En Presiones, separar en dos secciones/tablas: **Pares de cuartos (área)** y **Instrumentos independientes** (manómetros/HEPA sin par).
- No romper el reporte para los demás módulos (temp/HR, filtros, agua) ni el flujo actual.

## Cambios

### 1. Título del documento (`src/lib/export-normativo.ts`)

- Reemplazar la constante `DOC_TITULO` por una función que reciba el módulo activo:
  - `presiones` → "REPORTE NORMATIVO DE PRESIONES DIFERENCIALES"
  - `temphr` → "REPORTE NORMATIVO DE TEMPERATURA Y HUMEDAD RELATIVA"
  - `filtros` → "REPORTE NORMATIVO DE FILTROS"
  - `agua` → "REPORTE NORMATIVO DE AGUA PURIFICADA"
  - Mixto / sin filtro → mantener "REPORTE NORMATIVO DE MONITOREO AMBIENTAL"
- Detectar el módulo dominante desde `analisis[]` (todos iguales → específico; distintos → genérico).
- Pasar el título calculado a `pintarEncabezadoPie` y a la portada.

### 2. Clasificación área vs instrumento

En `src/lib/normativo.ts` añadir helper:

```ts
export function esRegistroDeInstrumento(r: Registro): boolean {
  // Registros del módulo presiones sin par_cuartos_id ni area_id
  return r.modulo === "presiones" && !r.par_cuartos_id && !r.area_id;
}
```

Y ampliar `etiquetaGrupo`/`claveGrupo` para que, cuando `modo === "area"` y el registro tenga `par_cuartos_id`, use el nombre del par de cuartos (derivado del propio `registro.nombre`, que ya incluye "Área A vs Área B") en lugar de "Sin área".

### 3. División de tablas en el PDF (`export-normativo.ts`)

Dentro del loop de grupos, partir `analisis` en dos listas antes de renderizar:

- `analisisAreas`: registros con `area_id` o `par_cuartos_id`.
- `analisisInstrumentos`: registros sin ninguno de los dos (manómetros/HEPA sueltos).

Renderizar dos secciones consecutivas con encabezado propio:

- "Registros por área / par de cuartos"
- "Registros por instrumento independiente"

Cada sección conserva el mismo layout actual (portada única, hoja de no conformidades global, luego una página por registro con tabla + gráficas). Si una lista está vacía, se omite su encabezado.

### 4. Excel (`exportarNormativoExcel`)

En la hoja "Resumen" agregar columna `Tipo` con valores `Área` / `Par de cuartos` / `Instrumento`, para que el usuario pueda filtrar en Excel sin necesidad de hojas separadas.

### 5. UI del reporte (`src/routes/reporte.normativo.tsx`)

En el listado on-screen agrupado por Área, aplicar la misma lógica: mostrar los registros de instrumentos bajo un grupo "Instrumentos independientes" en vez de "Sin área", para que la vista previa coincida con el PDF.

## Verificación

- Filtro **Módulo = Presiones**, Q1 2025 → PDF titulado "Presiones Diferenciales", con dos tablas (par de cuartos e instrumentos independientes).
- Filtro **Módulo = Temperatura y HR** → título "Temperatura y HR", sin sección de instrumentos independientes (no aplica).
- Filtro **Todos los módulos** → título genérico "Monitoreo Ambiental", agrupación por área funciona como hoy.
- Registros con área tradicional (temp/HR, agua) siguen apareciendo bajo el nombre del área.
- Excel abre con columna `Tipo` correcta en la hoja Resumen.

## Fuera de alcance

- No se cambian datos ni migraciones.
- No se toca la lógica estadística (Cp/Cpk, Western Electric, LIE/LSE) ni el renderer de gráficas.
- No se modifica el flujo de captura de lecturas ni el módulo de Presiones.
