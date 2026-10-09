# PuSelfhost

Software de precios unitarios y presupuestos de obra, autoalojado con Docker.

## Levantar el sistema

Requisitos: Docker con Docker Compose.

```bash
cp .env.example .env   # cambia contraseñas y JWT_SECRET
docker compose up -d --build
```

Abre http://localhost:8080 y entra con `ADMIN_EMAIL` / `ADMIN_PASSWORD` del `.env`. El administrador se crea solo la primera vez que arranca el sistema, cuando todavía no hay usuarios.

## Probar en Windows sin Docker

Hay un instalador `.exe` para Windows 10/11 que trae todo (API, interfaz y PostgreSQL portátil) y abre el sistema en una ventana. Descárgalo de [Releases](https://github.com/R3x10/polymer/releases) (`windows-ultima`). Detalles en [deploy/windows](deploy/windows/README.md).

## Roles

| Rol | Puede |
| --- | --- |
| Administrador | Todo, incluida la gestión de usuarios |
| Presupuestador | Crear y editar presupuestos |
| Solo consulta | Ver presupuestos |

## Estructura

| Carpeta | Contenido |
| --- | --- |
| `apps/api` | API en NestJS + Drizzle ORM sobre PostgreSQL. Las migraciones (`apps/api/drizzle`) se aplican solas al arrancar. |
| `apps/web` | Interfaz en React + Vite. |
| `docker` | Imágenes de la API y de la web (Caddy sirve la interfaz y redirige `/api` a la API). |
| `deploy/windows` | App de escritorio para Windows (Electron + PostgreSQL portátil) y su instalador. |

## Desarrollo

Requisitos: Node 22, pnpm 10 y un PostgreSQL local.

```bash
pnpm install
export DATABASE_URL=postgres://usuario:clave@localhost:5432/puselfhost JWT_SECRET=un-secreto-de-desarrollo-largo \
       ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=admin-12345
pnpm dev:api   # http://localhost:3000/api
pnpm dev:web   # http://localhost:5173 (redirige /api a la API)
```

Pruebas: `pnpm typecheck`, `pnpm test` y `pnpm test:e2e` (esta última usa `DATABASE_URL` y borra esa base, úsala solo con una base de pruebas).

Si cambias `apps/api/src/db/schema.ts`, genera la migración con `pnpm --filter @puselfhost/api db:generate`.
