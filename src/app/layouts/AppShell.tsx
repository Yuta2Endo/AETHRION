import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Hamburger, ShieldCheck, ChartLine, Gear } from '@phosphor-icons/react';
import { MainNavigation } from '@/app/navigation/MainNavigation';
import { useAppStore } from '@/app/providers/AppProvider';
import { LoadingScreen } from '@/ui/screens/LoadingScreen';
import { Dashboard } from '@/ui/screens/Dashboard';
import { simulation } from '@/game/simulationRunner';
import { createLifecycleManager } from '@/platform/lifecycle/lifecycle';

/**
 * Main application shell.
 * Provides the persistent navigation shell and responsive layout, and boots the
 * simulation. The loading screen is shown until the simulation has produced
 * its first tick — it reflects real initialisation, not a fixed delay.
 * Game simulation remains independent of this shell.
 */
export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const { theme, toggleTheme } = useAppStore();
  const sidebarOpenRef = useRef(false);

  useEffect(() => {
    sidebarOpenRef.current = sidebarOpen;
  }, [sidebarOpen]);

  useEffect(() => {
    const engine = simulation.getEngine();

    // The application is initialised once the simulation produced real state.
    const unsubscribe = engine.onTick(() => setInitialized(true));

    simulation.start();

    // Fallback so a stalled simulation never leaves the user on the loading screen.
    const fallback = setTimeout(() => setInitialized(true), 3000);

    const lifecycle = createLifecycleManager({
      onBackButton: () => {
        if (sidebarOpenRef.current) {
          setSidebarOpen(false);
          return true;
        }
        return false;
      },
    });

    return () => {
      unsubscribe();
      clearTimeout(fallback);
      lifecycle.dispose();
      simulation.stop();
    };
  }, []);

  if (!initialized) {
    return <LoadingScreen />;
  }

  return (
    <div className="app-shell" data-theme={theme}>
      {/* Top bar */}
      <header className="app-header">
        <button
          className="menu-button"
          aria-label="Toggle navigation"
          onClick={() => setSidebarOpen((o) => !o)}
        >
          <Hamburger size={22} weight="fill" />
        </button>
        <div className="app-brand">
          <div className="brand-mark">A</div>
          <div className="brand-text">
            <span className="brand-name">AETHRION</span>
            <span className="brand-slogan">
              BUILD YOUR EMPIRE. SHAPE THE FUTURE.
            </span>
          </div>
        </div>
        <div className="app-header-actions">
          <button className="icon-button" aria-label="Theme" onClick={toggleTheme}>
            <ShieldCheck size={20} />
          </button>
          <button className="icon-button" aria-label="Dashboard">
            <ChartLine size={20} />
          </button>
          <button className="icon-button" aria-label="Settings">
            <Gear size={20} />
          </button>
        </div>
      </header>

      {/* Sidebar overlay */}
      <motion.aside
        initial={{ x: '-100%' }}
        animate={sidebarOpen ? { x: 0 } : { x: '-100%' }}
        exit={{ x: '-100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="sidebar-overlay"
        onClick={() => setSidebarOpen(false)}
        style={{ display: sidebarOpen ? 'block' : 'none' }}
      >
        <div className="sidebar-backdrop" onClick={(e) => e.stopPropagation()} />
        <MainNavigation onClose={() => setSidebarOpen(false)} />
      </motion.aside>

      {/* Main content area */}
      <main className="app-main">
        <div className="app-content">
          <Dashboard />
        </div>
      </main>
    </div>
  );
}
