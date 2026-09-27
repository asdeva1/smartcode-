import * as Joi from 'joi';

/**
 * Fails fast at boot if required environment variables are missing —
 * see brief Section 18 "environment validation" and
 * docs/07-SECURITY-ARCHITECTURE.md secrets-management section.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().default(4000),
  DATABASE_URL: Joi.string().required(),
  REDIS_URL: Joi.string().required(),
  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_EXPIRY: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRY: Joi.string().default('7d'),
  WEB_ORIGIN: Joi.string().uri().default('http://localhost:3000'),
  // IANA zone for server-side "today" when a client doesn't send its own
  // local date (report periods). Explicit so the host timezone never matters.
  APP_TIMEZONE: Joi.string().default('UTC'),
});
