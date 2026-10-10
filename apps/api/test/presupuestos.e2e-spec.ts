import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { loadEnv } from '../src/config/env';
import { neodataDePrueba } from './xlsx-de-prueba';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://pu:pu@localhost:5432/pu_test';

describe('Presupuestos (e2e)', () => {
  let app: INestApplication;
  let admin: { Authorization: string };
  let consulta: { Authorization: string };

  beforeAll(async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    await pool.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;');
    await pool.end();
    const env = loadEnv({ DATABASE_URL, JWT_SECRET: 'secreto-de-pruebas-0123456789', ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD: 'admin-12345' });
    const mod = await Test.createTestingModule({ imports: [AppModule.forRoot(env)] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    const login = async (email: string, password: string) =>
      ({ Authorization: `Bearer ${(await api().post('/api/auth/login').send({ email, password }).expect(200)).body.token}` });
    admin = await login('admin@example.com', 'admin-12345');
    await api().post('/api/usuarios').set(admin).send({ email: 'ver@example.com', nombre: 'Ver', password: 'ver-12345', rol: 'consulta' }).expect(201);
    consulta = await login('ver@example.com', 'ver-12345');
  });

  afterAll(() => app?.close());

  const api = () => request(app.getHttpServer());

  it('captura un presupuesto desde cero y lo calcula al centavo', async () => {
    const p = (await api().post('/api/presupuestos').set(admin).send({ nombre: 'Venta', proyecto: 'Casa' }).expect(201)).body;
    const base = `/api/presupuestos/${p.id}`;

    for (const ins of [
      { clave: 'CEM', descripcion: 'Cemento', unidad: 'kg', tipo: 'material', costo: '3.333' },
      { clave: 'ARENA', descripcion: 'Arena', unidad: 'm3', tipo: 'material', costo: '450' },
      { clave: 'PEON', descripcion: 'Peón', unidad: 'jor', tipo: 'mano_obra', salarioBase: '400', fsr: '1.8125' },
      { clave: 'HM', descripcion: 'Herramienta menor', unidad: '%mo', tipo: 'herramienta', porcentajeManoObra: true },
    ]) {
      await api().post(`${base}/insumos`).set(admin).send(ins).expect(201);
    }
    await api().post(`${base}/insumos`).set(admin).send({ clave: 'CEM', tipo: 'material' }).expect(409);

    const mort = (await api().post(`${base}/matrices`).set(admin).send({ clave: 'MORT', descripcion: 'Mortero', unidad: 'm3', tipo: 'auxiliar' }).expect(201)).body;
    await api()
      .put(`${base}/matrices/${mort.id}/renglones`)
      .set(admin)
      .send({ renglones: [{ componente: 'CEM', cantidad: '250' }, { componente: 'ARENA', cantidad: '1.1' }] })
      .expect(200);

    const partida = (await api().post(`${base}/renglones`).set(admin).send({ tipo: 'partida', clave: '01', descripcion: 'Muros' }).expect(201)).body;
    const concepto = (
      await api()
        .post(`${base}/renglones`)
        .set(admin)
        .send({ tipo: 'concepto', padreId: partida.id, cantidad: '120.5', nueva: { clave: 'MURO', descripcion: 'Muro de block', unidad: 'm2' } })
        .expect(201)
    ).body;

    const muro = (await api().get(`${base}/matrices`).set(admin).expect(200)).body.find((m: { clave: string }) => m.clave === 'MURO');
    const apu = (
      await api()
        .put(`${base}/matrices/${muro.id}/renglones`)
        .set(admin)
        .send({ renglones: [{ componente: 'MORT', cantidad: '0.012' }, { componente: 'PEON', cantidad: '0.1' }, { componente: 'HM', cantidad: '0.03' }] })
        .expect(200)
    ).body;
    // MORT = 833.25 + 495 = 1328.25; 0.012 × 1328.25 = 15.94; PEON = 400 × 1.8125 = 725 → 72.50; HM 3 % de 72.50 = 2.18
    expect(apu.renglones.map((r: { importe: object }) => r.importe)).toEqual([{ MXN: '15.94' }, { MXN: '72.50' }, { MXN: '2.18' }]);
    expect(apu.costoDirecto).toEqual({ MXN: '90.62' });

    const det = (await api().get(base).set(consulta).expect(200)).body;
    expect(det.total).toEqual({ MXN: '10919.71' }); // 120.5 × 90.62 = 10919.71
    expect(det.renglones.find((r: { id: string }) => r.id === concepto.id)).toMatchObject({ clave: 'MURO', unidad: 'm2', precioUnitario: { MXN: '90.62' } });

    // Cambiar un costo recalcula todo.
    const cem = (await api().get(`${base}/insumos`).set(admin)).body.find((i: { clave: string }) => i.clave === 'CEM');
    await api().patch(`${base}/insumos/${cem.id}`).set(admin).send({ costo: '4' }).expect(200);
    await api().patch(`${base}/renglones/${concepto.id}`).set(admin).send({ cantidad: '100' }).expect(200);
    // MORT = 1000 + 495 = 1495 → 17.94; MURO = 17.94 + 72.50 + 2.18 = 92.62
    expect((await api().get(base).set(admin)).body.total).toEqual({ MXN: '9262.00' });

    // Otro concepto con su propia clave ligado a la misma matriz: comparte el precio unitario.
    const ligado = (
      await api().post(`${base}/renglones`).set(admin).send({ tipo: 'concepto', padreId: partida.id, cantidad: '10', matrizId: muro.id, clave: 'MURO-B', descripcion: 'Muro en fachada' }).expect(201)
    ).body;
    let arbol = (await api().get(base).set(admin)).body;
    expect(arbol.renglones.find((r: { id: string }) => r.id === ligado.id)).toMatchObject({
      clave: 'MURO-B',
      descripcion: 'Muro en fachada',
      unidad: 'm2',
      matrizClave: 'MURO',
      precioUnitario: { MXN: '92.62' },
      importe: { MXN: '926.20' },
    });
    await api().patch(`${base}/renglones/${ligado.id}`).set(admin).send({ descripcion: 'Muro en fachada norte' }).expect(200);
    arbol = (await api().get(base).set(admin)).body;
    expect(arbol.total).toEqual({ MXN: '10188.20' });
    await api().delete(`${base}/renglones/${ligado.id}`).set(admin).expect(204);

    // No se permiten ciclos ni componentes inexistentes, ni borrar insumos en uso.
    await api().put(`${base}/matrices/${mort.id}/renglones`).set(admin).send({ renglones: [{ componente: 'MURO', cantidad: '1' }] }).expect(400);
    await api().put(`${base}/matrices/${mort.id}/renglones`).set(admin).send({ renglones: [{ componente: 'NOEXISTE', cantidad: '1' }] }).expect(400);
    await api().delete(`${base}/insumos/${cem.id}`).set(admin).expect(409);
  });

  it('registra los cambios en la bitácora sin guardar contraseñas', async () => {
    await new Promise((r) => setTimeout(r, 200));
    const registros = (await api().get('/api/bitacora').set(admin).expect(200)).body;
    const alta = registros.find((r: { ruta: string; metodo: string }) => r.ruta === '/api/usuarios' && r.metodo === 'POST');
    expect(alta).toMatchObject({ usuario: 'Administrador', estado: 201, datos: { email: 'ver@example.com', password: '***' } });
    expect(registros.some((r: { ruta: string }) => r.ruta.includes('/insumos'))).toBe(true);
    await api().get('/api/bitacora').set(consulta).expect(403);
  });

  it('solo consulta no puede modificar', async () => {
    await api().post('/api/presupuestos').set(consulta).send({ nombre: 'X' }).expect(403);
    await api().get('/api/presupuestos').set(consulta).expect(200);
  });

  it('importa un archivo de intercambio de Neodata y cuadra con su total', async () => {
    const res = await api()
      .post('/api/presupuestos/importar/neodata')
      .set(admin)
      .attach('archivo', Buffer.from(neodataDePrueba()), 'Xn_Presupuesto.xlsx')
      .expect(201);
    expect(res.body).toMatchObject({ totalOrigen: '23331.21', advertencias: [] });

    const det = (await api().get(`/api/presupuestos/${res.body.id}`).set(admin).expect(200)).body;
    expect(det.presupuesto).toMatchObject({ nombre: 'Casa Prueba', origen: 'Neodata', tipo: 'venta', etapa: 'inicial', estado: 'borrador' });
    expect(det.proyecto).toMatchObject({ nombre: 'Casa Prueba', ubicacion: 'Querétaro' });
    expect(det.total).toEqual({ MXN: '23331.21' });
    expect(det.renglones.map((r: { tipo: string; clave: string }) => `${r.tipo}:${r.clave}`)).toEqual(['partida:A', 'partida:01', 'concepto:MURO']);

    // Solo trae del banco lo que usa el presupuesto.
    const insumos = (await api().get(`/api/presupuestos/${res.body.id}/insumos`).set(admin)).body.map((i: { clave: string }) => i.clave);
    expect(insumos.sort()).toEqual(['ARENA', 'CEM', 'HM', 'OFI', 'PEON']);

    await api().post('/api/presupuestos/importar/neodata').set(admin).attach('archivo', Buffer.from('no es excel'), 'x.xlsx').expect(400);
  });

  /** Presupuesto mínimo: un concepto MURO de $100.00 por unidad dentro de una partida. */
  async function presupuestoSencillo(proyecto: string) {
    const p = (await api().post('/api/presupuestos').set(admin).send({ nombre: 'Venta', proyecto }).expect(201)).body;
    const base = `/api/presupuestos/${p.id}`;
    await api().post(`${base}/insumos`).set(admin).send({ clave: 'BLOCK', tipo: 'material', costo: '10' }).expect(201);
    const partida = (await api().post(`${base}/renglones`).set(admin).send({ tipo: 'partida', clave: '01', descripcion: 'Muros' }).expect(201)).body;
    const concepto = (
      await api().post(`${base}/renglones`).set(admin).send({ tipo: 'concepto', padreId: partida.id, cantidad: '1', nueva: { clave: 'MURO', descripcion: 'Muro', unidad: 'm2' } }).expect(201)
    ).body;
    await api().put(`${base}/matrices/${concepto.matrizId}/renglones`).set(admin).send({ renglones: [{ componente: 'BLOCK', cantidad: '10' }] }).expect(200);
    return { p, base, concepto };
  }

  it('calcula la cantidad de un concepto con su cuantificación', async () => {
    const { base, concepto } = await presupuestoSencillo('Bodega');
    const url = `${base}/renglones/${concepto.id}/cuantificacion`;
    const c = (
      await api()
        .put(url)
        .set(admin)
        .send({
          renglones: [
            { descripcion: 'Muro eje 1', eje: '1/A-C', piezas: '2', largo: '5.25', alto: '2.40' }, // 25.2
            { descripcion: 'Vano puerta', piezas: '-1', largo: '0.9', alto: '2.1' }, // -1.89
            { descripcion: 'Pretil', eje: 'A', largo: '12', alto: '0.6', formula: '(L+0.3)*H' }, // 7.38
          ],
        })
        .expect(200)
    ).body;
    expect(c.renglones.map((r: { resultado: string }) => r.resultado)).toEqual(['25.200000', '-1.890000', '7.380000']);
    expect(c.total).toBe('30.690000');

    const det = (await api().get(base).set(admin)).body;
    expect(det.renglones.find((r: { id: string }) => r.id === concepto.id)).toMatchObject({ cantidad: '30.690000', cuantificado: true, importe: { MXN: '3069.00' } });
    expect(det.total).toEqual({ MXN: '3069.00' });

    // Con cuantificación la cantidad no se captura a mano; una fórmula inválida no se guarda.
    await api().patch(`${base}/renglones/${concepto.id}`).set(admin).send({ cantidad: '5' }).expect(400);
    await api().put(url).set(admin).send({ renglones: [{ formula: '2*(3' }] }).expect(400);
    expect((await api().get(url).set(consulta).expect(200)).body.total).toBe('30.690000');

    // Sin renglones vuelve a capturarse a mano y conserva la última cantidad.
    await api().put(url).set(admin).send({ renglones: [] }).expect(200);
    await api().patch(`${base}/renglones/${concepto.id}`).set(admin).send({ cantidad: '5' }).expect(200);
    expect((await api().get(base).set(admin)).body.total).toEqual({ MXN: '500.00' });
  });

  it('agrupa presupuestos por proyecto, los duplica y los congela', async () => {
    const { p, base, concepto } = await presupuestoSencillo('Torre');
    await api()
      .put(`${base}/renglones/${concepto.id}/cuantificacion`)
      .set(admin)
      .send({ renglones: [{ piezas: '3' }] })
      .expect(200);

    // Copia de costo en el mismo proyecto: independiente del original, con cuantificación incluida.
    const costo = (await api().post(`${base}/duplicar`).set(admin).send({ nombre: 'Costo', tipo: 'costo' }).expect(201)).body;
    expect(costo).toMatchObject({ proyectoId: p.proyectoId, tipo: 'costo', etapa: 'inicial', estado: 'borrador' });
    const baseCosto = `/api/presupuestos/${costo.id}`;
    const detCosto = (await api().get(baseCosto).set(admin)).body;
    expect(detCosto.total).toEqual({ MXN: '300.00' });
    const conceptoCopia = detCosto.renglones.find((r: { tipo: string }) => r.tipo === 'concepto');
    expect(conceptoCopia).toMatchObject({ clave: 'MURO', cuantificado: true });
    const block = (await api().get(`${baseCosto}/insumos`).set(admin)).body[0];
    await api().patch(`${baseCosto}/insumos/${block.id}`).set(admin).send({ costo: '8' }).expect(200);
    expect((await api().get(baseCosto).set(admin)).body.total).toEqual({ MXN: '240.00' });
    expect((await api().get(base).set(admin)).body.total).toEqual({ MXN: '300.00' });

    const proyectos = (await api().get('/api/proyectos').set(consulta).expect(200)).body;
    expect(proyectos.find((x: { nombre: string }) => x.nombre === 'Torre')).toMatchObject({ tipo: 'obra', presupuestos: 2 });
    await api().delete(`/api/proyectos/${p.proyectoId}`).set(admin).expect(409);
    const lista = (await api().get('/api/presupuestos').set(admin)).body;
    expect(lista.find((x: { id: string }) => x.id === costo.id)).toMatchObject({ proyecto: 'Torre', tipo: 'costo', conceptos: 1 });

    // Congelado: no se modifica nada hasta cambiarle el estado.
    await api().patch(base).set(admin).send({ estado: 'congelado' }).expect(200);
    await api().patch(`${base}/renglones/${concepto.id}`).set(admin).send({ descripcion: 'Otro' }).expect(409);
    await api().post(`${base}/insumos`).set(admin).send({ clave: 'X', tipo: 'material' }).expect(409);
    await api().put(`${base}/matrices/${concepto.matrizId}/renglones`).set(admin).send({ renglones: [] }).expect(409);
    await api().put(`${base}/renglones/${concepto.id}/cuantificacion`).set(admin).send({ renglones: [] }).expect(409);
    await api().patch(base).set(admin).send({ nombre: 'Otro' }).expect(409);
    await api().delete(base).set(admin).expect(409);
    await api().post(`${base}/duplicar`).set(admin).send({ etapa: 'planificado' }).expect(201);
    await api().patch(base).set(admin).send({ estado: 'autorizado' }).expect(200);
    await api().patch(`${base}/renglones/${concepto.id}`).set(admin).send({ descripcion: 'Otro' }).expect(200);
  });

  it('borra presupuestos con todo su contenido y luego sus proyectos', async () => {
    const lista = (await api().get('/api/presupuestos').set(admin)).body;
    for (const p of lista) await api().delete(`/api/presupuestos/${p.id}`).set(admin).expect(204);
    expect((await api().get('/api/presupuestos').set(admin)).body).toEqual([]);
    for (const p of (await api().get('/api/proyectos').set(admin)).body) await api().delete(`/api/proyectos/${p.id}`).set(admin).expect(204);
  });
});
