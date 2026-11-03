# Mis proyectos

Tablero personal implementado con Next.js 15, TypeScript estricto, Tailwind 4, Drizzle/PostgreSQL y Auth.js con GitHub. La interfaz sigue los colores y la tipografía de `SPEC-mis-proyectos.md`.

## Requisitos y ejecución

Node 20.19 o superior, pnpm 10 y una base PostgreSQL. En Windows usa `pnpm.cmd` si PowerShell bloquea los scripts `.ps1`. Si pnpm no está instalado, puedes ejecutar `npm.cmd exec --yes --package=pnpm@10.32.1 -- pnpm <comando>`.

1. Ejecuta `pnpm install`.
2. Copia `.env.example` a `.env.local` y completa sus valores. No subas ese archivo al repositorio.
3. Crea una OAuth App de GitHub con callback `http://localhost:3000/api/auth/callback/github`. Para producción usa el dominio de Vercel en la URL del callback; conviene una OAuth App separada.
4. Genera `AUTH_SECRET` con `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Configura `ALLOWED_GITHUB_LOGIN=rgaeted`.
5. Ejecuta `pnpm db:migrate` y `pnpm db:seed`.
6. Ejecuta `pnpm dev` y abre http://localhost:3000. Inicia sesión con la cuenta permitida.

El seed carga los 11 proyectos y la idea de la especificación. Repetirlo no duplica ni borra los ítems existentes. Los datos de GitHub se consultan al presionar **Actualizar** en la ficha o mediante el cron; no se inventa actividad mientras falta el token. Sin configuración de autenticación y base de datos, la aplicación no ofrece un modo de acceso sin sesión.

## Comprobaciones

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Para e2e, inicia la app y ejecuta `pnpm exec playwright install chromium` y `pnpm test:e2e`. La prueba de acceso requiere la configuración OAuth/`AUTH_SECRET`. Los flujos con sesión requieren `E2E_STORAGE_STATE` apuntando a un archivo de sesión de Playwright de la cuenta autorizada y una base de pruebas migrada y con seed. Ese archivo contiene cookies privadas: guárdalo fuera del repositorio. `E2E_BASE_URL` permite cambiar la URL. Las pruebas crean y archivan proyectos de prueba.

## Vercel y GitHub

Importa este proyecto en Vercel, instala con pnpm y usa `pnpm build`. Configura todas las variables de `.env.example` en Vercel, ejecuta la migración y el seed contra la base de producción desde un entorno seguro, y configura el callback de GitHub con tu dominio. No hace falta publicar el proyecto para desarrollarlo localmente.

El token fine-grained de GitHub debe tener acceso explícito a los repositorios seleccionados y permisos de lectura de Metadata, Contents, Issues y Pull requests. El token permanece en el servidor. `CRON_SECRET` debe ser aleatorio y distinto de `AUTH_SECRET`. El endpoint `/api/cron/refresh-repos` exige `Authorization: Bearer <CRON_SECRET>`. El cron de `vercel.json` corre diariamente a partir de las 09:00 UTC, compatible con el plan Hobby de la cuenta. Para refrescar cada tres horas, cambia a `0 */3 * * *` en un plan que lo permita o usa un programador externo autenticado.

La caché guarda ETags por consulta, último commit, conteos y errores. El refresco se detiene al detectar menos de 50 peticiones restantes. Un error de un repo no interrumpe el resto. El indicador de inactividad usa el commit más reciente de los repos del proyecto y aparece después de 14 días, solo en desarrollo o ejecución.

## Navegación

Selecciona segmentos para filtrar; el filtro queda en `?etapa=...`. Abre una tarjeta para editar su ficha en `/p/id`. Arrastra por el asa de cada tarjeta o usa el teclado sobre ella (Espacio, flechas, Espacio); el selector de etapa de la ficha también permite mover proyectos. Las listas tienen asas independientes para reordenar. Los textos se guardan al salir del campo. La tecla `i` enfoca la captura de ideas. El tema manual se conserva en una cookie y la opción sistema sigue al dispositivo.

La eliminación definitiva se habilita solo en proyectos archivados y requiere confirmación. Revisa `DECISIONS.md` para las decisiones y límites de esta implementación.

## Verificación de esta entrega

El 3 de noviembre de 2026 pasaron ESLint, TypeScript, la compilación de producción y 17 pruebas unitarias. Se verificó por HTTP que `/` y `/p/farotrust` redirigen al login sin sesión, que el formulario de acceso responde 200 y que el cron devuelve 401 sin autorización. La migración fue generada, pero no aplicada a una base real. No se ejecutaron los e2e autenticados ni una revisión visual en navegador; faltan PostgreSQL y credenciales OAuth/GitHub. No se realizó un despliegue en Vercel.
