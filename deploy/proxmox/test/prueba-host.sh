#!/usr/bin/env bash
# Los cuerpos de las simulaciones se expanden al ejecutarlas, no aquí.
# shellcheck disable=SC2016
# Prueba puselfhost-lxc.sh sin Proxmox: sustituye pct, pveam, pvesh y pvesm por
# simulaciones que registran sus argumentos, y revisa lo que el script pidió.
# Uso (como root): bash deploy/proxmox/test/prueba-host.sh
set -Eeuo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
LOG=$WORK/llamadas.log
mkdir "$WORK/bin"

stub() { # nombre, cuerpo
  printf '#!/usr/bin/env bash\necho "$(basename "$0") $*" >>%q\n%s\n' "$LOG" "$2" >"$WORK/bin/$1"
  chmod +x "$WORK/bin/$1"
}
stub pvesh 'echo 105'
stub pvesm 'printf "Name Type Status\nlocal dir active\nlocal-lvm lvmthin active\n"'
stub pveam '
case $1 in
  list) echo "NAME SIZE" ;;
  available) printf "system debian-11-standard_11.7-1_amd64.tar.zst\nsystem debian-12-standard_12.2-1_amd64.tar.zst\nsystem debian-12-standard_12.7-1_amd64.tar.zst\n" ;;
esac'
stub pct '
case $1 in
  push) cp "$3" '"$WORK"'/instalador-enviado ;;
  exec) [[ $* == *"hostname -I"* ]] && echo "192.168.1.77 fd00::7" ;;
esac
exit 0'

fail() { echo "FALLA: $*" >&2; cat "$LOG" >&2; exit 1; }
expect() { grep -qF -- "$1" "$LOG" || fail "no se llamó: $1"; }

OUT=$(PATH="$WORK/bin:$PATH" CT_IP=192.168.1.77/24 CT_GW=192.168.1.1 CT_VLAN=20 HTTP_PORT=8080 \
  bash "$HERE/../puselfhost-lxc.sh" -y)

expect "pveam download local debian-12-standard_12.7-1_amd64.tar.zst"
expect "pct create 105 local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst --hostname puselfhost"
expect "--rootfs local-lvm:8"
expect "--net0 name=eth0,bridge=vmbr0,ip=192.168.1.77/24,gw=192.168.1.1,tag=20"
expect "--unprivileged 1 --features nesting=1 --onboot 1"
expect "pct start 105"
expect "pct push 105"
expect "HTTP_PORT=8080"
expect "bash /root/puselfhost-install.sh"
cmp -s "$WORK/instalador-enviado" "$HERE/../install.sh" || fail "no se envió install.sh al contenedor"
grep -qF "http://192.168.1.77:8080" <<<"$OUT" || fail "no mostró la dirección final: $OUT"

# Un número de contenedor inválido debe detenerse antes de crear nada.
: >"$LOG"
if PATH="$WORK/bin:$PATH" CT_ID=abc bash "$HERE/../puselfhost-lxc.sh" -y 2>/dev/null; then
  fail "aceptó CT_ID=abc"
fi
grep -q "pct create" "$LOG" && fail "creó un contenedor con CT_ID inválido"

echo "prueba-host: OK"
