import { boolean, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
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
