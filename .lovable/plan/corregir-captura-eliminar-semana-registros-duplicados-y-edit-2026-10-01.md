# Corregir captura: eliminar semana, registros duplicados y editar fecha

## 1. La "X" para eliminar semana no aparece en la laptop
- La X solo se muestra a usuarios con rol **super admin**. Lo más probable es que en la laptop la sesión sea de otro usuario (admin o editor).
- Primer paso: confirmar con qué usuario entras en cada equipo.
- Mejora: si el usuario no puede eliminar, mostrar la X deshabilitada con el aviso "Solo el super admin puede eliminar semanas", para que no parezca un error.
- Si prefieres que **admin** también pueda eliminar semanas, lo habilito (se ajusta el permiso en la base de datos y en pantalla).

## 2. Se crea un segundo registro vacío del mismo instrumento
- Revisar en la base los registros duplicados (mismo instrumento, uno sin semanas) para confirmar de dónde salen.
- Evitar que vuelva a pasar: al elegir un instrumento que ya tiene registro, **se abre el registro existente** en lugar de crear otro (Presiones y Temperatura/Humedad).
- "Continuar con otra semana" siempre agrega la semana al **mismo** registro abierto.
- Limpiar los registros vacíos duplicados que ya existen (solo los que no tienen ninguna semana; no se toca nada con lecturas).

## 3. Editar la fecha de una semana
- Hoy solo existe en **Presiones** ("Semana seleccionada"). En **Temperatura/Humedad** no se agregó.
- Agregar el mismo control "Semana seleccionada" en Temperatura/Humedad: corrige el lunes sin perder lecturas y avisa si esa semana ya existe.
- En Presiones, hacer el control más visible (junto a la lista de semanas).

## Detalles técnicos
- `canDelete` en `PresionesModule.tsx` y `modulo.$slug.tsx`; política DELETE de `registro_semanas` es solo super_admin.
- `createRegistro` (ambos módulos) no valida existentes: buscar registro activo con mismo `instrumento_id` (+ `par_cuartos_id`/`area_id`) y hacer `setActiveId`.
- Portar `cambiarFechaSemana` a `modulo.$slug.tsx`.
- Borrado de registros vacíos duplicados vía migración de datos acotada a registros sin semanas.
