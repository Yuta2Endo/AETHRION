import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aethrion.app',
  appName: 'AETHRION',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
