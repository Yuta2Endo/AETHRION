/**
 * Centralized error handling foundation.
 * Catches unhandled exceptions and rejected promises, logs them through the
 * application logger, and exposes a Result-based helper for fallible operations.
 * No game logic lives here — this is an application concern only. This module
 * intentionally has no React dependency so it can be used by any layer.
 */

import { logger } from '@/core/logging/logger';
import { eventBus } from '@/core/events/eventBus';

export interface AppError {
  code: string;
  message: string;
  fatal?: boolean;
  context?: Record<string, unknown>;
  timestamp: number;
}

export interface ErrorHandlerOptions {
  onUnhandled?: (_error: AppError) => void;
}

class ErrorHandler {
  private onUnhandled?: (_error: AppError) => void;
  private history: AppError[] = [];
  private readonly maxHistory = 50;

  constructor(options: ErrorHandlerOptions = {}) {
    this.onUnhandled = options.onUnhandled;
    this.installGlobalHandlers();
  }

  private installGlobalHandlers(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('error', (event) => {
      this.handle({
        code: 'UNHANDLED_EXCEPTION',
        message: event.message ?? 'Unknown error',
        fatal: true,
        context: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason as Error | string | undefined;
      this.handle({
        code: 'UNHANDLED_REJECTION',
        message: reason instanceof Error ? reason.message : String(reason ?? 'Unknown rejection'),
        fatal: false,
        context: {},
      });
      event.preventDefault();
    });
  }

  handle(error: Omit<AppError, 'timestamp'>): AppError {
    const appError: AppError = { ...error, timestamp: Date.now() };
    this.history.push(appError);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    const log = appError.fatal === true ? logger.error : logger.warn;
    log(`[${appError.code}] ${appError.message}`, appError.context);

    eventBus.emit('app:error', { message: appError.message, fatal: Boolean(appError.fatal) });

    if (this.onUnhandled) {
      this.onUnhandled(appError);
    }

    return appError;
  }

  getHistory(): readonly AppError[] {
    return this.history.slice();
  }

  clearHistory(): void {
    this.history = [];
  }
}

export const errorHandler = new ErrorHandler();

/**
 * Wraps a fallible synchronous function into a Result.
 */
export function tryCatch<T>(fn: () => T): { ok: true; value: T } | { ok: false; error: AppError } {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    const appError = error instanceof Error
      ? { code: 'EXCEPTION', message: error.message, fatal: false, context: {} }
      : { code: 'UNKNOWN_ERROR', message: String(error), fatal: false, context: {} };
    return { ok: false, error: errorHandler.handle(appError) };
  }
}
