// Arranque y paro de PostgreSQL y de la API en la instalación de escritorio.
// No depende de Electron para poder probarse con Node en cualquier sistema.
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const USUARIO_DB = 'puselfhost';
const NOMBRE_DB = 'puselfhost';
const PUERTO_PG = 54329;
const PUERTO_API = 8329;

const exe = (nombre) => (process.platform === 'win32' ? `${nombre}.exe` : nombre);

function ejecutar(programa, args, opciones = {}) {
  // Con stdio ignorado, pg_ctl no deja a postgres colgado de nuestras tuberías.
  return new Promise((resolve, reject) => {
    const hijo = spawn(programa, args, { stdio: 'ignore', windowsHide: true, ...opciones });
    hijo.on('error', reject);
    hijo.on('exit', (codigo) => resolve(codigo ?? 1));
  });
}

function puertoLibre(preferido) {
  const probar = (puerto) =>
    new Promise((resolve) => {
      const srv = net.createServer();
      srv.once('error', () => resolve(null));
      srv.listen(puerto, '127.0.0.1', () => {
        const { port } = srv.address();
        srv.close(() => resolve(port));
      });
    });
  return probar(preferido).then((p) => p ?? probar(0));
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

class Servicios {
  /**
   * @param {object} o
   * @param {string} o.recursos carpeta con api/, web/ y postgres/
   * @param {string} o.datos carpeta del usuario donde viven la base y la configuración
   * @param {string} o.node ejecutable que corre la API (en Electron, el propio Electron)
   * @param {(msg: string) => void} [o.aviso] progreso para mostrar al usuario
   */
  constructor({ recursos, datos, node, aviso }) {
    this.recursos = recursos;
    this.datos = datos;
    this.node = node;
    this.aviso = aviso ?? (() => {});
    this.pgBin = path.join(recursos, 'postgres', 'bin');
    this.pgData = path.join(datos, 'base');
    this.registros = path.join(datos, 'registros');
    this.api = null;
  }

  config() {
    const archivo = path.join(this.datos, 'config.json');
    if (fs.existsSync(archivo)) return JSON.parse(fs.readFileSync(archivo, 'utf8'));
    const config = {
      claveDb: randomBytes(24).toString('hex'),
      jwtSecret: randomBytes(32).toString('hex'),
      puertoPg: PUERTO_PG,
      puertoApi: PUERTO_API,
    };
    fs.writeFileSync(archivo, JSON.stringify(config, null, 2));
    return config;
  }

  guardarConfig(config) {
    fs.writeFileSync(path.join(this.datos, 'config.json'), JSON.stringify(config, null, 2));
  }

  async iniciar() {
    fs.mkdirSync(this.registros, { recursive: true });
    const config = this.config();
    const puertoPg = await this.iniciarPostgres(config);
    const url = await this.iniciarApi(config, puertoPg);
    return { url, puertoPg };
  }

  async iniciarPostgres(config) {
    const pgCtl = path.join(this.pgBin, exe('pg_ctl'));
    if (!fs.existsSync(path.join(this.pgData, 'PG_VERSION'))) {
      this.aviso('Preparando la base de datos por primera vez…');
      const claveTmp = path.join(this.datos, 'clave.tmp');
      fs.writeFileSync(claveTmp, config.claveDb);
      const log = fs.openSync(path.join(this.registros, 'initdb.log'), 'w');
      const codigo = await ejecutar(path.join(this.pgBin, exe('initdb')), [
        '-D', this.pgData,
        '-U', USUARIO_DB,
        `--pwfile=${claveTmp}`,
        '-A', 'scram-sha-256',
        '-E', 'UTF8',
        '--no-locale',
      ], { stdio: ['ignore', log, log] }).finally(() => {
        fs.closeSync(log);
        fs.rmSync(claveTmp, { force: true });
      });
      if (codigo !== 0) throw new Error(`No se pudo crear la base de datos (initdb terminó con ${codigo}). Revisa ${this.registros}`);
    }

    // Si quedó corriendo de una sesión anterior (cierre forzado), se reutiliza.
    if ((await ejecutar(pgCtl, ['status', '-D', this.pgData])) === 0) {
      const pid = fs.readFileSync(path.join(this.pgData, 'postmaster.pid'), 'utf8').split(/\r?\n/);
      return Number(pid[3]);
    }

    this.aviso('Iniciando la base de datos…');
    const puerto = await puertoLibre(config.puertoPg);
    const codigo = await ejecutar(pgCtl, [
      'start', '-D', this.pgData, '-w', '-t', '120',
      '-l', path.join(this.registros, 'postgres.log'),
      // Fuera de Windows (pruebas locales) se desactiva el socket Unix para no depender de /var/run.
      '-o', `-p ${puerto} -c listen_addresses=127.0.0.1${process.platform === 'win32' ? '' : " -c unix_socket_directories=''"}`,
    ]);
    if (codigo !== 0) throw new Error(`No arrancó PostgreSQL (pg_ctl terminó con ${codigo}). Revisa ${path.join(this.registros, 'postgres.log')}`);
    if (puerto !== config.puertoPg) this.guardarConfig({ ...config, puertoPg: puerto });

    // La primera vez solo existe la base "postgres"; se crea la del sistema.
    await this.crearBaseSiFalta(config, puerto);
    return puerto;
  }

  async crearBaseSiFalta(config, puerto) {
    // pg viene con la API; se carga desde ahí para no duplicar dependencias.
    const { Client } = require(require.resolve('pg', { paths: [path.join(this.recursos, 'api')] }));
    const cliente = new Client({ host: '127.0.0.1', port: puerto, user: USUARIO_DB, password: config.claveDb, database: 'postgres' });
    await cliente.connect();
    try {
      const { rowCount } = await cliente.query('select 1 from pg_database where datname = $1', [NOMBRE_DB]);
      if (!rowCount) await cliente.query(`create database ${NOMBRE_DB}`);
    } finally {
      await cliente.end();
    }
  }

  async iniciarApi(config, puertoPg) {
    this.aviso('Iniciando el sistema…');
    const puerto = await puertoLibre(config.puertoApi);
    if (puerto !== config.puertoApi) this.guardarConfig({ ...this.config(), puertoApi: puerto });
    const log = fs.openSync(path.join(this.registros, 'api.log'), 'a');
    const dirApi = path.join(this.recursos, 'api');
    this.api = spawn(this.node, [path.join(dirApi, 'dist', 'main.js')], {
      cwd: dirApi,
      stdio: ['ignore', log, log],
      windowsHide: true,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: String(puerto),
        DATABASE_URL: `postgres://${USUARIO_DB}:${config.claveDb}@127.0.0.1:${puertoPg}/${NOMBRE_DB}`,
        JWT_SECRET: config.jwtSecret,
        JWT_EXPIRES_IN: '12h',
        ADMIN_EMAIL: 'admin@example.com',
        ADMIN_PASSWORD: 'cambia-esta-contrasena',
        ADMIN_NAME: 'Administrador',
        WEB_DIR: path.join(this.recursos, 'web'),
      },
    });
    let salida = null;
    this.api.on('exit', (codigo) => (salida = codigo ?? 1));

    const url = `http://127.0.0.1:${puerto}`;
    for (let i = 0; i < 240; i++) {
      if (salida !== null) break;
      try {
        if ((await fetch(`${url}/api/salud`)).ok) return url;
      } catch {
        // todavía no escucha
      }
      await esperar(500);
    }
    this.api.kill();
    throw new Error(`El sistema no respondió${salida !== null ? ` (terminó con ${salida})` : ''}. Revisa ${path.join(this.registros, 'api.log')}`);
  }

  async detener() {
    if (this.api && this.api.exitCode === null) {
      const fin = new Promise((r) => this.api.once('exit', r));
      this.api.kill();
      await Promise.race([fin, esperar(5000)]);
    }
    this.api = null;
    if (fs.existsSync(path.join(this.pgData, 'postmaster.pid'))) {
      await ejecutar(path.join(this.pgBin, exe('pg_ctl')), ['stop', '-D', this.pgData, '-m', 'fast', '-w', '-t', '60']);
    }
  }
}

module.exports = { Servicios };
