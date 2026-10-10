import { Global, Inject, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { join } from 'node:path';
import { ENV, Env } from '../config/env';
import * as schema from './schema';

export const DB = Symbol('DB');
export const PG_POOL = Symbol('PG_POOL');
export type Db = NodePgDatabase<typeof schema>;

export const MIGRATIONS_DIR = join(__dirname, '..', '..', 'drizzle');

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ENV],
      useFactory: (env: Env) => new Pool({ connectionString: env.DATABASE_URL }),
    },
    {
      provide: DB,
      inject: [PG_POOL],
      useFactory: async (pool: Pool) => {
        const db = drizzle(pool, { schema });
        await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
        new Logger('Db').log('Migraciones aplicadas');
        return db;
      },
    },
  ],
  exports: [DB],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown() {
    await this.pool.end();
  }
}

/** Transacción de Drizzle: los servicios aceptan `Db | Tx` cuando pueden correr dentro de una. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
