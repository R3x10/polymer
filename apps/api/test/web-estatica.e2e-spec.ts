import 'reflect-metadata';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { servirWeb } from '../src/web-estatica';

@Controller('salud')
class SaludFalsa {
  @Get()
  salud() {
    return { ok: true };
  }
}

@Module({ controllers: [SaludFalsa] })
class ModuloPrueba {}

describe('Interfaz servida por la API (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'web-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<div id="root"></div>');
    writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)');
    app = await NestFactory.create<NestExpressApplication>(ModuloPrueba, { logger: false });
    app.setGlobalPrefix('api');
    servirWeb(app, dir);
    await app.init();
  });

  afterAll(() => app?.close());

  const http = () => request(app.getHttpServer());

  it('sirve index.html en la raíz y en rutas del navegador', async () => {
    await http().get('/').expect(200, '<div id="root"></div>');
    await http().get('/usuarios').expect(200, '<div id="root"></div>');
  });

  it('sirve los archivos compilados', () => http().get('/assets/app.js').expect(200, 'console.log(1)'));

  it('deja pasar las rutas de la API', async () => {
    await http().get('/api/salud').expect(200, { ok: true });
    await http().get('/api/no-existe').expect(404);
  });
});
