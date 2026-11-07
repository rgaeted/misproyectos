# Mis proyectos

Tableros personales privados con Next.js 15, TypeScript, Tailwind, Drizzle/PostgreSQL y Auth.js. Producción: https://misproyectos-five.vercel.app.

## Cuentas

- Registro con nombre, correo y contraseña en `/register`; inicio de sesión en `/login`.
- Acceso con GitHub, que crea la cuenta automáticamente la primera vez.
- Cada cuenta nueva empieza con un tablero vacío. Proyectos, listas, ideas, repositorios y caché pertenecen a su usuario.
- Los datos originales de `rgaeted` pertenecen a su identidad inmutable de GitHub, `289845187`. Para acceder a ellos se debe seguir usando **Continuar con GitHub**. Una cuenta de correo es independiente, aunque use el mismo email; no se vinculan cuentas por coincidencia de correo.

Las contraseñas usan scrypt con sal aleatoria y comparación constante, con un mínimo de 12 y máximo de 128 caracteres. El acceso y el registro tienen límites de intentos persistidos en PostgreSQL. Esta versión no incluye verificación del correo ni recuperación de contraseña por email.

## Próximos pasos

Cada proyecto admite varios próximos pasos. Se agregan y editan desde su ficha, con estados **Por trabajar**, **En espera** y **Completado**. Un paso en espera puede indicar qué falta, por ejemplo una aprobación o una respuesta. El texto se guarda al salir del campo; las flechas permiten cambiar el orden.

Las tarjetas muestran hasta dos pasos pendientes, su estado, el motivo de espera y los conteos. Los completados permanecen en la ficha, pero no se presentan como trabajo pendiente. La migración `0004_project_steps` conservó los 13 textos anteriores como primer paso de sus proyectos, sin modificar los 17 proyectos existentes.

Las pruebas de producción comprobaron crear, editar, ordenar, completar y eliminar pasos, conservarlos al recargar, limpiar el motivo al dejar de esperar y rechazar cuatro operaciones desde otra cuenta. Se revisó la ficha en móvil. Las cuentas temporales se eliminaron al terminar.

## Desarrollo

Requiere Node 24 y pnpm 10. En PowerShell utiliza `pnpm.cmd` o `npm.cmd exec --yes --package=pnpm@10.32.1 -- pnpm <comando>`.

1. Instala dependencias con `pnpm install --frozen-lockfile`.
2. Crea `.env.local` a partir de `.env.example` y configura sus valores. Conserva las credenciales existentes si el archivo ya existe.
3. Genera un `AUTH_SECRET` aleatorio y configura la OAuth App de GitHub.
4. Ejecuta `pnpm db:migrate`.
5. Opcionalmente ejecuta `pnpm db:seed`: solo carga los datos de la cuenta histórica de `rgaeted`, preservando los existentes. No carga datos en las cuentas nuevas.
6. Ejecuta `pnpm dev`.

Variables del servidor: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` y `CRON_SECRET`. El callback de producción es `https://misproyectos-five.vercel.app/api/auth/callback/github`. Para desarrollo conviene una OAuth App separada con `http://localhost:3000/api/auth/callback/github`.

`.env.local` usa el pool de sesión de Supabase (5432) para migraciones. Vercel usa el pool de transacciones (6543), TLS y la credencial dedicada. Las variables son secretos de Production y no se copian automáticamente a Preview. Los archivos privados y `.vercel/` están excluidos de Git y de las subidas a Vercel.

## Datos y aislamiento

`users` guarda las identidades de correo o GitHub. `projects`, `inbox` y `repo_snapshots` tienen propietario; las listas, los próximos pasos y los repositorios heredan la propiedad de su proyecto. Las acciones validan la sesión y la pertenencia de los recursos.

Las seis tablas de datos usan RLS forzado, incluso para su propietario de PostgreSQL. Cada operación usa una transacción con `set_config('app.user_id', ..., true)`, por lo que el contexto se elimina al terminar y no pasa a otra petición. Sin contexto no se pueden consultar los proyectos. Las tablas internas de autenticación tienen RLS activado sin políticas públicas y se usan únicamente desde el servidor.

La caché de 30 segundos incluye el identificador de usuario en su clave y etiqueta. Los cambios invalidan únicamente la etiqueta del propietario. `DATABASE_SCHEMA` permite apuntar un despliegue privado de pruebas a un esquema separado; en producción se deja sin definir para utilizar `public`.

La migración `0002_multiuser_accounts` asigna los datos existentes a `rgaeted` antes de exigir la propiedad. `0003_private_user_policies` activa el aislamiento. No vuelvas a una versión anterior de la aplicación después de migrar. Las sesiones anteriores al cambio multiusuario requieren iniciar sesión de nuevo.

## GitHub y cron

Cada cuenta de GitHub guarda su propio token OAuth cifrado con AES-256-GCM. No se envía al navegador ni se comparte entre usuarios. Las cuentas de correo pueden guardar enlaces a repositorios, pero no tienen una integración GitHub conectada. Los permisos del token determinan qué repositorios se pueden consultar. Cambiar `AUTH_SECRET` requiere volver a entrar con GitHub para renovar los tokens cifrados.

El cron `/api/cron/refresh-repos` exige `Authorization: Bearer <CRON_SECRET>`. Recorre los repositorios y credenciales por usuario e invalida su caché. Conserva ETags y detiene las peticiones cuando la cuota restante es baja. `vercel.json` lo programa diariamente a las 09:00 UTC, compatible con Hobby.

## Rendimiento y comprobaciones

Las funciones se ejecutan en São Paulo (`gru1`), junto a Supabase. El runtime utiliza `pg` con `attachDatabasePool` de Vercel para gestionar conexiones al suspender instancias. Archivo se sirve desde la propia app con `next/font`.

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Para Playwright instala Chromium y ejecuta `pnpm test:e2e` con `E2E_BASE_URL`. Los flujos autenticados requieren un `E2E_STORAGE_STATE` privado, fuera del repositorio. Las pruebas originales de edición crean y archivan proyectos.

El 4 de noviembre de 2026 pasaron 25 pruebas unitarias, TypeScript y la compilación de Vercel. En un esquema aislado se comprobó la migración con registros existentes, RLS forzado, consultas concurrentes de dos cuentas y 11 operaciones cruzadas rechazadas. En producción se probaron registro, contraseña incorrecta, login, logout y separación de tableros, incluyendo rechazo de URL y actualización de un proyecto ajeno; las dos cuentas temporales se eliminaron. Se conservaron los 17 proyectos, 48 ítems, 10 repositorios y una idea existentes, respetando las ediciones realizadas después del respaldo.

El respaldo previo y los informes de verificación están en `.vercel/`, excluidos de Git. Los cambios todavía no están guardados en un commit.
