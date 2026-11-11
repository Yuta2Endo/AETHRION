import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // `import.meta.dirname` instead of `__dirname` — the native config
      // loader of Vite 8 does not provide `__dirname`.
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Split the heavy vendors into their own chunks so the application
        // chunk stays small and the vendors are cached independently.
        // Rolldown (Vite 8) requires the function form of `manualChunks`.
        manualChunks(id: string) {
          const path = id.replace(/\\/g, '/');
          if (!path.includes('node_modules/')) return undefined;
          if (path.includes('/framer-motion/') || path.includes('/motion-dom/') || path.includes('/motion-utils/')) {
            return 'motion';
          }
          if (path.includes('/react/') || path.includes('/react-dom/') || path.includes('/scheduler/')) {
            return 'react';
          }
          if (path.includes('/zustand/')) {
            return 'state';
          }
          return undefined;
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/tests/setup.ts',
    include: ['src/tests/**/*.test.ts', 'src/tests/**/*.test.tsx'],
  },
});
