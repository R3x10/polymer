# PuSelfhost

Software de precios unitarios y presupuestos de obra, autoalojado: con Docker o en un contenedor LXC de Proxmox VE.

## Levantar el sistema con Docker

Requisitos: Docker con Docker Compose.

```bash
cp .env.example .env   # cambia contraseñas y JWT_SECRET
docker compose up -d --build
```

Abre http://localhost:8080 y entra con `ADMIN_EMAIL` / `ADMIN_PASSWORD` del `.env`. El administrador se crea solo la primera vez que arranca el sistema, cuando todavía no hay usuarios.

## Probar en Windows sin Docker

Hay un instalador `.exe` para Windows 10/11 que trae todo (API, interfaz y PostgreSQL portátil) y abre el sistema en una ventana. Descárgalo de [Releases](https://github.com/R3x10/polymer/releases) (`windows-ultima`). Detalles en [deploy/windows](deploy/windows/README.md).

## Presupuestos

- Proyectos (obra o centro de costos) con varios presupuestos cada uno: tipo venta o costo, etapa inicial o planificado y estado borrador, autorizado o congelado (solo lectura). Un presupuesto se puede duplicar completo para pasar de venta a costo o de inicial a planificado.
- Captura desde cero: partidas, conceptos, análisis de precio unitario (matrices) e insumos, con recálculo inmediato al centavo.
- Cuantificación (generador) por concepto: renglones con descripción, eje o tramo, piezas, largo, ancho, alto y fórmula opcional (`P`, `L`, `A`, `H`); su suma es la cantidad del concepto.
- Importación del archivo de intercambio de Neodata (`Xn_Presupuesto.xlsx` o el `.zip` que lo contiene); al terminar se compara el costo directo con el de Neodata.
- Varios conceptos pueden usar la misma matriz con clave y descripción propias.
- Bitácora de cambios por usuario (solo administradores).

## Instalar en Proxmox VE (contenedor LXC)

Sin Docker: un script crea un contenedor LXC con Debian 12 e instala dentro Node, PostgreSQL y Caddy como servicios normales.

1. En la interfaz web de Proxmox, abre la **Shell** del nodo (entra como root).
2. Ejecuta:

   ```bash
   bash -c "$(curl -fsSL https://raw.githubusercontent.com/R3x10/polymer/main/deploy/proxmox/puselfhost-lxc.sh)"
   ```

3. Revisa el resumen (número de contenedor, recursos, red) y confirma con `s`.
4. Al terminar, el script muestra la dirección, por ejemplo `http://192.168.1.50`. La contraseña del administrador se ve con:

   ```bash
   pct exec <ID> -- cat /root/puselfhost-credenciales.txt
   ```

Por defecto usa el siguiente número de contenedor libre, 2 núcleos, 2 GB de RAM, 8 GB de disco en `local-lvm` y DHCP en `vmbr0`. Para cambiarlo, antepón variables al comando, por ejemplo una IP fija:

```bash
CT_IP=192.168.1.50/24 CT_GW=192.168.1.1 CT_RAM=4096 \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/R3x10/polymer/main/deploy/proxmox/puselfhost-lxc.sh)"
```

Para actualizar a la última versión (conserva la base de datos y las contraseñas):

```bash
pct exec <ID> -- puselfhost-actualizar
```

Los respaldos normales de Proxmox (vzdump o Proxmox Backup Server) cubren programa y datos. Todas las opciones y detalles están en [`deploy/proxmox/README.md`](deploy/proxmox/README.md).

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
| `packages/motor-pu` | Motor de cálculo de precios unitarios (sin base de datos), probado contra obras reales de Neodata y Opus. |
| `docker` | Imágenes de la API y de la web (Caddy sirve la interfaz y redirige `/api` a la API). |
| `deploy/windows` | App de escritorio para Windows (Electron + PostgreSQL portátil) y su instalador. |
| `deploy/proxmox` | Script para Proxmox VE y su instalador nativo para Debian. |

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
