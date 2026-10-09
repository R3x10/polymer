#!/usr/bin/env bash
# Instala o actualiza PuSelfhost de forma nativa (sin Docker) en Debian 12/13.
#
# Pensado para correr dentro del contenedor LXC que crea puselfhost-lxc.sh,
# pero sirve en cualquier Debian con systemd. Volver a ejecutarlo actualiza
# el sistema a la última versión de PU_REF sin tocar la base ni los secretos.
#
# Variables opcionales:
#   PU_REPO         Repositorio git        (por defecto https://github.com/R3x10/polymer.git)
#   PU_REF          Rama o etiqueta        (por defecto main)
#   HTTP_PORT       Puerto de la web       (por defecto 80)
#   ADMIN_EMAIL     Primer administrador   (por defecto admin@puselfhost.local)
#   ADMIN_PASSWORD  Su contraseña          (por defecto una aleatoria que se muestra al final)
set -Eeuo pipefail

APP=puselfhost
APP_DIR=/opt/$APP
CONF_DIR=/etc/$APP
ENV_FILE=$CONF_DIR/$APP.env
INSTALL_CONF=$CONF_DIR/instalacion.conf
CRED_FILE=/root/$APP-credenciales.txt
NODE_MAJOR=22
PG_MAJOR=16

msg() { printf '\e[1;34m==>\e[0m %s\n' "$*"; }
die() { printf '\e[1;31mError:\e[0m %s\n' "$*" >&2; exit 1; }
trap 'die "falló la línea $LINENO: $BASH_COMMAND"' ERR

[[ $EUID -eq 0 ]] || die "ejecuta este script como root"
[[ -r /etc/os-release ]] || die "no se encontró /etc/os-release"
# shellcheck disable=SC1091
. /etc/os-release
[[ ${ID:-} == debian ]] || die "este instalador es para Debian (detectado: ${ID:-desconocido})"
CODENAME=${VERSION_CODENAME:?no se pudo detectar la versión de Debian}

# Una instalación previa recuerda su repositorio, rama y puerto.
if [[ -r $INSTALL_CONF ]]; then
  # shellcheck disable=SC1090
  . "$INSTALL_CONF"
