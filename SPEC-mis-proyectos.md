# Mis proyectos — especificación para implementación

> Documento de entrada para un agente de código. Describe qué construir, con qué stack, el modelo de datos, la integración con GitHub, el diseño y los criterios de aceptación. Existe un prototipo funcional (HTML + almacenamiento de Claude) que valida la UX; esta especificación lo lleva a una aplicación propia, desplegable y conectada a GitHub.

## 1. Contexto

Ricardo es consultor e ingeniero de software en Puerto Varas, Chile, y desarrolla en paralelo proyectos de distinta naturaleza: clientes de consultoría, productos SaaS propios, un e-commerce y varias ideas en exploración. Hoy esa información vive dispersa (docs, repos, Jira, chats).

**Objetivo de la app:** un solo lugar para ver el estado de todos los proyectos de un vistazo, ordenar las ideas de cada uno y detectar qué proyecto está quieto, con datos vivos desde GitHub.

**Usuario:** uno solo (Ricardo). No es multi-tenant. Debe funcionar bien en escritorio y en el celular, para captura rápida de ideas.

**Idioma de la interfaz:** español de Chile, tuteo ("Agrega", "Mueve"); nunca voseo ("agregá", "tenés").

## 2. Stack

| Capa          | Elección                                           | Motivo                                                   |
| ------------- | -------------------------------------------------- | -------------------------------------------------------- |
| Framework     | Next.js 15 (App Router) + TypeScript estricto      | SSR, server actions y route handlers en un solo proyecto |
| Estilos       | Tailwind CSS v4 con tokens CSS propios (sección 7) | Rapidez sin perder identidad visual                      |
| Base de datos | PostgreSQL (Neon o Supabase)                       | Gratis para uso personal, JSONB para listas              |
| ORM           | Drizzle ORM + drizzle-kit para migraciones         | Tipado fuerte, SQL legible                               |
| Auth          | Auth.js (NextAuth v5) con proveedor GitHub         | Un solo login; se restringe a una cuenta                 |
| GitHub        | Octokit (`@octokit/rest`) con token del servidor   | Lectura de repos, incluidos privados                     |
| Validación    | Zod en todos los inputs de server actions          | Seguridad y mensajes claros                              |
| Drag & drop   | `@dnd-kit/core`                                    | Accesible y funciona en touch                            |
| Tests         | Vitest (unitarios) + Playwright (e2e)              |                                                          |
| Deploy        | Vercel                                             | Cron nativo para refrescar GitHub                        |

Gestor de paquetes: `pnpm`. Node 20 LTS o superior.

## 3. Variables de entorno

```
DATABASE_URL=postgres://...
AUTH_SECRET=...                  # openssl rand -base64 32
AUTH_GITHUB_ID=...
AUTH_GITHUB_SECRET=...
ALLOWED_GITHUB_LOGIN=rgaeted     # único usuario autorizado
GITHUB_TOKEN=...                 # fine-grained, solo lectura: Contents, Metadata, Issues, Pull requests
CRON_SECRET=...                  # protege el endpoint de refresco
```

Nunca exponer `GITHUB_TOKEN` al cliente. Todas las llamadas a GitHub ocurren en el servidor.

## 4. Modelo de datos

### 4.1 Etapas (enum)

Orden fijo y significativo, de izquierda a derecha en el tablero:

`idea` → `explorando` → `en_desarrollo` → `en_ejecucion` → `en_pausa`

Etiquetas visibles: "Idea", "Explorando", "En desarrollo", "En ejecución", "En pausa". Un proyecto puede no tener etapa (`null`) y se muestra en una columna "Sin etapa" que solo aparece si hay alguno.

### 4.2 Tablas

