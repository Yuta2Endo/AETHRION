import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowsOutCardinal,
  Crosshair,
  Cube,
  GlobeHemisphereWest,
  Info,
  Target,
  WarningCircle,
} from '@phosphor-icons/react';
import { Badge, Button } from '@/ui/components';
import { useGameStore } from '@/game/state/gameStore';
import { selectCity } from '@/game/state/selectors';
import { WorldRenderer } from '@/rendering/core/WorldRenderer';
import { isWebGLAvailable } from '@/rendering/core/quality';
import { buildCityVisualModel, findBuildingVisual, findDistrictVisual, findPlotVisual } from '@/rendering/adapters/cityAdapter';
import type { SceneSelection } from '@/rendering/types';

export function WorldViewSection() {
  const city = useGameStore(selectCity);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<WorldRenderer | null>(null);

  const [selection, setSelection] = useState<SceneSelection | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [webgl, setWebgl] = useState<boolean>(() => isWebGLAvailable());
  const [ready, setReady] = useState(false);

  const model = useMemo(() => (city ? buildCityVisualModel(city) : null), [city]);

  useEffect(() => {
    setWebgl(isWebGLAvailable());
  }, []);

  useEffect(() => {
    if (!webgl) return;
    const container = containerRef.current;
    if (!container) return;

    let renderer: WorldRenderer;
    try {
      renderer = new WorldRenderer({
        container,
        onSelectionChange: (next) => setSelection(next),
        onError: (message) => setRenderError(message),
      });
    } catch (error) {
      setRenderError(error instanceof Error ? error.message : 'Failed to initialize the rendering engine.');
      return;
    }

    rendererRef.current = renderer;
    renderer.syncCity(city);
    renderer.start();
    setReady(true);

    return () => {
      rendererRef.current = null;
      renderer.dispose();
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webgl]);

  useEffect(() => {
    rendererRef.current?.syncCity(city);
  }, [city]);

  const resetCamera = () => rendererRef.current?.resetCamera();
  const focus = () => rendererRef.current?.focusSelection();
  const clearSelection = () => rendererRef.current?.setSelection(null);

  if (!webgl) {
    return (
      <section className="section-block" aria-label="World View">
        <h2 className="section-title">
          <GlobeHemisphereWest size={18} aria-hidden="true" /> World View
        </h2>
        <div className="panel world-view-fallback" role="status">
          <div className="world-view-fallback-head">
            <WarningCircle size={18} aria-hidden="true" />
            <strong>WebGL unavailable</strong>
          </div>
          <p className="tech-description">
            3D rendering is not available in this environment. The simulation continues normally. A basic city
            overview is shown below using the actual simulation data.
          </p>
          <CityFallbackOverview />
        </div>
      </section>
    );
  }

  return (
    <section className="section-block" aria-label="World View">
      <h2 className="section-title">
        <GlobeHemisphereWest size={18} aria-hidden="true" /> World View
      </h2>

      <div className="world-view-shell">
        <div className="panel world-view-viewport-panel">
          <div className="world-view-toolbar" role="toolbar" aria-label="World view controls">
            <div className="world-view-toolbar-group">
              <Button size="sm" variant="secondary" onClick={resetCamera} aria-label="Reset camera">
                <ArrowsOutCardinal size={14} aria-hidden="true" /> Reset
              </Button>
              <Button size="sm" variant="secondary" onClick={focus} disabled={!selection} aria-label="Focus selection">
                <Target size={14} aria-hidden="true" /> Focus
              </Button>
              <Button size="sm" variant="ghost" onClick={clearSelection} disabled={!selection} aria-label="Clear selection">
                Clear
              </Button>
            </div>
            <div className="world-view-toolbar-group world-view-hints">
              <Badge variant={ready ? 'ok' : 'pending'}>{ready ? 'Rendering' : 'Initializing'}</Badge>
              <span className="text-muted"><Crosshair size={12} aria-hidden="true" /> Tap/click to select</span>
            </div>
          </div>

          <div className="world-view-viewport" aria-label="3D city viewport">
            <div ref={containerRef} className="world-view-canvas-host" />
            {!city ? (
              <div className="world-view-overlay" role="status">
                <Cube size={20} aria-hidden="true" />
                <p>No city data available.</p>
              </div>
            ) : null}
            {renderError ? (
              <div className="world-view-overlay world-view-overlay--error" role="alert">
                <WarningCircle size={20} aria-hidden="true" />
                <p>{renderError}</p>
              </div>
            ) : null}
          </div>
          <p className="field-hint world-view-help">
            Orbit: drag • Zoom: wheel/pinch • Pan: right-drag/two-finger drag. Rendering visualizes the live
            simulation state and does not modify gameplay.
          </p>
        </div>

        <aside className="panel world-view-inspector" aria-label="Selection inspector">
          <h3 className="tech-group-title">
            <Info size={14} aria-hidden="true" /> Inspector
          </h3>
          {selection && model ? (
            <InspectorContent selection={selection} />
          ) : (
            <p className="tech-description">Select a district, plot or building in the World View to inspect its actual simulation data.</p>
          )}
        </aside>
      </div>

      {model ? <CityFallbackOverview compact /> : null}
    </section>
  );
}

function InspectorContent({ selection }: { selection: SceneSelection }) {
  const city = useGameStore(selectCity);
  const model = useMemo(() => (city ? buildCityVisualModel(city) : null), [city]);
  if (!model) return <p className="tech-description">No city data available.</p>;

  if (selection.kind === 'district') {
    const district = findDistrictVisual(model, selection.districtId);
    const raw = city?.districts.find((d) => d.id === selection.districtId);
    if (!district || !raw) return <p className="tech-description">District data unavailable.</p>;
    return (
      <div className="inspector-body">
        <div className="order-head"><span className="order-name">{district.name}</span><Badge variant="brand">{district.type}</Badge></div>
        <dl className="inspector-grid">
          <div><dt>District ID</dt><dd className="text-mono">{district.id}</dd></div>
          <div><dt>Development</dt><dd>{district.development.toFixed(1)} / 100</dd></div>
          <div><dt>Plots</dt><dd>{district.plotCount}</dd></div>
          <div><dt>Owned plots</dt><dd>{district.ownedPlots}</dd></div>
          <div><dt>Occupied plots</dt><dd>{district.occupiedPlots}</dd></div>
          <div><dt>Buildings</dt><dd>{district.buildingCount}</dd></div>
          <div><dt>Operational</dt><dd>{district.operationalBuildingCount}</dd></div>
        </dl>
      </div>
    );
  }

  if (selection.kind === 'plot') {
    const plot = findPlotVisual(model, selection.plotId);
    const raw = city?.plots.find((p) => p.id === selection.plotId);
    if (!plot || !raw) return <p className="tech-description">Plot data unavailable.</p>;
    return (
      <div className="inspector-body">
        <div className="order-head"><span className="order-name">Plot {plot.id}</span><Badge variant={plot.status === 'available' ? 'ok' : plot.status === 'occupied' ? 'brand' : 'pending'}>{plot.status}</Badge></div>
        <dl className="inspector-grid">
          <div><dt>District</dt><dd>{plot.districtId}</dd></div>
          <div><dt>Zoning</dt><dd>{plot.zoning}</dd></div>
          <div><dt>Price</dt><dd>{plot.price.toLocaleString()} A⟠</dd></div>
          <div><dt>Owner</dt><dd>{raw.ownerId ?? '—'}</dd></div>
          <div><dt>Building</dt><dd>{raw.buildingId ?? '—'}</dd></div>
          <div><dt>Infrastructure</dt><dd>{plot.infrastructureAvailable ? 'Available' : 'Unavailable'}</dd></div>
        </dl>
      </div>
    );
  }

  const building = findBuildingVisual(model, selection.buildingId);
  const raw = city?.buildings.find((b) => b.id === selection.buildingId);
  if (!building || !raw) return <p className="tech-description">Building data unavailable.</p>;
  return (
    <div className="inspector-body">
      <div className="order-head"><span className="order-name">{building.name}</span><Badge variant={building.status === 'operational' ? 'ok' : building.status === 'constructing' ? 'pending' : 'brand'}>{building.status}</Badge></div>
      <dl className="inspector-grid">
        <div><dt>Building ID</dt><dd className="text-mono">{building.id}</dd></div>
        <div><dt>Type</dt><dd>{building.typeId}</dd></div>
        <div><dt>Category</dt><dd>{building.category}</dd></div>
        <div><dt>District</dt><dd>{building.districtId}</dd></div>
        <div><dt>Plot</dt><dd>{building.plotId}</dd></div>
        <div><dt>Progress</dt><dd>{Math.round(building.progress * 100)}%</dd></div>
        <div><dt>Workforce cap.</dt><dd>{building.workforceCapacity}</dd></div>
        <div><dt>Operating cost</dt><dd>{building.operatingCostPerHour} /h</dd></div>
        <div><dt>Infra. satisfied</dt><dd>{building.infrastructureSatisfied ? 'Yes' : 'No'}</dd></div>
        <div><dt>Assigned employees</dt><dd>{raw.assignedEmployeeIds.length}</dd></div>
      </dl>
    </div>
  );
}

function CityFallbackOverview({ compact = false }: { compact?: boolean }) {
  const city = useGameStore(selectCity);
  if (!city) return <p className="tech-description">No city state available.</p>;

  return (
    <div className={compact ? 'world-view-fallback-compact' : 'world-view-fallback-grid'}>
      <div className="tech-meta">
        <span><strong>{city.name}</strong></span>
        <span>Level {city.level}</span>
        <span>Population {Math.round(city.population)}</span>
        <span>Buildings {city.statistics.buildingCount}</span>
        <span>Operational {city.statistics.operationalBuildingCount}</span>
      </div>
      {!compact ? (
        <div className="fallback-district-list">
          {city.districts.map((district) => {
            const plots = city.plots.filter((p) => p.districtId === district.id);
            const buildings = city.buildings.filter((b) => b.districtId === district.id && b.status !== 'demolished');
            return (
              <article key={district.id} className="panel fallback-district-card">
                <header className="order-head">
                  <span className="order-name">{district.name}</span>
                  <Badge variant="pending">{district.type}</Badge>
                </header>
                <div className="tech-meta">
                  <span>Dev {district.development.toFixed(1)}</span>
                  <span>Plots {plots.length}</span>
                  <span>Owned {plots.filter((p) => p.status === 'owned' || p.status === 'occupied').length}</span>
                  <span>Buildings {buildings.length}</span>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}