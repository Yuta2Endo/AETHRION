import { Gauge, Pulse, WarningCircle } from '@phosphor-icons/react';
import { Badge } from '@/ui/components';
import { useGameStore } from '@/game/state/gameStore';
import { selectPerformanceMetrics } from '@/game/state/selectors';

/**
 * Developer diagnostics.
 *
 * A compact, read-only view of the simulation execution. It shows the execution
 * mode, the status of the Worker and the bounded performance figures — never an
 * internal error, a stack trace or any sensitive information.
 */
export function DiagnosticsSection() {
  const metrics = useGameStore(selectPerformanceMetrics);

  const modeLabel =
    metrics.mode === 'worker' ? 'Worker' : metrics.mode === 'fallback' ? 'Main thread (fallback)' : 'Main thread';
  const modeVariant = metrics.mode === 'worker' ? 'ok' : metrics.mode === 'fallback' ? 'warning' : 'brand';

  return (
    <section className="section-block" aria-label="Simulation diagnostics">
      <h2 className="section-title">
        <Gauge size={18} aria-hidden="true" /> Simulation Diagnostics
      </h2>

      <div className="world-summary">
        <div className="stat-card">
          <div className="stat-label">
            <Pulse size={14} aria-hidden="true" /> Execution mode
          </div>
          <div className="stat-value">
            <Badge variant={modeVariant}>{modeLabel}</Badge>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Worker status</div>
          <div className="stat-value text-mono">
            {metrics.workerAvailable ? metrics.workerId ?? 'ready' : 'unavailable'}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Average tick</div>
          <div className="stat-value text-mono">
            {metrics.ticks === 0 ? '—' : `${metrics.averageTickMs.toFixed(2)} ms`}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Maximum tick</div>
          <div className="stat-value text-mono">
            {metrics.ticks === 0 ? '—' : `${metrics.maxTickMs.toFixed(2)} ms`}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Slow ticks</div>
          <div className="stat-value text-mono">{metrics.slowTickCount}</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Fallback activations</div>
          <div className="stat-value text-mono">{metrics.fallbackActivations}</div>
        </div>
      </div>

      {metrics.mode === 'fallback' ? (
        <p className="tech-description" role="status">
          <WarningCircle size={14} aria-hidden="true" /> The simulation is running on the main
          thread because the Worker is unavailable. The game remains fully usable.
        </p>
      ) : null}
    </section>
  );
}