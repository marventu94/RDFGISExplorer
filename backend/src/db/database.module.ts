import { Module, Global } from '@nestjs/common';
import Database from 'better-sqlite3';
import { createSqliteConnection, runMigrations } from './sqlite.provider';

export const DATABASE_CONNECTION = Symbol('DATABASE_CONNECTION');

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CONNECTION,
      useFactory: (): Database.Database => {
        const db = createSqliteConnection();
        runMigrations(db);
        return db;
      },
    },
  ],
  exports: [DATABASE_CONNECTION],
})
export class DatabaseModule {}
