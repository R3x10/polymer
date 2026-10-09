import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { loadEnv } from '../src/config/env';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://pu:pu@localhost:5432/pu_test';

describe('Autenticación y roles (e2e)', () => {
  let app: INestApplication;
  let tokenAdmin: string;

  beforeAll(async () => {
    // Base limpia: el arranque aplica migraciones y crea el administrador inicial.
    const pool = new Pool({ connectionString: DATABASE_URL });
    await pool.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;');
    await pool.end();

    const env = loadEnv({
      DATABASE_URL,
      JWT_SECRET: 'secreto-de-pruebas-0123456789',
      ADMIN_EMAIL: 'admin@example.com',
      ADMIN_PASSWORD: 'admin-12345',
    });
    const mod = await Test.createTestingModule({ imports: [AppModule.forRoot(env)] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(() => app?.close());

  const api = () => request(app.getHttpServer());

  it('responde la salud sin sesión', () => api().get('/api/salud').expect(200, { ok: true }));

  it('rechaza rutas protegidas sin token', () => api().get('/api/auth/yo').expect(401));

  it('rechaza una contraseña incorrecta', () =>
    api().post('/api/auth/login').send({ email: 'admin@example.com', password: 'mala' }).expect(401));

  it('inicia sesión con el administrador inicial sin distinguir mayúsculas en el correo', async () => {
    const res = await api().post('/api/auth/login').send({ email: 'ADMIN@example.com', password: 'admin-12345' }).expect(200);
    expect(res.body.usuario).toMatchObject({ email: 'admin@example.com', rol: 'admin' });
    expect(res.body.usuario.passwordHash).toBeUndefined();
    tokenAdmin = res.body.token;

    const yo = await api().get('/api/auth/yo').set('Authorization', `Bearer ${tokenAdmin}`).expect(200);
    expect(yo.body.rol).toBe('admin');
  });

  it('valida los datos al crear usuarios', async () => {
    const res = await api()
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ email: 'no-es-correo', nombre: '', password: '123', rol: 'jefe' })
      .expect(400);
    expect(res.body.errores.map((e: { campo: string }) => e.campo).sort()).toEqual(['email', 'nombre', 'password', 'rol']);
  });

  it('aplica permisos por rol y desactivación inmediata', async () => {
    const auth = { Authorization: `Bearer ${tokenAdmin}` };
    const creado = await api()
      .post('/api/usuarios')
      .set(auth)
      .send({ email: 'ana@example.com', nombre: 'Ana', password: 'ana-12345', rol: 'presupuestador' })
      .expect(201);

    await api()
      .post('/api/usuarios')
      .set(auth)
      .send({ email: 'Ana@Example.com', nombre: 'Otra', password: 'ana-12345', rol: 'consulta' })
      .expect(409);

    const login = await api().post('/api/auth/login').send({ email: 'ana@example.com', password: 'ana-12345' }).expect(200);
    const tokenAna = login.body.token;

    await api().get('/api/auth/yo').set('Authorization', `Bearer ${tokenAna}`).expect(200);
    await api().get('/api/usuarios').set('Authorization', `Bearer ${tokenAna}`).expect(403);

    await api().patch(`/api/usuarios/${creado.body.id}`).set(auth).send({ activo: false }).expect(200);
    await api().get('/api/auth/yo').set('Authorization', `Bearer ${tokenAna}`).expect(401);
    await api().post('/api/auth/login').send({ email: 'ana@example.com', password: 'ana-12345' }).expect(401);
  });

  it('impide que el administrador se desactive a sí mismo', async () => {
    const yo = await api().get('/api/auth/yo').set('Authorization', `Bearer ${tokenAdmin}`);
    await api().patch(`/api/usuarios/${yo.body.id}`).set('Authorization', `Bearer ${tokenAdmin}`).send({ activo: false }).expect(403);
  });
});
