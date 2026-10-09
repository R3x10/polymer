# PuSelfhost para Windows

Instalador de un solo archivo (`PuSelfhost-Setup-<versión>.exe`) para probar el sistema en una PC con Windows 10 u 11 de 64 bits, sin Docker. Trae todo lo necesario: la API, la interfaz y un PostgreSQL 16 portátil.

## Instalar

1. Descarga el instalador de la página [Releases](https://github.com/R3x10/polymer/releases) (`windows-ultima` es la versión más reciente de `main`) o del artefacto `PuSelfhost-Windows` de una ejecución del workflow **Windows**.
2. Ábrelo. Como el instalador todavía no está firmado, Windows puede mostrar "Windows protegió su PC": elige **Más información → Ejecutar de todas formas**.
3. Se instala para tu usuario (no pide permisos de administrador) y crea un acceso directo en el escritorio y en el menú Inicio.

Al abrir **PuSelfhost** se inicia la base de datos y el sistema, y la interfaz aparece en una ventana. Usuario inicial: `admin@example.com`, contraseña `cambia-esta-contrasena`. Al cerrar la ventana se detiene todo.

## Dónde quedan los datos

En `%APPDATA%\PuSelfhost` (menú **Archivo → Abrir carpeta de datos**):

| Carpeta / archivo | Contenido |
| --- | --- |
| `base` | La base de datos PostgreSQL. Desinstalar no la borra. |
| `config.json` | Contraseña de la base, secreto de las sesiones y puertos, generados en la primera ejecución. |
| `registros` | Bitácoras de PostgreSQL y de la API, por si algo falla. |

El sistema escucha solo en `127.0.0.1`, así que no es accesible desde otras PCs de la red. Para uso compartido usa la instalación con Docker o Proxmox.

## Cómo se arma

- `preparar.mjs` compila la API y la web y las copia a `recursos/`.
- El workflow `.github/workflows/windows.yml` descarga PostgreSQL a `recursos/postgres`, arma el instalador con electron-builder (NSIS), lo instala en el runner de Windows y prueba arranque, interfaz e inicio de sesión dos veces (base nueva y base existente).
- `main.js` es el proceso de Electron; `servicios.js` arranca y detiene PostgreSQL (`initdb`/`pg_ctl`) y la API (con el Node que trae Electron). La API sirve también la interfaz gracias a `WEB_DIR`.

`servicios.js` no depende de Electron, así que puede probarse en Linux con Node y el PostgreSQL del sistema enlazando `recursos/postgres` a, por ejemplo, `/usr/lib/postgresql/16`.