```ts
// projects
id            text  PK            // slug legible, ej. "ligalab"
name          text  not null
type          text                // libre: "Cliente (consultoría)", "Producto SaaS", ...
stage         stage_enum null
last_update   text                // "Lo último"
next_step     text                // "Próximo paso"
no_repo_note  text  null          // ej. "solo documentos (tablero en Jira)"
external_url  text  null          // ej. tablero Jira para proyectos sin repo
sort_order    int   default 99
archived      bool  default false
created_at    timestamptz default now()
updated_at    timestamptz default now()

// project_repos
id            uuid PK
project_id    text FK -> projects.id on delete cascade
owner         text not null       // "rgaeted"
name          text not null       // "liga-futbol"
unique(project_id, owner, name)

// project_items   (una tabla para las tres listas de la ficha)
id            uuid PK
project_id    text FK -> projects.id on delete cascade
kind          enum('status','idea','question')   // "Dónde está", "Ideas", "Preguntas abiertas"
text          text not null
done          bool default false   // solo aplica a 'question'
position      int  not null
created_at    timestamptz default now()

// inbox   (bandeja de ideas sueltas)
id            uuid PK
text          text not null
created_at    timestamptz default now()

// repo_snapshots   (caché de GitHub, sección 5)
owner, name   text  PK compuesta
default_branch     text
last_commit_at     timestamptz
last_commit_msg    text
open_issues        int
open_prs           int
commits_7d         int
is_private         bool
fetched_at         timestamptz
error              text null      // "not_found", "forbidden", etc.
```

`updated_at` se actualiza en cada cambio de proyecto, ítem o repo asociado.

## 5. Integración con GitHub

**Qué se muestra por repo:** fecha y mensaje del último commit, issues abiertos, PRs abiertos y commits de los últimos 7 días.

**Indicador de proyecto quieto:** un proyecto en etapa `en_desarrollo` o `en_ejecucion` cuyo commit más reciente (entre todos sus repos) tiene más de 14 días se marca como "Quieto hace N días". Los proyectos sin repo no reciben este indicador. El umbral es configurable mediante la constante `STALE_DAYS = 14`.

**Estrategia de caché:**

- La UI siempre lee desde `repo_snapshots`; nunca espera a GitHub para pintar.
- Un cron de Vercel (`/api/cron/refresh-repos`, cada 3 horas, protegido con `CRON_SECRET`) refresca todos los repos.
- Un botón "Actualizar" en la ficha refresca solo los repos de ese proyecto (server action).
- Respetar el rate limit: leer `x-ratelimit-remaining` y detenerse si queda menos de 50. Usar ETag (`If-None-Match`) para no gastar cuota cuando no hay cambios.
- Si un repo responde 404 o 403, guardar `error`, mostrar "Repo no accesible" en la ficha y no romper el resto.

**Endpoints de Octokit sugeridos:** `repos.get`, `repos.listCommits` (con `per_page=1` para el último y `since` para el conteo de 7 días), `search.issuesAndPullRequests` o `issues.listForRepo` filtrando PRs.

## 6. Funcionalidades

### 6.1 Tablero (página `/`)

- Encabezado con el título "Mis proyectos" y un subtítulo dinámico: "11 proyectos, 6 en movimiento", donde "en movimiento" significa en desarrollo o en ejecución.
- **Barra de etapas** bajo el encabezado: una barra horizontal segmentada donde el ancho de cada segmento es proporcional a la cantidad de proyectos en esa etapa, con número y etiqueta. Es el elemento visual protagonista. Tocar un segmento filtra el tablero a esa etapa; tocarlo de nuevo quita el filtro. Estado del filtro en la URL (`?etapa=en_desarrollo`).
- **Columnas kanban** por etapa, con contador. En móvil hacen scroll horizontal.
- **Tarjeta de proyecto:** nombre, tipo, próximo paso, y una línea de metadatos con preguntas abiertas, cantidad de ideas, repos y el indicador "Quieto hace N días" si aplica. El borde izquierdo lleva el color de la etapa.
- **Drag & drop** entre columnas para cambiar de etapa, con actualización optimista y reversión si falla. Debe funcionar con teclado (dnd-kit lo soporta).
- Botón "Nuevo proyecto": crea el proyecto en etapa Idea y abre su ficha.

### 6.2 Ficha de proyecto (panel lateral, ruta `/p/[id]`)

Se abre como panel deslizante desde la derecha en escritorio y a pantalla completa en móvil. La ruta propia permite compartir el link y usar el botón atrás.

