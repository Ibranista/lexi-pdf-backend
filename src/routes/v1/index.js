const express = require('express');
const authRoute = require('./auth.route');
const userRoute = require('./user.route');
const syncRoute = require('./sync.route');
const aiRoute = require('./ai.route');
const suggestionRoute = require('./suggestion.route');
const docsRoute = require('./docs.route');
const config = require('../../config/config');

const router = express.Router();

const defaultRoutes = [
  {
    path: '/auth',
    route: authRoute,
  },
  {
    path: '/users',
    route: userRoute,
  },
  {
    path: '/sync',
    route: syncRoute,
  },
  {
    path: '/ai',
    route: aiRoute,
  },
  {
    path: '/book-suggestions',
    route: suggestionRoute,
  },
];

const devRoutes = [
  // routes available only in development mode
  {
    path: '/docs',
    route: docsRoute,
  },
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

/* istanbul ignore next */
if (config.env === 'development') {
  devRoutes.forEach((route) => {
    router.use(route.path, route.route);
  });
}

module.exports = router;
