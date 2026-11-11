import { AppShell } from '@/app/layouts/AppShell';

/**
 * AETHRION application root.
 *
 * Stage 01: foundation only. Renders the branded application shell.
 * Future stages will inject game systems behind navigation routes.
 */
export default function App() {
  return <AppShell />;
}