- Nombre editable en grande.
- Tipo (texto libre con sugerencias de los tipos ya usados) y etapa (select).
- **Repositorios:** lista con el link y los datos de GitHub (sección 5). Se agrega pegando una URL `https://github.com/owner/name`; validar el formato y normalizar. Si no hay repos, permitir una nota "Sin repo" y un link externo, por ejemplo a Jira.
- "Lo último" y "Próximo paso": textareas que se guardan al salir del campo (blur) con debounce, mostrando "Guardado" de forma discreta.
- Tres listas: **Dónde está**, **Ideas** y **Preguntas abiertas**. Esta última tiene checkbox; al marcarla queda tachada. Cada lista permite agregar, editar inline, reordenar arrastrando y quitar.
- "Eliminar proyecto", con confirmación. Mejor aún: "Archivar" como acción principal, y eliminar solo desde la vista de archivados.
- Cerrar con Esc, con el botón Cerrar o tocando fuera del panel.

### 6.3 Bandeja de ideas

- Bajo el tablero, una sección "Bandeja de ideas" con un input de captura rápida: Enter guarda.
- Cada idea tiene dos acciones: "Convertir en proyecto", que crea el proyecto en etapa Idea, borra la idea y abre la ficha, y "Borrar".
- Atajo global: la tecla `i` enfoca el input de captura cuando no se está escribiendo en otro campo.

### 6.4 Fuera de alcance en v1 (dejar preparado)

- Integración con Jira (Atlassian) para proyectos de cliente: mostrar el avance de épicas del proyecto `KAN`.
- Vista de lista o tabla además del tablero.
- PWA instalable para captura desde el celular.

## 7. Diseño

Respetar la identidad del prototipo; no usar un kit genérico de tarjetas SaaS.

**Tipografía:** Archivo (Google Fonts, eje variable `wdth`). Títulos en ancho condensado (`wdth` 62–75) y peso 800; cuerpo en `wdth` 100 y peso 400. Tamaño base de 15 px y `line-height` de 1.5.

**Tokens de color (claro / oscuro):**

| Token            | Claro     | Oscuro    | Uso                     |
| ---------------- | --------- | --------- | ----------------------- |
| `--bg`           | `#E9EDF0` | `#10181F` | Fondo de página         |
| `--surface`      | `#F7F9FA` | `#17222B` | Columnas y paneles      |
| `--raised`       | `#FFFFFF` | `#1E2B36` | Tarjetas e inputs       |
| `--ink`          | `#16232E` | `#E4EBF0` | Texto                   |
| `--muted`        | `#5A6B78` | `#94A5B2` | Texto secundario        |
| `--line`         | `#C9D2D9` | `#2C3C49` | Bordes                  |
| `--lago`         | `#0E6E67` | `#4FC1B5` | Acento: acciones y foco |
| `--s-idea`       | `#9AA7B1` | `#6B7A86` | Etapa Idea              |
| `--s-explorando` | `#6C8EA8` | `#7FA2BD` | Etapa Explorando        |
| `--s-desarrollo` | `#2F6FA3` | `#5B9BD0` | Etapa En desarrollo     |
| `--s-ejecucion`  | `#0E6E67` | `#4FC1B5` | Etapa En ejecución      |
| `--s-pausa`      | `#B0894A` | `#D3AE6E` | Etapa En pausa          |

El modo oscuro sigue `prefers-color-scheme` y ofrece además un toggle manual que se guarda en una cookie.

**Reglas:** radios distintos por jerarquía (barra 6 px, columnas 10 px, tarjetas 6 px), sin gradientes ni sombras genéricas, sin etiquetas en mayúsculas sostenidas. Foco visible en todo elemento interactivo. Respetar `prefers-reduced-motion`. Contraste AA como mínimo.

**Textos de UI:** voz activa y concreta ("Agregar repo", "Convertir en proyecto"). Los estados vacíos invitan a actuar ("Arrastra un proyecto aquí", "Bandeja vacía. Anota la primera idea arriba"). Los errores dicen qué pasó y qué hacer ("Pega un link que empiece con https://github.com/").

## 8. Estructura sugerida

