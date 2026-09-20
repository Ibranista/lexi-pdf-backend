const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const config = require('./config');

// v7 takes the connection through a driver adapter rather than a `datasources`
// override: the schema no longer carries a url, and Migrate reads its own from
// prisma.config.ts. Built from `config.postgres.url` so `yarn test` still talks
// to the `_test` database and never wipes dev data.
const adapter = new PrismaPg({ connectionString: config.postgres.url });

// cache the client on `global` so nodemon reloads in dev don't open a new
// connection pool on every restart
const prisma = global.prisma || new PrismaClient({ adapter });

if (config.env !== 'production') {
  global.prisma = prisma;
}

module.exports = prisma;
