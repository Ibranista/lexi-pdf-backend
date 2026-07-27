const express = require('express');
const helmet = require('helmet');
const xss = require('xss-clean');
const compression = require('compression');
const cors = require('cors');
const passport = require('passport');
const httpStatus = require('http-status');
const config = require('./config/config');
const morgan = require('./config/morgan');
const { jwtStrategy } = require('./config/passport');
const { authLimiter } = require('./middlewares/rateLimiter');
const routes = require('./routes/v1');
const ttsService = require('./services/tts.service');
const { errorConverter, errorHandler } = require('./middlewares/error');
const ApiError = require('./utils/ApiError');

const app = express();

if (config.env !== 'test') {
  app.use(morgan.successHandler);
  app.use(morgan.errorHandler);
}

// set security HTTP headers
app.use(helmet());

// parse json request body — /ai/context ships ~20 pages of extracted book text
// per chunk, and /sync enforces its own 2 MB cap per spec §2.3
app.use(express.json({ limit: '6mb' }));

// parse urlencoded request body
app.use(express.urlencoded({ extended: true }));

// Sanitize request data — except where the payload is verbatim quoted text.
// xss-clean escapes HTML entities in place, and an annotation's `text` is the
// exact passage the reflow reader re-finds the highlight by: rewriting `&` or
// `<` there silently breaks the mark on the next device. These bodies are
// consumed by a React Native client and never rendered as HTML.
const verbatimRoutes = ['/v1/sync', '/v1/ai'];
const sanitize = xss();
app.use((req, res, next) =>
  verbatimRoutes.some((route) => req.path.startsWith(route)) ? next() : sanitize(req, res, next)
);

// gzip compression
app.use(compression());

// enable cors
app.use(cors());
app.options('*', cors());

// jwt authentication
app.use(passport.initialize());
passport.use('jwt', jwtStrategy);

// limit repeated failed requests to auth endpoints
if (config.env === 'production') {
  app.use('/v1/auth', authLimiter);
}

// synthesized speech: no auth on the media URL, cacheable, content-addressed
app.use('/static/tts', express.static(ttsService.AUDIO_DIR, { maxAge: '7d', immutable: true, fallthrough: true }));

// v1 api routes
app.use('/v1', routes);

// send back a 404 error for any unknown api request
app.use((req, res, next) => {
  next(new ApiError(httpStatus.NOT_FOUND, 'Not found'));
});

// convert error to ApiError, if needed
app.use(errorConverter);

// handle error
app.use(errorHandler);

module.exports = app;
