#!/usr/bin/env bash
# Crea un contenedor LXC con Debian 12 en Proxmox VE e instala PuSelfhost dentro.
#
# Ejecútalo como root en la consola del nodo Proxmox:
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/R3x10/polymer/main/deploy/proxmox/puselfhost-lxc.sh)"
#
# Todo se puede cambiar con variables de entorno, por ejemplo:
#   CT_ID=120 CT_IP=192.168.1.50/24 CT_GW=192.168.1.1 bash puselfhost-lxc.sh
#
#   CT_ID             Número del contenedor     (por defecto el siguiente libre)
#   CT_HOSTNAME       Nombre                    (puselfhost)
#   CT_CORES          Núcleos                   (2)
#   CT_RAM            Memoria en MB             (2048)
#   CT_SWAP           Swap en MB                (512)
#   CT_DISK           Disco en GB               (8)
#   CT_STORAGE        Almacenamiento del disco  (local-lvm si existe, si no local)
#   TEMPLATE_STORAGE  Almacenamiento de plantillas (local)
#   CT_BRIDGE         Puente de red             (vmbr0)
#   CT_VLAN           Etiqueta VLAN             (ninguna)
#   CT_IP             dhcp o IP/máscara         (dhcp)
#   CT_GW             Puerta de enlace          (solo con IP fija)
#   CT_PASSWORD       Contraseña de root del contenedor (ninguna; entra con: pct enter ID)
#   CT_SSH_KEY        Archivo de llave pública SSH para root (ninguno)
#   PU_REPO, PU_REF, HTTP_PORT, ADMIN_EMAIL, ADMIN_PASSWORD  se pasan al instalador
#
# Opciones: -y  no pedir confirmación.
set -Eeuo pipefail

msg() { printf '\e[1;34m==>\e[0m %s\n' "$*"; }
die() { printf '\e[1;31mError:\e[0m %s\n' "$*" >&2; exit 1; }
trap 'die "falló la línea $LINENO: $BASH_COMMAND"' ERR

ASSUME_YES=0
for arg in "$@"; do
  case $arg in
    -y | --yes) ASSUME_YES=1 ;;
    -h | --help) sed -n '2,/^set -E/p' "$0" | sed '$d; s/^# \{0,1\}//'; exit 0 ;;
    *) die "opción desconocida: $arg" ;;
  esac
done

[[ $EUID -eq 0 ]] || die "ejecuta este script como root en el nodo Proxmox"
for cmd in pct pveam pvesh pvesm; do
  command -v $cmd >/dev/null || die "no se encontró '$cmd'; este script se ejecuta en un nodo Proxmox VE"
done