```
app/
  layout.tsx
  page.tsx                    # tablero + bandeja
  p/[id]/page.tsx             # ficha (también como modal con intercepting routes)
  api/cron/refresh-repos/route.ts
  api/auth/[...nextauth]/route.ts
lib/
  db/schema.ts                # Drizzle
  db/index.ts
  github.ts                   # cliente Octokit + refresco con ETag
  stages.ts                   # enum, etiquetas, colores, STALE_DAYS
  actions/projects.ts         # server actions con Zod
  actions/inbox.ts
components/
  StageBar.tsx  Board.tsx  ProjectCard.tsx  ProjectPanel.tsx
  EditableList.tsx  RepoList.tsx  Inbox.tsx
drizzle/                      # migraciones
scripts/seed.ts               # carga la sección 10
middleware.ts                 # exige sesión salvo /api/cron y /api/auth
```

## 9. Seguridad

- El middleware exige sesión en todas las rutas excepto `/api/auth/*` y `/api/cron/*`.
- En el callback `signIn` de Auth.js, rechazar a cualquier usuario cuyo login de GitHub no sea `ALLOWED_GITHUB_LOGIN`.
- El endpoint de cron valida `Authorization: Bearer ${CRON_SECRET}`.
- Validar todos los inputs con Zod y limitar longitudes (nombre ≤ 120, textos ≤ 2000).
- Usar las cabeceras de seguridad de Next (`X-Frame-Options`, `Referrer-Policy`) y una CSP básica.
- No registrar en logs ni el token de GitHub ni el contenido de los proyectos.

## 10. Datos iniciales (seed)

Cargar con `pnpm db:seed`. El script debe ser idempotente (upsert por `id`).

