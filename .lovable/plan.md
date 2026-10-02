# Presiones: capturar todo por instrumento (quitar "Par de cuartos" como opción)

## Qué encontré
- Hoy hay 16 registros de presiones: 8 se crearon como "Par de cuartos" y 8 como "Instrumento".
- Los 8 de "Par de cuartos" **ya tienen su instrumento ligado**, así que no se pierde nada al verlos por instrumento.
- Un instrumento tiene 2 registros (uno como par de cuartos y otro como instrumento, 103 semanas en total): ese es justo el tipo de duplicado que confunde.

## Qué cambia para el usuario
1. En Presiones desaparece la pestaña "Par de cuartos". Quedan solo **"Instrumento (manómetro)"** y **"Filtro HEPA"**.
2. Lo que mide el instrumento se sigue mostrando como información: debajo del instrumento aparece "Mide: DCC-03 vs DCC-04" (y sus límites), tomado del catálogo de pares.
3. Al elegir un instrumento se abre su registro, sin importar si antes se capturó como par de cuartos. Ya no se pueden crear dos registros para el mismo instrumento.
4. Los 8 registros de par de cuartos se pasan a "por instrumento", con todas sus semanas, fotos y lecturas sin cambios.
5. El instrumento con 2 registros: te muestro las semanas de cada uno y tú decides si se juntan (las semanas que no chocan se unen; si una semana está en ambos, se queda la que tiene más lecturas) o si se dejan para que las revises. No borro nada sin tu confirmación.
6. En el reporte consolidado y en las gráficas, cada presión aparece por su instrumento, con "Cuarto X vs Cuarto Y" como dato de lo que mide.
7. En Configuración, el catálogo de pares de cuartos se queda como información de referencia ligada a cada instrumento (no como algo para capturar).

## Fuera de alcance
- No se cambian lecturas, límites ni lógica de cumplimiento/alertas.
- No se borra el catálogo de pares de cuartos.

## Detalles técnicos
- PresionesModule.tsx: quitar tipo "par_cuartos" del selector; createRegistro busca registro activo solo por instrumento_id; mostrar objetivo vinculado (objetivos_presion.instrumento_id) como etiqueta "Mide".
- ObjetivoPresionSelector: eliminar pestaña de pares.
- Datos: conservar par_cuartos_id en los 8 registros (solo informativo); la lectura del registro y la búsqueda de duplicados se basan en instrumento_id. Fusión del instrumento duplicado (e9b75c64…) solo tras confirmación.
- areaEfectiva / reporte: priorizar instrumento; "X vs Y" como subtítulo.
