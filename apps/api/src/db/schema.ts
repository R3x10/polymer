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

// Un proyecto agrupa varios presupuestos: el de venta y el de costo, el inicial y el planificado, etc.
export const TIPOS_PROYECTO = ['obra', 'centro_costos'] as const;
export const TIPOS_PRESUPUESTO = ['venta', 'costo'] as const;
export const ETAPAS_PRESUPUESTO = ['inicial', 'planificado'] as const;
export const ESTADOS_PRESUPUESTO = ['borrador', 'autorizado', 'congelado'] as const;
export const tipoProyectoEnum = pgEnum('tipo_proyecto', TIPOS_PROYECTO);
export const tipoPresupuestoEnum = pgEnum('tipo_presupuesto', TIPOS_PRESUPUESTO);
export const etapaPresupuestoEnum = pgEnum('etapa_presupuesto', ETAPAS_PRESUPUESTO);
export const estadoPresupuestoEnum = pgEnum('estado_presupuesto', ESTADOS_PRESUPUESTO);

export const proyectos = pgTable(
  'proyectos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nombre: text('nombre').notNull(),
    tipo: tipoProyectoEnum('tipo').notNull().default('obra'),
    cliente: text('cliente'),
    ubicacion: text('ubicacion'),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('proyectos_nombre_unico').on(sql`lower(${t.nombre})`)],
);

export const presupuestos = pgTable('presupuestos', {
  id: uuid('id').primaryKey().defaultRandom(),
  proyectoId: uuid('proyecto_id')
    .notNull()
    .references(() => proyectos.id, { onDelete: 'restrict' }),
  nombre: text('nombre').notNull(),
  tipo: tipoPresupuestoEnum('tipo').notNull().default('venta'),
  etapa: etapaPresupuestoEnum('etapa').notNull().default('inicial'),
  /** Congelado = solo lectura. Autorizado marca la versión aprobada por el cliente y se puede seguir ajustando. */
  estado: estadoPresupuestoEnum('estado').notNull().default('borrador'),
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

/**
 * Cuantificación (generador) de un concepto. Cuando un concepto tiene renglones aquí, su cantidad
 * es la suma de sus resultados y se recalcula al guardarlos.
 */
export const cuantificaciones = pgTable(
  'cuantificaciones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    renglonId: uuid('renglon_id')
      .notNull()
      .references(() => presupuestoRenglones.id, { onDelete: 'cascade' }),
    orden: integer('orden').notNull(),
    descripcion: text('descripcion').notNull().default(''),
    eje: text('eje').notNull().default(''),
    piezas: numeric('piezas', { precision: 20, scale: 6 }),
    largo: numeric('largo', { precision: 20, scale: 6 }),
    ancho: numeric('ancho', { precision: 20, scale: 6 }),
    alto: numeric('alto', { precision: 20, scale: 6 }),
    formula: text('formula').notNull().default(''),
  },
  (t) => [index('cuantificaciones_renglon').on(t.renglonId, t.orden)],
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
