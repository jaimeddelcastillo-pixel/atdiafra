# Mostrar y ocultar contraseñas

## Objetivo
Permitir que la persona vea temporalmente la contraseña que está escribiendo y vuelva a ocultarla desde un icono de ojo.

## Cambios
- Crear un campo de contraseña reutilizable con botón de mostrar/ocultar, texto accesible y sin alterar el valor escrito.
- Usarlo al iniciar sesión, crear una cuenta, crear usuarios, definir o confirmar una contraseña, cambiar la contraseña propia y restablecerla desde un enlace.
- Mantener las reglas actuales de longitud, confirmación, permisos y seguridad; la contraseña permanecerá oculta inicialmente.
- Restablecer la vista a oculta al cerrar los cuadros correspondientes.

## Verificación
- Comprobar que cada icono alterna correctamente entre contraseña visible y oculta.
- Confirmar que creación, inicio de sesión y cambios de contraseña conservan sus validaciones actuales.
- Revisar que la aplicación compile sin errores y que los controles sean utilizables en pantalla pequeña.
