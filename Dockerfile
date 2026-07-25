FROM node:24-alpine

RUN apk add --no-cache openssl

# recent node:alpine images no longer bundle yarn classic, and corepack's
# availability varies by node version, so install yarn directly via npm
# RUN npm install -g yarn

RUN mkdir -p /usr/src/node-app && chown -R node:node /usr/src/node-app

WORKDIR /usr/src/node-app

COPY package.json yarn.lock ./
COPY prisma ./prisma

USER node

RUN yarn install --pure-lockfile

COPY --chown=node:node . .

EXPOSE 3000
