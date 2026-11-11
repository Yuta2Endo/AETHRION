/**
 * Environment configuration.
 * Centralized access to Vite env variables. Provides typed defaults so the
 * application never reads `import.meta.env` directly throughout the codebase.
 */
export interface AppEnv {
  appName: string;
  appSlogan: string;
  appVersion: string;
  env: 'development' | 'production' | 'test';
  debug: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  apiBaseUrl: string;
  enableSimulationWorker: boolean;
}

function readEnv(): AppEnv {
  return {
    appName: (import.meta.env.VITE_APP_NAME as string | undefined) ?? 'AETHRION',
    appSlogan:
      (import.meta.env.VITE_APP_SLOGAN as string | undefined) ??
      'BUILD YOUR EMPIRE. SHAPE THE FUTURE.',
    appVersion: (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '0.1.0',
    env: ((import.meta.env.VITE_ENV as string | undefined) ??
      (import.meta.env.DEV ? 'development' : 'production')) as AppEnv['env'],
    debug: (import.meta.env.VITE_DEBUG as string | undefined)?.toLowerCase() === 'true',
    logLevel: ((import.meta.env.VITE_LOG_LEVEL as string | undefined) ??
      'info') as AppEnv['logLevel'],
    apiBaseUrl:
      (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:5173/api',
    enableSimulationWorker:
      (import.meta.env.VITE_ENABLE_SIMULATION_WORKER as string | undefined)?.toLowerCase() ===
      'true',
  };
}

export const env = readEnv();

export default env;
