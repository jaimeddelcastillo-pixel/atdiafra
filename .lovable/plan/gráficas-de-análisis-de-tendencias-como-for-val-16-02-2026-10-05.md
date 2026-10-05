# Gráficas de análisis de tendencias como FOR-VAL-16-02

## Objetivo
Generar desde las capturas de TRACEA un Excel de DIAFRA con tablas y gráficas editables, siguiendo el formato visual y estadístico de FOR-VAL-16-02. La primera versión cubrirá temperatura, humedad relativa y presión diferencial.

## Qué se construirá

### 1. Un reporte de tendencias por instrumento
- Añadir una acción clara **“Tendencias Excel”** junto a cada instrumento con capturas.
- Usar automáticamente el instrumento y el periodo ya seleccionados en el Reporte consolidado; no volver a pedir fechas.
- Si no existen lecturas válidas, mostrar un aviso y no descargar un archivo vacío.

### 2. Tabla diaria de valores
- Agrupar las capturas por fecha real y calcular el **promedio diario** de todos los turnos válidos.
- Omitir casillas N/A y conservar sábados y domingos cuando sí tengan lecturas.
- Para temperatura/humedad, crear una hoja y gráfica para cada variable; para presión, una hoja y gráfica de presión.
- Incluir las columnas: fecha/día, promedio diario, media del periodo, límite inferior y superior de especificación, límites de alerta y límites de acción.

### 3. Cálculos estadísticos
- Calcular la media y desviación estándar con los promedios diarios del periodo elegido.
- Límites de alerta: media ±2σ.
- Límites de acción/control: media ±3σ.
- Mantener separados los límites estadísticos de los límites de especificación definidos para el registro o instrumento.
- No convertir una alerta estadística en No Conformidad automática; se mantienen los criterios normativos actuales.

### 4. Excel editable y utilizable en Word
- Crear un archivo `.xlsx` de DIAFRA con una hoja por variable.
- Cada hoja tendrá la tabla de valores y una gráfica nativa de Excel, no una imagen, para poder editarla y copiarla a Word.
- Replicar la estructura visual del documento de referencia: gráfica XY con líneas, título por instrumento/área, eje horizontal por días y eje vertical con unidad.
- Las series quedarán vinculadas a las celdas de la tabla para que la gráfica cambie al editar valores.
- Ajustar automáticamente la escala para que sean visibles tanto los datos como los límites.

### 5. Verificación
- Comparar una exportación de temperatura/humedad y otra de presión contra las gráficas del FOR-VAL-16-02.
- Abrir el archivo generado, recalcularlo y comprobar que no tenga errores de fórmula.
- Verificar que las gráficas sean editables y se puedan copiar a Word.
- Probar periodos semestrales y personalizados, incluyendo días de fin de semana con lecturas.

## Detalles técnicos
- Crear un módulo específico de tendencias para transformar semanas/turnos en promedios diarios y calcular media, σ, ±2σ y ±3σ.
- Generar las gráficas nativas mediante la estructura OOXML de Excel, porque la librería actual solo escribe datos y no crea gráficas editables.
- Reutilizar el periodo y los límites efectivos ya definidos en el reporte y catálogo; no se modifican capturas ni datos históricos.
- Mantener TRACEA en la interfaz y usar **DIAFRA, S.A. de C.V.** dentro del archivo exportado.

## Fuera de alcance en esta etapa
- Gráficas de partículas viables/UFC.
- Edición manual de límites de alerta o acción.
- Elaboración automática del documento Word completo FOR-VAL-16-02.
