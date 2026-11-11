/**
 * Logging foundation.
 * Centralized logger respecting environment log level. All application logs
 * go through here so they can be silenced/re-routed for production builds.
 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const levelPriority: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface LoggerOptions {
  prefix?: string;
  level?: LogLevel;
}

class Logger {
  private prefix: string;
  private level: LogLevel;

  constructor(options: LoggerOptions = {}) {
    this.prefix = options.prefix ?? 'AETHRION';
    this.level = options.level ?? 'info';
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return levelPriority[level] >= levelPriority[this.level];
  }

  private format(level: LogLevel, args: unknown[]): string {
    const timestamp = new Date().toISOString();
    const message = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    return `[${timestamp}] [${this.prefix}] [${level.toUpperCase()}] ${message}`;
  }

  debug(...args: unknown[]): void {
    if (this.shouldLog('debug')) console.debug(this.format('debug', args));
  }

  info(...args: unknown[]): void {
    if (this.shouldLog('info')) console.info(this.format('info', args));
  }

  warn(...args: unknown[]): void {
    if (this.shouldLog('warn')) console.warn(this.format('warn', args));
  }

  error(...args: unknown[]): void {
    if (this.shouldLog('error')) console.error(this.format('error', args));
  }
}

export const logger = new Logger({ prefix: 'AETHRION' });

export function createLogger(prefix: string): Logger {
  return new Logger({ prefix });
}

export type { LogLevel };
