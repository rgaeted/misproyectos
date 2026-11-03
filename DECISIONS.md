# Decisiones de implementación

- El proyecto de Vercel se aloja en el equipo personal `ricardogaetes-projects`, cuyo plan Hobby permite cron diario. Se configura `0 9 * * *` (09:00 UTC, dentro de la hora asignada por Vercel). Para recuperar la frecuencia de tres horas de la especificación se necesita un plan compatible o un programador externo autenticado. El refresco manual se conserva.

- Se respeta Next.js 15 y Vercel, como indica la especificación, en lugar de adaptar el servidor a Cloudflare/Sites. La entrega es código local; publicar requiere la base, credenciales y destino Vercel configurados.
- La especificación tiene 11 proyectos pero solo 5 en desarrollo o ejecución. El subtítulo calcula el valor real (5), en lugar del 6 ilustrativo del documento.
- `repo_snapshots` agrega un campo JSONB `etag_cache` para almacenar ETags y respuestas por endpoint y parámetros. No se guardan tokens.
- Se usan `postgres` como driver de Drizzle, `server-only` para impedir importar módulos privados al cliente, `@dnd-kit/sortable`/`utilities` para reordenar listas con teclado y touch, `tsx` para el seed y `@eslint/eslintrc` para ESLint 9 con Next 15. Son dependencias auxiliares necesarias para las herramientas del stack.
- Las mutaciones comparten una server action con una unión discriminada de Zod. Cada invocación comprueba sesión; las operaciones de varios registros usan transacciones. La conversión de una idea elimina y crea en la misma transacción. El reordenamiento rechaza listas desactualizadas o incompletas.
- Se prefiere archivar. El servidor rechaza eliminar un proyecto activo. El seed preserva contenido editado y solo crea listas/repos al insertar un proyecto por primera vez.
- La ficha utiliza rutas propias y el mismo tablero de fondo, sin rutas paralelas interceptadas. Cerrar conserva los filtros y Esc cierra el panel; el historial del navegador conserva los enlaces entre tablero y ficha.
- Los textos se guardan en blur, sin peticiones por cada tecla. Se muestra el resultado en cada campo y un error global; si falla se conserva el borrador para reintentar. El arrastre de etapas revierte el estado optimista si el servidor rechaza el cambio.
- No hay almacenamiento local alternativo ni bypass de autenticación. La base es la fuente de datos. Las verificaciones reales de OAuth, PostgreSQL, cron y GitHub necesitan servicios y credenciales externos.
- La política CSP permite estilos inline y scripts inline/eval compatibles con Next y desarrollo. Una política con nonces y eliminación de `unsafe-eval` en producción queda como endurecimiento posterior.
- No se implementan Jira, vista de tabla ni PWA, conforme al alcance v1. La cronología y los snapshots están separados del modelo de proyectos para permitir futuras integraciones.