fi
PU_REPO=${PU_REPO:-https://github.com/R3x10/polymer.git}
PU_REF=${PU_REF:-main}
HTTP_PORT=${HTTP_PORT:-80}

export DEBIAN_FRONTEND=noninteractive
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

rand() { tr -dc 'A-Za-z0-9' </dev/urandom | head -c "$1" || true; }

add_apt_repo() { # nombre, url de la llave, línea deb
  local key=/etc/apt/keyrings/$1.gpg
  if [[ ! -s $key ]]; then
    curl -fsSL "$2" | gpg --dearmor -o "$key.tmp"
    mv "$key.tmp" "$key"
  fi
  echo "deb [signed-by=$key] $3" >"/etc/apt/sources.list.d/$1.list"
}

msg "Instalando paquetes del sistema"
apt-get update -qq
apt-get install -y -qq --no-install-recommends ca-certificates curl gnupg git >/dev/null
install -d -m 0755 /etc/apt/keyrings
add_apt_repo nodesource https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
  "https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main"
add_apt_repo pgdg https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  "https://apt.postgresql.org/pub/repos/apt $CODENAME-pgdg main"
add_apt_repo caddy https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
  "https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main"
apt-get update -qq
apt-get install -y -qq --no-install-recommends nodejs "postgresql-$PG_MAJOR" caddy >/dev/null
systemctl enable --now postgresql >/dev/null

msg "Preparando usuario y base de datos"
id -u $APP >/dev/null 2>&1 || useradd --system --home-dir $APP_DIR --shell /usr/sbin/nologin $APP
install -d -m 0755 $APP_DIR
install -d -m 0750 -g $APP $CONF_DIR

if [[ ! -s $ENV_FILE ]]; then
  DB_PASSWORD=$(rand 32)
  ADMIN_EMAIL=${ADMIN_EMAIL:-admin@$APP.local}
  ADMIN_PASSWORD=${ADMIN_PASSWORD:-$(rand 16)}
  umask 027
  cat >"$ENV_FILE" <<EOF
# Configuración de PuSelfhost. Tras cambiarla: systemctl restart $APP-api
NODE_ENV=production
PORT=3000
DATABASE_URL=postgres://$APP:$DB_PASSWORD@127.0.0.1:5432/$APP
JWT_SECRET=$(rand 64)
JWT_EXPIRES_IN=12h
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$ADMIN_PASSWORD
ADMIN_NAME=Administrador
EOF
  umask 022
  chgrp $APP "$ENV_FILE"
  chmod 0640 "$ENV_FILE"
  printf 'Usuario: %s\nContraseña: %s\n' "$ADMIN_EMAIL" "$ADMIN_PASSWORD" >"$CRED_FILE"
  chmod 0600 "$CRED_FILE"
fi
DB_PASSWORD=$(sed -n "s|^DATABASE_URL=postgres://$APP:\([^@]*\)@.*|\1|p" "$ENV_FILE")
[[ -n $DB_PASSWORD ]] || die "no se pudo leer la contraseña de la base en $ENV_FILE"

psql_admin() { runuser -u postgres -- psql -v ON_ERROR_STOP=1 -qtAX "$@"; }
if [[ -z $(psql_admin -c "SELECT 1 FROM pg_roles WHERE rolname = '$APP'") ]]; then
  psql_admin -c "CREATE ROLE $APP LOGIN PASSWORD '$DB_PASSWORD'"
fi
if [[ -z $(psql_admin -c "SELECT 1 FROM pg_database WHERE datname = '$APP'") ]]; then
  psql_admin -c "CREATE DATABASE $APP OWNER $APP"
fi

msg "Descargando $PU_REPO ($PU_REF)"
if [[ -d $APP_DIR/src/.git ]]; then
  git -C $APP_DIR/src remote set-url origin "$PU_REPO"
  git -C $APP_DIR/src fetch --quiet --depth 1 origin "$PU_REF"
  git -C $APP_DIR/src checkout --quiet --force FETCH_HEAD
  git -C $APP_DIR/src clean --quiet -fdx
else
  rm -rf $APP_DIR/src
  git clone --quiet --depth 1 --branch "$PU_REF" "$PU_REPO" $APP_DIR/src
fi
VERSION=$(git -C $APP_DIR/src rev-parse --short HEAD)

msg "Compilando la versión $VERSION (tarda unos minutos)"
corepack enable
cd $APP_DIR/src
pnpm install --frozen-lockfile --reporter=silent
pnpm --filter @$APP/api build
pnpm --filter @$APP/web exec vite build --logLevel warn
rm -rf $APP_DIR/api.new $APP_DIR/web.new
pnpm --filter @$APP/api deploy --prod --legacy --reporter=silent $APP_DIR/api.new
cp -r apps/api/dist apps/api/drizzle $APP_DIR/api.new/
cp -r apps/web/dist $APP_DIR/web.new
cd /

msg "Configurando servicios"
cat >/etc/systemd/system/$APP-api.service <<EOF
[Unit]
Description=PuSelfhost API
After=network-online.target postgresql.service
Wants=network-online.target
Requires=postgresql.service

[Service]
Type=simple
User=$APP
Group=$APP
EnvironmentFile=$ENV_FILE
WorkingDirectory=$APP_DIR/api
ExecStart=/usr/bin/node dist/main.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF

cat >/etc/caddy/Caddyfile <<EOF
# Generado por el instalador de PuSelfhost; se reescribe al actualizar.
:$HTTP_PORT {
	encode zstd gzip

	handle /api/* {
		reverse_proxy 127.0.0.1:3000
	}

	handle {
		root * $APP_DIR/web
		try_files {path} /index.html
		file_server
	}
}
EOF

systemctl stop $APP-api 2>/dev/null || true
rm -rf $APP_DIR/api $APP_DIR/web
mv $APP_DIR/api.new $APP_DIR/api
mv $APP_DIR/web.new $APP_DIR/web
systemctl daemon-reload
systemctl enable --now $APP-api >/dev/null
systemctl enable caddy >/dev/null
systemctl restart caddy

cat >"$INSTALL_CONF" <<EOF
PU_REPO=$PU_REPO
PU_REF=$PU_REF
HTTP_PORT=$HTTP_PORT
EOF
# Para actualizar después basta con: puselfhost-actualizar
if [[ -f $APP_DIR/src/deploy/proxmox/install.sh ]]; then
  install -m 0755 $APP_DIR/src/deploy/proxmox/install.sh /usr/local/sbin/$APP-actualizar
fi

msg "Esperando a que la API responda"
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$HTTP_PORT/api/salud" >/dev/null 2>&1; then
    msg "PuSelfhost $VERSION listo en el puerto $HTTP_PORT"
    [[ -r $CRED_FILE ]] && printf 'Credenciales iniciales (guardadas en %s):\n%s\n' "$CRED_FILE" "$(cat "$CRED_FILE")"
    exit 0
  fi
  sleep 2
done
journalctl -u $APP-api -n 50 --no-pager || true
die "la API no respondió; revisa: journalctl -u $APP-api"
