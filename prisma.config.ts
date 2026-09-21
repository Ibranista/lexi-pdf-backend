import 'dotenv/config';

import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 keeps the connection url out of the schema: Migrate reads it from
 * here, and the running app builds its own adapter in `src/config/prisma.js`.
 *
 * Only the CLI loads this file, so it can be TypeScript in an otherwise
 * CommonJS codebase — nothing here is required at runtime.
 *
 * `process.env` rather than the `env()` helper: `env()` throws when the var is
 * unset, and `prisma generate` runs at image build time (postinstall) where no
 * database exists. Migrate still errors clearly if the url is missing.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
