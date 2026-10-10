# Instalación en Proxmox VE (contenedor LXC)

Alternativa a Docker: un script que se ejecuta en el nodo Proxmox, crea un contenedor LXC con Debian 12 y deja PuSelfhost funcionando dentro.

## Instalar

En la consola del nodo Proxmox (Shell del nodo en la interfaz web), como root:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/R3x10/polymer/main/deploy/proxmox/puselfhost-lxc.sh)"
```

Muestra un resumen, pide confirmación, y al final imprime la dirección (`http://<ip-del-contenedor>`) y dónde ver la contraseña del administrador.

Valores por defecto: siguiente número de contenedor libre, 2 núcleos, 2 GB de RAM, 512 MB de swap, 8 GB de disco en `local-lvm`, red `vmbr0` por DHCP, contenedor sin privilegios que arranca con el nodo. Se cambian con variables, por ejemplo IP fija:

```bash
CT_IP=192.168.1.50/24 CT_GW=192.168.1.1 bash -c "$(curl -fsSL https://raw.githubusercontent.com/R3x10/polymer/main/deploy/proxmox/puselfhost-lxc.sh)"
```

Todas las variables (`CT_ID`, `CT_HOSTNAME`, `CT_CORES`, `CT_RAM`, `CT_DISK`, `CT_STORAGE`, `CT_BRIDGE`, `CT_VLAN`, `CT_IP`, `CT_GW`, `CT_PASSWORD`, `CT_SSH_KEY`, `HTTP_PORT`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `PU_REF`) están descritas al inicio de [`puselfhost-lxc.sh`](puselfhost-lxc.sh). Con `-y` no pide confirmación.

## Qué queda instalado dentro del contenedor

Sin Docker: Node 22, PostgreSQL 16 y Caddy como servicios normales de Debian.

| Pieza | Dónde |
| --- | --- |
| API (servicio `puselfhost-api`) | `/opt/puselfhost/api`, escucha en `127.0.0.1:3000` |
| Interfaz web (servida por `caddy`) | `/opt/puselfhost/web`, puerto 80 |
| Configuración y secretos | `/etc/puselfhost/puselfhost.env` |
| Credenciales iniciales | `/root/puselfhost-credenciales.txt` |
| Base de datos | PostgreSQL local, base y usuario `puselfhost` |

## Actualizar

```bash
pct exec <ID> -- puselfhost-actualizar
```

Descarga la última versión, recompila y reinicia. No toca la base de datos ni los secretos; las migraciones se aplican solas al arrancar.

## Respaldos

El contenedor completo (programa y base de datos) se respalda con los respaldos normales de Proxmox (`vzdump` o Proxmox Backup Server).

## Instalar en un Debian existente

`install.sh` funciona en cualquier Debian 12 o 13 con systemd, dentro o fuera de Proxmox:

```bash
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/R3x10/polymer/main/deploy/proxmox/install.sh)"
```
