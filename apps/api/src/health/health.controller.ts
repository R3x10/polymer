import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Public } from '../auth/decorators';
import { DB, Db } from '../db/db.module';

@Controller('salud')
export class HealthController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Public()
  @Get()
  async salud() {
    await this.db.execute(sql`select 1`);
    return { ok: true };
  }
}
