import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('10000').transform((val) => parseInt(val, 10)),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().default('*'),
  BACKEND_API_BASE_URL: z.string().url().default('https://api.amnplc.com/api'),
  BACKEND_API_KEY: z.string().optional(),
  VALIDATION_MODE: z.enum(['strict', 'fallback', 'mock']).default('fallback'),
  ORDER_CACHE_TTL_SECONDS: z.string().default('30').transform((val) => parseInt(val, 10)),
  MAX_LOCATION_HISTORY: z.string().default('100').transform((val) => parseInt(val, 10)),
  SOCKET_PING_INTERVAL_MS: z.string().default('25000').transform((val) => parseInt(val, 10)),
  SOCKET_PING_TIMEOUT_MS: z.string().default('20000').transform((val) => parseInt(val, 10)),
});

export type EnvConfig = z.infer<typeof envSchema>;

let parsedEnv: EnvConfig;
try {
  parsedEnv = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('❌ Environment configuration validation failed:');
    error.errors.forEach((err) => {
      console.error(`   - ${err.path.join('.')}: ${err.message}`);
    });
  }
  process.exit(1);
}

export const env = parsedEnv;
