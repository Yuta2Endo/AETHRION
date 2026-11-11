import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Hamburger, ShieldCheck, ChartLine, Gear } from '@phosphor-icons/react';
import { MainNavigation } from '@/app/navigation/MainNavigation';
import { useAppStore } from '@/app/providers/AppProvider';
import { LoadingScreen } from '@/ui/screens/LoadingScreen';
import { Dashboard } from '@/ui/screens/Dashboard';

/**
 * Main application shell.
 * Provides the persistent navigation shell and responsive layout.
 * Shows a branded loading screen while the app initializes, then the
 * dashboard. Game simulation remains independent of this shell.
 */
export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const { theme, toggleTheme } = useAppStore();

  useEffect(() => {
    // Simulate foundation initialization, then reveal the dashboard.
    const timer = setTimeout(() => setInitialized(true), 700);
    return () => clearTimeout(timer);
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
