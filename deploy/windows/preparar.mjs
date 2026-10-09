// Compila la API y la web y las deja en recursos/ para empaquetarlas con Electron.
// PostgreSQL se copia aparte en recursos/postgres (lo descarga el workflow de Windows).
import { execSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, '..', '..');
const recursos = join(aqui, 'recursos');
const sh = (cmd) => execSync(cmd, { cwd: raiz, stdio: 'inherit' });

sh('pnpm --filter "@puselfhost/api..." build');
sh('pnpm --filter @puselfhost/web build');

const api = join(recursos, 'api');
rmSync(api, { recursive: true, force: true });
// node_modules plano (sin enlaces simbólicos) para que el instalador lo copie tal cual.
sh(`pnpm --filter @puselfhost/api --config.node-linker=hoisted deploy --prod --legacy "${api}"`);
for (const sobra of ['node_modules/.bin', 'src', 'test', 'jest.config.js', 'drizzle.config.ts', 'tsconfig.json', 'tsconfig.build.json']) {
  rmSync(join(api, sobra), { recursive: true, force: true });
}
for (const dir of ['dist', 'drizzle']) cpSync(join(raiz, 'apps', 'api', dir), join(api, dir), { recursive: true });

const web = join(recursos, 'web');
rmSync(web, { recursive: true, force: true });
cpSync(join(raiz, 'apps', 'web', 'dist'), web, { recursive: true });
