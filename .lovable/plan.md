# Simplificar fechas y guardado en Presiones

## Propuesta

1. **Conservar “Semana de la foto”** junto a Tomar foto/Subir archivo.
   - Define a qué semana se importarán las lecturas.
   - Mostrar claramente el lunes resultante.

2. **Convertir los otros dos fechadores en uno solo: “Semana seleccionada”.**
   - Permite elegir una semana existente desde la lista.
   - Permite corregir la fecha de la semana abierta sin perder sus lecturas.
   - Para captura manual, una acción “Nueva semana” pedirá primero la fecha y después creará la semana.

3. **Conservar y aclarar la continuidad posterior al guardado.**
   - Mantener la alerta “Continuar con otra semana” porque permite seguir con el mismo instrumento.
   - La alerta mostrará una fecha obligatoria y el lunes resultante antes de crear la semana.
   - “Continuar con otra semana” crea y abre esa semana; “Finalizar” cierra la alerta sin crear otra.

4. **Dejar un solo botón “Guardar”.**
   - Conservar el botón superior, junto a “Descartar”.
   - Eliminar el botón flotante “Guardar cambios”.
   - Mantener el aviso visible “Cambios sin guardar”.

## Flujo final

```text
Elegir fecha de la foto → Tomar/Subir → Revisar lecturas
→ Corregir “Semana seleccionada” si hace falta → Guardar
```

Para otra captura:

```text
Guardar → Continuar con otra semana → Confirmar fecha
→ Tomar/Subir la siguiente imagen
```

Para captura manual:

```text
Nueva semana → Elegir fecha → Capturar → Guardar
```

## Resultado esperado

- Dos fechas con funciones distintas y nombres explícitos, no tres.
- Una sola acción de guardado.
- Ninguna semana nueva se crea sin que el usuario elija su fecha.
- La continuidad conserva el mismo instrumento y abre explícitamente la semana elegida.
