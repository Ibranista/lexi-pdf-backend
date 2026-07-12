const prisma = require('../../src/config/prisma');

const setupTestDB = () => {
  beforeEach(async () => {
    await prisma.token.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
};

module.exports = setupTestDB;
