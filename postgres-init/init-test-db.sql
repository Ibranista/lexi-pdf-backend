-- runs automatically on first container start (see docker-entrypoint-initdb.d)
-- creates a second database so `yarn test` never touches dev data
CREATE DATABASE "node-boilerplate_test";
