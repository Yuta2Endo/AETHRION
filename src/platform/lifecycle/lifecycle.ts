import { getPlatformInfo } from '@/platform/capacitor/platform';

export type AppLifecycleState = 'active' | 'background';

export interface LifecycleHandlers {
  onPause?: () => void;
  onResume?: () => void;
  onBackButton?: () => boolean | void;
}

type Listener = { remove?: () => Promise<void> | void };

type AppPluginLike = {
  addListener?: (eventName: string, cb: (...args: any[]) => void) => Promise<Listener> | Listener;
};

function getAppPlugin(): AppPluginLike | undefined {
  const cap = (globalThis as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
  return cap?.Plugins?.App as AppPluginLike | undefined;
}

export function createLifecycleManager(handlers: LifecycleHandlers = {}) {
  let state: AppLifecycleState = typeof document !== 'undefined' && document.visibilityState === 'hidden' ? 'background' : 'active';
  let disposed = false;
  const removers: Array<() => void> = [];

  const setState = (next: AppLifecycleState) => {
    if (state === next) return;
    state = next;
    if (next === 'background') handlers.onPause?.();
    else handlers.onResume?.();
  };

  const onVisibility = () => {
    if (typeof document === 'undefined') return;
    setState(document.visibilityState === 'hidden' ? 'background' : 'active');
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
    removers.push(() => document.removeEventListener('visibilitychange', onVisibility));
  }

  // Capacitor App plugin integration when available (no hard dependency).
  const app = getAppPlugin();
  const info = getPlatformInfo();
  if (info.hasCapacitor && app?.addListener) {
    try {
      const pauseSub = app.addListener('pause', () => setState('background'));
      Promise.resolve(pauseSub).then((sub) => {
        if (disposed) { void sub?.remove?.(); return; }
        if (sub?.remove) removers.push(() => { void sub.remove!(); });
      }).catch(() => undefined);

      const resumeSub = app.addListener('resume', () => setState('active'));
      Promise.resolve(resumeSub).then((sub) => {
        if (disposed) { void sub?.remove?.(); return; }
        if (sub?.remove) removers.push(() => { void sub.remove!(); });
      }).catch(() => undefined);

      const backSub = app.addListener('backButton', () => {
        const handled = handlers.onBackButton?.();
        if (handled === true) return;
        // Default: let system/minimize behavior occur in native shell when not handled.
      });
      Promise.resolve(backSub).then((sub) => {
        if (disposed) { void sub?.remove?.(); return; }
        if (sub?.remove) removers.push(() => { void sub.remove!(); });
      }).catch(() => undefined);
    } catch {
      // ignore: plugin unavailable
    }
  }

  return {
    getState: () => state,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      removers.splice(0).forEach((remove) => {
        try { remove(); } catch { /* ignore */ }
      });
    },
  };
}