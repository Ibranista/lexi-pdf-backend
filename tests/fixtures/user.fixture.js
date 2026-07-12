const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const faker = require('faker');
const prisma = require('../../src/config/prisma');

const password = 'password1';
const salt = bcrypt.genSaltSync(8);
const hashedPassword = bcrypt.hashSync(password, salt);

const userOne = {
  id: uuidv4(),
  name: faker.name.findName(),
  email: faker.internet.email().toLowerCase(),
  password,
  role: 'user',
  isEmailVerified: false,
};

const userTwo = {
  id: uuidv4(),
  name: faker.name.findName(),
  email: faker.internet.email().toLowerCase(),
  password,
  role: 'user',
  isEmailVerified: false,
};

const admin = {
  id: uuidv4(),
  name: faker.name.findName(),
  email: faker.internet.email().toLowerCase(),
  password,
  role: 'admin',
  isEmailVerified: false,
};

const insertUsers = async (users) => {
  await prisma.user.createMany({
    data: users.map((user) => ({ ...user, password: hashedPassword })),
  });
};

module.exports = {
  userOne,
  userTwo,
  admin,
  insertUsers,
};
