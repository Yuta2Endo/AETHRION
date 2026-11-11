import { ChartLine, Buildings, ShieldCheck, Cpu } from '@phosphor-icons/react';

/**
 * Dashboard screen placeholder.
 * Identifies AETHRION and brand identity. Systems listed are planned for
 * future stages — none are implemented here (no fake gameplay).
 */
export function Dashboard() {
  return (
    <div className="dashboard-screen">
      <header className="dashboard-header">
        <div className="brand-block">
          <div className="brand-mark">A</div>
          <div>
            <div className="brand-name">AETHRION</div>
            <div className="brand-slogan">BUILD YOUR EMPIRE. SHAPE THE FUTURE.</div>
          </div>
        </div>
        <div className="dashboard-actions">
          <div className="stat">
            <div className="stat-value">0.1.0</div>
            <div className="stat-label">Stage</div>
          </div>
        </div>
      </header>

      <section className="dashboard-intro">
        <h1>Command Center</h1>
        <p>
          AETHRION technology empire simulator — project foundation initialized.
          Game systems are reserved for future development stages.
        </p>
      </section>

      <div className="dashboard-grid">
        {[ChartLine, Buildings, ShieldCheck, Cpu].map((Icon, i) => (
          <div key={i} className="dashboard-card">
            <div className="card-icon" aria-hidden="true">
              <Icon size={24} />
            </div>
            <div className="card-body">
              <div className="card-title">System {i + 1}</div>
              <div className="card-note">Planned — future stage</div>
            </div>
          </div>
        ))}
      </div>

      <footer className="dashboard-footer">
        <div className="badge brand-badge">Premium Neon Sci-Fi</div>
        <div className="version-text">AETHRION v0.1.0 — Stage 01 Foundation</div>
      </footer>
    </div>
  );
}
