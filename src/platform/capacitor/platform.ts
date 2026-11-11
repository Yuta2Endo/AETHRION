export interface PlatformInfo {
  isNative: boolean;
  platform: 'android' | 'ios' | 'web';
  hasCapacitor: boolean;
}

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
};

function getCapacitor(): CapacitorGlobal | undefined {
  return (globalThis as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

export function getPlatformInfo(): PlatformInfo {
  const cap = getCapacitor();
  const hasCapacitor = !!cap && typeof cap.getPlatform === 'function';
  const platformRaw = hasCapacitor ? cap!.getPlatform!() : 'web';
  const platform = platformRaw === 'android' || platformRaw === 'ios' ? platformRaw : 'web';
  const isNative = hasCapacitor && typeof cap!.isNativePlatform === 'function' ? !!cap!.isNativePlatform!() : false;

  return { isNative, platform, hasCapacitor };
}

export function isAndroidNative(): boolean {
  const info = getPlatformInfo();
  return info.isNative && info.platform === 'android';
}