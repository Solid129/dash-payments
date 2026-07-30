import { Global, Module } from '@nestjs/common';

import { DbService } from './db.service';

/**
 * Global so feature modules don't each have to import it. This is one of the
 * few places a global module is the right call: there is exactly one database
 * connection pool and every module needs it.
 */
@Global()
@Module({
  providers: [DbService],
  exports: [DbService],
})
export class DbModule {}