PU_REPO=${PU_REPO:-https://github.com/R3x10/polymer.git}
PU_REF=${PU_REF:-main}
CT_ID=${CT_ID:-$(pvesh get /cluster/nextid)}
CT_HOSTNAME=${CT_HOSTNAME:-puselfhost}
CT_CORES=${CT_CORES:-2}
CT_RAM=${CT_RAM:-2048}
CT_SWAP=${CT_SWAP:-512}
CT_DISK=${CT_DISK:-8}
if [[ -z ${CT_STORAGE:-} ]]; then
  if pvesm status -content rootdir 2>/dev/null | awk 'NR > 1 {print $1}' | grep -qx local-lvm; then
    CT_STORAGE=local-lvm
  else
    CT_STORAGE=local
  fi
fi
TEMPLATE_STORAGE=${TEMPLATE_STORAGE:-local}
CT_BRIDGE=${CT_BRIDGE:-vmbr0}
CT_IP=${CT_IP:-dhcp}
CT_GW=${CT_GW:-}
CT_VLAN=${CT_VLAN:-}

[[ $CT_ID =~ ^[0-9]+$ ]] || die "CT_ID debe ser un número"
if compgen -G "/etc/pve/nodes/*/lxc/$CT_ID.conf" >/dev/null || compgen -G "/etc/pve/nodes/*/qemu-server/$CT_ID.conf" >/dev/null; then
  die "ya existe un contenedor o VM con el número $CT_ID"
fi
if [[ $CT_IP != dhcp && $CT_IP != */* ]]; then
  die "CT_IP debe ser 'dhcp' o una IP con máscara, por ejemplo 192.168.1.50/24"
fi
if [[ -n ${CT_SSH_KEY:-} && ! -r $CT_SSH_KEY ]]; then
  die "no se puede leer la llave SSH $CT_SSH_KEY"
fi

NET="name=eth0,bridge=$CT_BRIDGE,ip=$CT_IP"
[[ -n $CT_GW ]] && NET+=",gw=$CT_GW"
[[ -n $CT_VLAN ]] && NET+=",tag=$CT_VLAN"

cat <<EOF

  PuSelfhost en un contenedor LXC
  -------------------------------
  Contenedor : $CT_ID ($CT_HOSTNAME), Debian 12 sin privilegios
  Recursos   : $CT_CORES núcleos, $CT_RAM MB RAM, $CT_SWAP MB swap, $CT_DISK GB en $CT_STORAGE
  Red        : $NET
  Versión    : $PU_REPO ($PU_REF)

EOF
if [[ $ASSUME_YES -eq 0 ]]; then
  [[ -t 0 ]] || die "sin terminal para confirmar; usa -y"
  read -r -p "¿Crear el contenedor? [s/N] " answer
  [[ $answer =~ ^[sSyY]$ ]] || die "cancelado"
fi

msg "Buscando la plantilla de Debian 12"
pveam update >/dev/null || msg "no se pudo actualizar la lista de plantillas; uso la que haya"
TEMPLATE=$(pveam list "$TEMPLATE_STORAGE" | awk '{print $1}' | sed -n 's|.*vztmpl/\(debian-12-standard_.*_amd64\.tar\.zst\)$|\1|p' | sort -V | tail -n 1)
if [[ -z $TEMPLATE ]]; then
  TEMPLATE=$(pveam available --section system | awk '{print $2}' | grep -E '^debian-12-standard_.*_amd64\.tar\.zst$' | sort -V | tail -n 1)
  [[ -n $TEMPLATE ]] || die "no se encontró la plantilla debian-12-standard en pveam"
  msg "Descargando $TEMPLATE"
  pveam download "$TEMPLATE_STORAGE" "$TEMPLATE" >/dev/null
fi

msg "Creando el contenedor $CT_ID"
CREATE_OPTS=(
  --hostname "$CT_HOSTNAME"
  --cores "$CT_CORES"
  --memory "$CT_RAM"
  --swap "$CT_SWAP"
  --rootfs "$CT_STORAGE:$CT_DISK"
  --net0 "$NET"
  --ostype debian
  --unprivileged 1
  --features nesting=1
  --onboot 1
  --tags puselfhost
  --description "PuSelfhost: precios unitarios y presupuestos de obra"
)
[[ -n ${CT_PASSWORD:-} ]] && CREATE_OPTS+=(--password "$CT_PASSWORD")
[[ -n ${CT_SSH_KEY:-} ]] && CREATE_OPTS+=(--ssh-public-keys "$CT_SSH_KEY")
pct create "$CT_ID" "$TEMPLATE_STORAGE:vztmpl/$TEMPLATE" "${CREATE_OPTS[@]}" >/dev/null
pct start "$CT_ID"

msg "Esperando la red del contenedor"
for i in $(seq 1 60); do
  pct exec "$CT_ID" -- getent hosts deb.debian.org >/dev/null 2>&1 && break
  [[ $i -eq 60 ]] && die "el contenedor no tiene red; revisa CT_BRIDGE, CT_IP y CT_GW"
  sleep 2
done

# Usa el instalador que está junto a este script, o el del repositorio.
INSTALLER=$(mktemp)
trap 'rm -f "$INSTALLER"' EXIT
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd) || SCRIPT_DIR=""
if [[ -n $SCRIPT_DIR && -f $SCRIPT_DIR/install.sh && -f $SCRIPT_DIR/puselfhost-lxc.sh ]]; then
  cp "$SCRIPT_DIR/install.sh" "$INSTALLER"
else
  RAW=${PU_REPO%.git}
  RAW=${RAW/github.com/raw.githubusercontent.com}/$PU_REF/deploy/proxmox/install.sh
  curl -fsSL "$RAW" -o "$INSTALLER" || die "no se pudo descargar el instalador de $RAW"
fi
pct push "$CT_ID" "$INSTALLER" /root/puselfhost-install.sh --perms 0755

msg "Instalando PuSelfhost dentro del contenedor"
pct exec "$CT_ID" -- env \
  PU_REPO="$PU_REPO" PU_REF="$PU_REF" HTTP_PORT="${HTTP_PORT:-80}" \
  ADMIN_EMAIL="${ADMIN_EMAIL:-}" ADMIN_PASSWORD="${ADMIN_PASSWORD:-}" \
  bash /root/puselfhost-install.sh

IP=$(pct exec "$CT_ID" -- hostname -I | awk '{print $1}')
PORT_SUFFIX=""
[[ ${HTTP_PORT:-80} != 80 ]] && PORT_SUFFIX=":$HTTP_PORT"
cat <<EOF

  Listo. Abre http://${IP:-<ip-del-contenedor>}$PORT_SUFFIX
  Credenciales iniciales: pct exec $CT_ID -- cat /root/puselfhost-credenciales.txt
  Actualizar más adelante: pct exec $CT_ID -- puselfhost-actualizar

EOF
