import { NextFunction, Request, Response } from 'express';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join, resolve } from 'node:path';

/** Sirve la interfaz compilada y devuelve index.html en las rutas del enrutador del navegador. */
export function servirWeb(app: NestExpressApplication, dir: string) {
  const raiz = resolve(dir);
  const indice = join(raiz, 'index.html');
  app.useStaticAssets(raiz, { index: false });
  app.use((req: Request, res: Response, next: NextFunction) => {
    const esApi = req.path === '/api' || req.path.startsWith('/api/');
    if (esApi || (req.method !== 'GET' && req.method !== 'HEAD')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indice);
  });
}