```json
{
  "projects": [
    {
      "id": "transmarko",
      "name": "Transmarko / Skorpios",
      "type": "Cliente (consultoría)",
      "stage": "en_ejecucion",
      "sort_order": 1,
      "last_update": "Fase 2: RAT y aviso de privacidad laboral; arranca frente SGSI",
      "next_step": "Cerrar fase 3 (20-nov): políticas, contratos, EIPD, capacitación",
      "no_repo_note": "Solo documentos (tablero en Jira, proyecto KAN)",
      "repos": [],
      "status": [
        "Programa 21.663 + 21.719 por UF 310 + IVA en 4 cuotas (1 pagada, 3 por cobrar)",
        "Alcance: 12 sociedades del grupo, 8 en alcance; RAT preliminar con 25 actividades",
        "Frente nuevo: SGSI con Declaración de Aplicabilidad por entidad, sea o no OIV",
        "Textos de privacidad para el flujo de reserva de Skorpios y canal de agencias",
        "Legal interno del grupo cierra los contratos; Cumbre Sur entrega borradores técnicos"
      ],
      "questions": [
        "¿Las naves de cabotaje tienen Documento de Cumplimiento IGS (circular O-75/006)?",
        "¿El SGSI entra en las UF 310 o es una extensión con precio propio?",
        "¿Qué hito gatilla cada una de las 3 cuotas pendientes?"
      ]
    },
    {
      "id": "cumbre-sur",
      "name": "Cumbre Sur Tech",
      "type": "Empresa",
      "stage": "en_ejecucion",
      "sort_order": 2,
      "last_update": "Sitio, catálogo de servicios y mapa de prospectos listos",
      "next_step": "Mover pipeline comercial en Los Lagos",
      "repos": ["rgaeted/cumbresur"],
      "status": [
        "Sitio cumbresurconsultores.cl con 3 niveles: Diagnóstico Express (UF 40), Implementación (UF 200), DPO como Servicio (UF 15/mes)",
        "Catálogo de 5 productos con 9 cláusulas críticas de contrato",
        "Mapa de prospectos Tier 1: proveedores acuícolas/marítimos y clínicas privadas",
        "Canal comercial con partner que vende mientras Ricardo ejecuta"
      ],
      "questions": [
        "¿Cómo usar Transmarko como caso de referencia para el Tier 1 marítimo?",
        "¿El kit autoservicio 21.719 vive bajo Cumbre Sur o bajo FaroTrust?"
      ]
    },
    {
      "id": "farotrust",
      "name": "FaroTrust",
      "type": "Producto SaaS",
      "stage": "en_desarrollo",
      "sort_order": 3,
      "last_update": "Módulo SGSI con importador de inventario",
      "next_step": "Definir MVP: dashboard + RAT + task manager",
      "repos": ["rgaeted/farotrust"],
      "status": [
        "Módulo SGSI (/sgsi) con wizard de 4 pasos que importa activos desde Excel/CSV",
        "3 plantillas de inventario: sistemas, repositorios, proveedores",
        "Preferencia por descubrimiento automático de activos (M365 + on-premise)"
      ],
      "questions": [
        "¿Queda FaroTrust como nombre final?",
        "¿Qué entregables de Transmarko se convierten en plantillas del producto?",
        "¿Primer cliente piloto: Transmarko u otro?"
      ]
    },
    {
      "id": "ligalab",
      "name": "LigaLab",
      "type": "Producto (app)",
      "stage": "en_desarrollo",
      "sort_order": 4,
      "last_update": "Formato probado 5 semanas en la pichanga de los lunes",
      "next_step": "Conversar con el dueño de la liga de 4 categorías",
      "repos": ["rgaeted/mipartido", "rgaeted/liga-futbol"],
      "status": [
        "Caso base: grupo de WhatsApp de ~50 personas, 22 cupos, inscripción los viernes",
        "Árbitro registra eventos en línea + medalla al MVP de cada equipo",
        "Foco técnico: lista de espera, cupos seguros ante concurrencia, enlaces seguros",
        "Liga interesada: 4 categorías adultas × 8 equipos"
      ],
      "questions": [
        "¿Modelo con la liga externa: socio, cliente pagado o piloto gratis?"
      ]
    },
    {
      "id": "regatas",
      "name": "App de regatas",
      "type": "Producto (app)",
      "stage": null,
      "sort_order": 5,
      "last_update": "",
      "next_step": "",
      "repos": [],
      "status": [],
      "questions": [
        "¿Para quién es (club, organizadores, regatistas) y qué problema resuelve?"
      ]
    },
    {
      "id": "gsc-central",
      "name": "Sistema central GSC Chile",
      "type": "Cliente (software)",
      "stage": "explorando",
      "sort_order": 6,
      "last_update": "Revisión funcional/UX del ERP de gestión",
      "next_step": "Definir alcance de la consolidación",
      "repos": ["rgaeted/gsc-central"],
      "status": [
        "ERP en PHP (gestion.gscchile.cl): cursos, inventario, RR.HH. y configuración",
        "App en Google Apps para el registro del prevencionista de riesgos",
        "App contadora de aforo por evento",
        "Dos ejes posibles: persona/trabajador y operación/eventos"
      ],
      "questions": [
        "¿Se reescribe todo o se integra por etapas sobre el ERP PHP?",
        "¿Proyecto cerrado o producto reutilizable para otras empresas de seguridad?"
      ]
    },
    {
      "id": "volterra",
      "name": "Volterra",
      "type": "E-commerce propio",
      "stage": "en_ejecucion",
      "sort_order": 7,
      "last_update": "Rediseño home + calculadora kW, bundles residencial/rural",
      "next_step": "Vender al Estado vía Mercado Público",
      "repos": ["rgaeted/volterra"],
      "status": [
        "Equipos de fuerza: generadores, motobombas, herramientas",
        "Calculadora interactiva de carga en kW",
        "Comisión de 10% sobre neto por venta de generador referida"
      ],
      "questions": [
        "¿Qué se necesita para inscribirse como proveedor en Mercado Público?",
        "¿Qué pasarela de pago queda: Webpay, Flow, Mercado Pago o Khipu?"
      ]
    },
    {
      "id": "tenis",
      "name": "App de tenis Puerto Varas",
      "type": "Producto (app)",
      "stage": "explorando",
      "sort_order": 8,
      "last_update": "Diagnóstico: pocas canchas, acaparamiento, cancelaciones",
      "next_step": "Hablar con el dueño de cancha que usa EasyCancha",
      "repos": ["rgaeted/tennis-torneo"],
      "status": [
        "5 canchas en total: 2 de club privado y 3 siempre ocupadas",
        "Dolores: no saber con quién jugar, horas canceladas, acaparamiento de slots"
      ],
      "questions": [
        "¿Se integra con EasyCancha o compite con él?",
        "¿Comparte motor con LigaLab (cupos, lista de espera, enlaces)?"
      ]
    },
    {
      "id": "kit-21719",
      "name": "Kit autoservicio Ley 21.719",
      "type": "Producto (Cumbre Sur)",
      "stage": "idea",
      "sort_order": 9,
      "last_update": "Decidido: cuestionario que genera kit de documentos",
      "next_step": "Diseñar el cuestionario y el canal contadores/gremios",
      "repos": [],
      "status": ["Para micro-empresas; distribución vía contadores y gremios"],
      "questions": []
    },
    {
      "id": "timbre-api",
      "name": "API de facturación (DTE)",
      "type": "Producto (API)",
      "stage": "idea",
      "sort_order": 10,
      "last_update": "Nombres candidatos: Timbre, Folio",
      "next_step": "Validar si vale la pena",
      "repos": ["rgaeted/timbre-api"],
      "status": [],
      "questions": []
    },
    {
      "id": "chatbot",
      "name": "Chatbot WhatsApp con IA",
      "type": "Herramienta interna",
      "stage": "explorando",
      "sort_order": 11,
      "last_update": "Arquitectura con 360dialog + API de Anthropic",
      "next_step": "Elegir el primer caso: Volterra o Cumbre Sur",
      "repos": [],
      "status": [],
      "questions": []
    }
  ],
  "inbox": ["App de fletes de retorno (corredor Santiago–Puerto Montt)"]
}
```

