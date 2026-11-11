import { useState } from 'react';
import type React from 'react';
import { House, Globe, Buildings, ChartLine, Users, MagnifyingGlass, Factory, MapPin, Rocket, ShieldWarning, X } from '@phosphor-icons/react';

interface MainNavigationProps {
  onClose: () => void;
}

interface NavigationItem {
  key: string;
  label: string;
  icon: React.ElementType;
  /**
   * ready   — implemented and interactive
   * baseline— implemented at baseline scope (Stage 02)
   * planned — reserved for a later stage, not implemented yet
   */
  status: 'ready' | 'baseline' | 'planned';
}

/**
 * Main navigation shell.
 * Items marked 'planned' are not implemented in Stage 01 — they are reserved
 * for future stages. No fake gameplay is exposed.
 */
export function MainNavigation({ onClose }: MainNavigationProps) {
  const [selected, setSelected] = useState<string>('dashboard');

  const items: NavigationItem[] = [
    { key: 'dashboard', label: 'Command Center', icon: House, status: 'ready' },
    { key: 'world', label: 'World Engine', icon: Globe, status: 'baseline' },
    { key: 'economy', label: 'Economy Engine', icon: ChartLine, status: 'baseline' },
    { key: 'corporation', label: 'Corporation', icon: Buildings, status: 'baseline' },
    { key: 'technology', label: 'Technology', icon: MagnifyingGlass, status: 'planned' },
    { key: 'production', label: 'Production', icon: Factory, status: 'planned' },
    { key: 'city', label: 'City Engine', icon: MapPin, status: 'planned' },
    { key: 'employees', label: 'Employees', icon: Users, status: 'baseline' },
    { key: 'competitors', label: 'Competitor AI', icon: ShieldWarning, status: 'planned' },
    { key: 'save', label: 'Save & Archive', icon: Rocket, status: 'planned' },
  ];

  return (
    <nav className="sidebar">
      <div className="sidebar-header">
        <div className="brand-mini">AETHRION</div>
        <button className="close-button" aria-label="Close navigation" onClick={onClose}>
          <X size={20} weight="fill" />
        </button>
      </div>

      <div className="sidebar-scroll">
        <ul className="nav-list">
          {items.map((item) => (
            <li key={item.key}>
              <button
                className={`nav-item ${selected === item.key ? 'active' : ''} ${item.status}`}
                aria-current={selected === item.key ? 'page' : undefined}
                onClick={() => {
                  setSelected(item.key);
                  onClose();
                }}
              >
                <item.icon size={18} weight={selected === item.key ? 'bold' : 'regular'} as any />
                <span className="nav-label">{item.label}</span>
                {item.status === 'planned' && (
                  <span className="nav-status">planned</span>
                )}
                {item.status === 'baseline' && (
                  <span className="nav-status nav-status--baseline">baseline</span>
                )}
              </button>
            </li>
          ))}
        </ul>

        <div className="nav-footer">
          <div className="nav-footer-label">Stage 03 — Corporation &amp; Employees</div>
          <div className="nav-footer-label text-muted">World, economy &amp; workforce live</div>
        </div>
      </div>
    </nav>
  );
}


