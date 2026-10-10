import { AnyPgColumn, boolean, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const ROLES = ['admin', 'presupuestador', 'consulta'] as const;
export type Rol = (typeof ROLES)[number];

export const rolEnum = pgEnum('rol', ROLES);

export const usuarios = pgTable(
  'usuarios',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    nombre: text('nombre').notNull(),
    passwordHash: text('password_hash').notNull(),
    rol: rolEnum('rol').notNull().default('consulta'),
    activo: boolean('activo').notNull().default(true),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('usuarios_email_unico').on(sql`lower(${t.email})`)],
);

export type Usuario = typeof usuarios.$inferSelect;

// ---------------------------------------------------------------------------
// Presupuestos. Cada presupuesto tiene su propio catálogo de insumos y matrices
// (copia del banco de precios), así cambiar un costo en una obra no afecta a otra.

export const TIPOS_INSUMO = ['material', 'mano_obra', 'herramienta', 'equipo', 'subcontrato', 'flete', 'otro'] as const;
export const TIPOS_MATRIZ = ['concepto', 'auxiliar', ...TIPOS_INSUMO] as const;
export const tipoInsumoEnum = pgEnum('tipo_insumo', TIPOS_INSUMO);
export const tipoMatrizEnum = pgEnum('tipo_matriz', TIPOS_MATRIZ);
export const tipoRenglonEnum = pgEnum('tipo_renglon', ['partida', 'concepto']);

const dinero = (nombre: string) => numeric(nombre, { precision: 20, scale: 6 });

export const presupuestos = pgTable('presupuestos', {
  id: uuid('id').primaryKey().defaultRandom(),
  nombre: text('nombre').notNull(),
  cliente: text('cliente'),
  ubicacion: text('ubicacion'),
  monedaBase: text('moneda_base').notNull().default('MXN'),
  origen: text('origen'),
  creadoPor: uuid('creado_por').references(() => usuarios.id),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
});

export const insumos = pgTable(
  'insumos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    presupuestoId: uuid('presupuesto_id')
      .notNull()
      .references(() => presupuestos.id, { onDelete: 'cascade' }),
    clave: text('clave').notNull(),
    descripcion: text('descripcion').notNull().default(''),
    unidad: text('unidad').notNull().default(''),
    tipo: tipoInsumoEnum('tipo').notNull(),
    costo: dinero('costo').notNull().default('0'),
    moneda: text('moneda').notNull().default('MXN'),
    porcentajeManoObra: boolean('porcentaje_mano_obra').notNull().default(false),
    salarioBase: dinero('salario_base'),
    fsr: numeric('fsr', { precision: 12, scale: 6 }),
  },
  (t) => [uniqueIndex('insumos_clave_unica').on(t.presupuestoId, t.clave)],
);

export const matrices = pgTable(
  'matrices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    presupuestoId: uuid('presupuesto_id')
      .notNull()
      .references(() => presupuestos.id, { onDelete: 'cascade' }),
    clave: text('clave').notNull(),
    descripcion: text('descripcion').notNull().default(''),
    unidad: text('unidad').notNull().default(''),
    tipo: tipoMatrizEnum('tipo').notNull().default('concepto'),
  },
  (t) => [uniqueIndex('matrices_clave_unica').on(t.presupuestoId, t.clave)],
);

/** Renglón de un análisis de precio. El componente se guarda por clave: puede ser insumo o matriz. */
export const matrizRenglones = pgTable(
  'matriz_renglones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    matrizId: uuid('matriz_id')
      .notNull()
      .references(() => matrices.id, { onDelete: 'cascade' }),
    orden: integer('orden').notNull(),
    componente: text('componente').notNull(),
    cantidad: numeric('cantidad', { precision: 20, scale: 8 }).notNull(),
  },
  (t) => [index('matriz_renglones_matriz').on(t.matrizId, t.orden)],
);

/** Árbol del presupuesto: partidas (agrupadores) y conceptos con cantidad, cada concepto ligado a una matriz. */
export const presupuestoRenglones = pgTable(
  'presupuesto_renglones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    presupuestoId: uuid('presupuesto_id')
      .notNull()
      .references(() => presupuestos.id, { onDelete: 'cascade' }),
    padreId: uuid('padre_id').references((): AnyPgColumn => presupuestoRenglones.id, { onDelete: 'cascade' }),
    orden: integer('orden').notNull(),
    tipo: tipoRenglonEnum('tipo').notNull(),
    // Los conceptos llevan su propia clave, descripción y unidad: varios conceptos pueden usar la misma matriz.
    clave: text('clave').notNull().default(''),
    descripcion: text('descripcion').notNull().default(''),
    unidad: text('unidad').notNull().default(''),
    matrizId: uuid('matriz_id').references(() => matrices.id, { onDelete: 'restrict' }),
    cantidad: numeric('cantidad', { precision: 20, scale: 6 }),
  },
  (t) => [index('presupuesto_renglones_arbol').on(t.presupuestoId, t.padreId, t.orden)],
);

/** Bitácora de cambios: quién hizo qué y cuándo. Se llena sola con cada petición que modifica datos. */
export const bitacora = pgTable(
  'bitacora',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fecha: timestamp('fecha', { withTimezone: true }).notNull().defaultNow(),
    usuarioId: uuid('usuario_id').references(() => usuarios.id, { onDelete: 'set null' }),
    metodo: text('metodo').notNull(),
    ruta: text('ruta').notNull(),
    estado: integer('estado').notNull(),
    datos: jsonb('datos'),
  },
  (t) => [index('bitacora_fecha').on(t.fecha)],
);