## 11. Plan de trabajo sugerido

Cada fase termina con un commit funcional y desplegado.

1. **Base:** scaffold de Next.js con TypeScript, Tailwind, Drizzle, esquema, migración y seed. Tablero de solo lectura con la barra de etapas y las columnas.
2. **Edición:** ficha de proyecto con todas las listas, server actions con Zod, actualizaciones optimistas y drag & drop entre etapas.
3. **Bandeja:** captura rápida, conversión a proyecto y atajo de teclado.
4. **Auth:** Auth.js con GitHub, restricción a `ALLOWED_GITHUB_LOGIN` y middleware.
5. **GitHub:** cliente Octokit, tabla de caché, cron, botón "Actualizar" e indicador de proyecto quieto.
6. **Pulido:** modo oscuro con toggle, accesibilidad (teclado y lectores de pantalla), tests e2e de los flujos principales y deploy en Vercel.

## 12. Criterios de aceptación

- [ ] Tras el seed, el tablero muestra los 11 proyectos en sus columnas y la barra de etapas suma 11.
- [ ] Arrastrar una tarjeta a otra columna cambia su etapa, persiste al recargar y actualiza la barra.
- [ ] Tocar un segmento de la barra filtra el tablero y la URL refleja el filtro.
- [ ] En la ficha se pueden agregar, editar, reordenar y quitar ítems de las tres listas, y marcar preguntas como resueltas.
- [ ] Agregar una URL de GitHub válida muestra los datos del repo después de "Actualizar"; una URL inválida muestra un error claro.
- [ ] Un proyecto en desarrollo sin commits en 14 días muestra "Quieto hace N días".
- [ ] Una idea de la bandeja se convierte en proyecto en etapa Idea y desaparece de la bandeja.
- [ ] Un usuario de GitHub distinto de `rgaeted` no puede entrar.
- [ ] Todo es usable en un viewport de 375 px y con teclado, en modo claro y oscuro.
- [ ] `pnpm lint`, `pnpm typecheck` y `pnpm test` pasan sin errores.

## 13. Convenciones para el agente

- TypeScript estricto, sin `any`. Componentes de servidor por defecto; `"use client"` solo donde haya interacción.
- Toda la UI en español de Chile con tuteo. El código y los nombres de variables, en inglés.
- No agregar dependencias fuera de la sección 2 sin justificarlo en el PR.
- Commits pequeños con mensajes en formato Conventional Commits.
- Si algo de esta especificación es ambiguo, elegir la opción más simple, dejarla anotada en `DECISIONS.md` y seguir avanzando.
