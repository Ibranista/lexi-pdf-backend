const dotenv = require('dotenv');
const path = require('path');
const Joi = require('joi');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const envVarsSchema = Joi.object()
  .keys({
    NODE_ENV: Joi.string().valid('production', 'development', 'test').required(),
    PORT: Joi.number().default(3000),
    DATABASE_URL: Joi.string().required().description('Postgres DB url'),
    JWT_SECRET: Joi.string().required().description('JWT secret key'),
    JWT_ACCESS_EXPIRATION_MINUTES: Joi.number().default(30).description('minutes after which access tokens expire'),
    JWT_REFRESH_EXPIRATION_DAYS: Joi.number().default(30).description('days after which refresh tokens expire'),
    JWT_RESET_PASSWORD_EXPIRATION_MINUTES: Joi.number()
      .default(10)
      .description('minutes after which reset password token expires'),
    JWT_VERIFY_EMAIL_EXPIRATION_MINUTES: Joi.number()
      .default(10)
      .description('minutes after which verify email token expires'),
    SMTP_HOST: Joi.string().description('server that will send the emails'),
    SMTP_PORT: Joi.number().description('port to connect to the email server'),
    SMTP_USERNAME: Joi.string().description('username for email server'),
    SMTP_PASSWORD: Joi.string().description('password for email server'),
    EMAIL_FROM: Joi.string().description('the from field in the emails sent by the app'),
    PUBLIC_URL: Joi.string().uri().default('http://localhost:3000').description('public origin of this API'),
    OPENAI_API_KEY: Joi.string().allow('').default('').description('OpenAI key used by the LangChain models'),
    OPENAI_MODEL: Joi.string().default('gpt-4o-mini').description('chat model for translate and Lexi'),
    OPENAI_TTS_MODEL: Joi.string().default('gpt-4o-mini-tts').description('speech model for /ai/tts'),
    TTS_LANGS: Joi.string().default('en,ar').description('languages a TTS voice exists for'),
    GOOGLE_CLIENT_ID: Joi.string()
      .allow('')
      .default('')
      .description('comma-separated Google client ids an id token may be addressed to'),
    AI_QUOTA_ANONYMOUS: Joi.number().default(10).description('AI requests granted to an anonymous user, non-renewing'),
    AI_QUOTA_FREE: Joi.number().default(30).description('AI requests per month for a signed-in free user'),
    AI_QUOTA_PRO: Joi.number().default(1000).description('AI requests per month for a pro user'),
    SYNC_MAX_PAYLOAD_BYTES: Joi.number()
      .default(2 * 1024 * 1024)
      .description('reject larger /sync bodies with 413'),
    SYNC_TOMBSTONE_DAYS: Joi.number().default(90).description('days a deleted row is kept before purging'),
  })
  .unknown();

const { value: envVars, error } = envVarsSchema.prefs({ errors: { label: 'key' } }).validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

const getDatabaseUrl = () => {
  if (envVars.NODE_ENV !== 'test') {
    return envVars.DATABASE_URL;
  }
  // use a separate database for tests so `yarn test` never wipes dev data
  const url = new URL(envVars.DATABASE_URL);
  url.pathname = `${url.pathname}_test`;
  return url.toString();
};

module.exports = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  postgres: {
    url: getDatabaseUrl(),
  },
  jwt: {
    secret: envVars.JWT_SECRET,
    accessExpirationMinutes: envVars.JWT_ACCESS_EXPIRATION_MINUTES,
    refreshExpirationDays: envVars.JWT_REFRESH_EXPIRATION_DAYS,
    resetPasswordExpirationMinutes: envVars.JWT_RESET_PASSWORD_EXPIRATION_MINUTES,
    verifyEmailExpirationMinutes: envVars.JWT_VERIFY_EMAIL_EXPIRATION_MINUTES,
  },
  email: {
    smtp: {
      host: envVars.SMTP_HOST,
      port: envVars.SMTP_PORT,
      auth: {
        user: envVars.SMTP_USERNAME,
        pass: envVars.SMTP_PASSWORD,
      },
    },
    from: envVars.EMAIL_FROM,
  },
  publicUrl: envVars.PUBLIC_URL.replace(/\/$/, ''),
  openai: {
    apiKey: envVars.OPENAI_API_KEY,
    model: envVars.OPENAI_MODEL,
    ttsModel: envVars.OPENAI_TTS_MODEL,
    ttsLangs: envVars.TTS_LANGS.split(',')
      .map((lang) => lang.trim())
      .filter(Boolean),
  },
  google: {
    clientIds: envVars.GOOGLE_CLIENT_ID.split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  },
  ai: {
    quota: {
      anonymous: envVars.AI_QUOTA_ANONYMOUS,
      free: envVars.AI_QUOTA_FREE,
      pro: envVars.AI_QUOTA_PRO,
    },
  },
  sync: {
    maxPayloadBytes: envVars.SYNC_MAX_PAYLOAD_BYTES,
    tombstoneDays: envVars.SYNC_TOMBSTONE_DAYS,
  },
};
