import { env } from '../config/env.config';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel = env.NODE_ENV === 'production' ? 'info' : 'debug';

class LoggerService {
  private format(level: LogLevel, message: string, meta?: unknown): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` | ${typeof meta === 'object' ? JSON.stringify(meta) : String(meta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
  }

  public debug(message: string, meta?: unknown): void {
    if (LOG_LEVELS[currentLevel] <= LOG_LEVELS.debug) {
      console.debug(this.format('debug', message, meta));
    }
  }

  public info(message: string, meta?: unknown): void {
    if (LOG_LEVELS[currentLevel] <= LOG_LEVELS.info) {
      console.info(this.format('info', message, meta));
    }
  }

  public warn(message: string, meta?: unknown): void {
    if (LOG_LEVELS[currentLevel] <= LOG_LEVELS.warn) {
      console.warn(this.format('warn', message, meta));
    }
  }

  public error(message: string, error?: unknown, meta?: unknown): void {
    if (LOG_LEVELS[currentLevel] <= LOG_LEVELS.error) {
      const errDetails = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error;
      console.error(this.format('error', message, { error: errDetails, meta }));
    }
  }
}

export const logger = new LoggerService();
