FROM node:24-alpine

RUN apk add --no-cache openssl curl

# recent node:alpine images no longer bundle yarn classic, and corepack's
# availability varies by node version, so install yarn directly via npm
# RUN npm install -g yarn

RUN mkdir -p /usr/src/node-app && chown -R node:node /usr/src/node-app

WORKDIR /usr/src/node-app

COPY package.json yarn.lock ./
# prisma.config.ts rides along with the schema: `postinstall` runs
# `prisma generate`, and v7's CLI reads its config from there.
COPY prisma.config.ts ./
COPY prisma ./prisma

USER node

RUN yarn install --pure-lockfile

COPY --chown=node:node . .

EXPOSE 3000

# apply pending migrations before the server comes up, so a deploy that ships
# a new migration never serves traffic against the old schema
CMD ["sh", "-c", "yarn prisma migrate deploy && yarn start"]
