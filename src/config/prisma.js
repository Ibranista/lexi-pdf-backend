const { PrismaClient } = require('@prisma/client');
const config = require('./config');

// cache the client on `global` so nodemon reloads in dev don't open a new
// connection pool on every restart
const prisma =
  global.prisma ||
  new PrismaClient({
    datasources: { db: { url: config.postgres.url } },
  });

if (config.env !== 'production') {
  global.prisma = prisma;
}

module.exports = prisma;
