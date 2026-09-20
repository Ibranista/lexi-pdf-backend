import 'dotenv/config';

import { defineConfig, env } from 'prisma/config';

/**
 * Prisma 7 keeps the connection url out of the schema: Migrate reads it from
 * here, and the running app builds its own adapter in `src/config/prisma.js`.
 *
 * Only the CLI loads this file, so it can be TypeScript in an otherwise
 * CommonJS codebase — nothing here is required at runtime.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
