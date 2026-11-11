/**
 * Deterministic city layout adapter.
 *
 * Derives a stable 3D layout from existing city identifiers and definitions.
 * The simulation state contains no spatial coordinates, so this mapping is the
 * single source of visual placement. The same simulation state always produces
 * the same layout.
 */

import type { City } from '@/simulation/city';
import type { CityLayout, DistrictLayout, PlotLayout, Vec3 } from '@/rendering/types';

const DISTRICT_ORDER = [
  'district_downtown',
  'district_industrial',
  'district_research',
  'district_residential',
  'district_energy',
] as const;

const DISTRICT_POSITIONS: Record<string, { x: number; z: number }> = {
  district_downtown: { x: 0, z: 0 },
  district_industrial: { x: -18, z: -12 },
  district_research: { x: 18, z: -12 },
  district_residential: { x: -18, z: 12 },
  district_energy: { x: 18, z: 12 },
};

const DISTRICT_SIZE = { width: 14, depth: 14 };
const PLOT_COLS = 3;
const PLOT_GAP = 0.4;
const PLOT_WIDTH = (DISTRICT_SIZE.width - PLOT_GAP * (PLOT_COLS + 1)) / PLOT_COLS;
const PLOT_DEPTH = (DISTRICT_SIZE.depth - PLOT_GAP * (2 + 1)) / 2;

function indexOfDistrict(districtId: string): number {
  const idx = DISTRICT_ORDER.indexOf(districtId as (typeof DISTRICT_ORDER)[number]);
  return idx === -1 ? DISTRICT_ORDER.length : idx;
}

function plotPosition(districtCenter: Vec3, plotIndex: number): Vec3 {
  const col = plotIndex % PLOT_COLS;
  const row = Math.floor(plotIndex / PLOT_COLS);
  const startX = districtCenter.x - DISTRICT_SIZE.width / 2 + PLOT_GAP + PLOT_WIDTH / 2;
  const startZ = districtCenter.z - DISTRICT_SIZE.depth / 2 + PLOT_GAP + PLOT_DEPTH / 2;

  return {
    x: startX + col * (PLOT_WIDTH + PLOT_GAP),
    y: 0,
    z: startZ + row * (PLOT_DEPTH + PLOT_GAP),
  };
}

export function buildCityLayout(city: City): CityLayout {
  const districts = [...city.districts].sort(
    (a, b) => indexOfDistrict(a.id) - indexOfDistrict(b.id) || a.id.localeCompare(b.id),
  );

  const byDistrictId: Record<string, DistrictLayout> = {};
  const byPlotId: Record<string, PlotLayout> = {};
  const districtLayouts: DistrictLayout[] = [];

  districts.forEach((district, index) => {
    const pos = DISTRICT_POSITIONS[district.id] ?? {
      x: (index % 3) * 18 - 18,
      z: Math.floor(index / 3) * 18 - 9,
    };
    const center: Vec3 = { x: pos.x, y: 0, z: pos.z };

    const districtPlots = district.plotIds
      .map((id) => city.plots.find((plot) => plot.id === id))
      .filter((plot): plot is NonNullable<typeof plot> => plot !== undefined);

    const plotLayouts: PlotLayout[] = districtPlots.map((plot, plotIndex) => {
      const layout: PlotLayout = {
        plotId: plot.id,
        districtId: district.id,
        index: plotIndex,
        position: plotPosition(center, plotIndex),
        size: { width: PLOT_WIDTH, depth: PLOT_DEPTH },
      };
      byPlotId[plot.id] = layout;
      return layout;
    });

    const layout: DistrictLayout = {
      districtId: district.id,
      type: district.type,
      name: district.name,
      index,
      center,
      size: DISTRICT_SIZE,
      plots: plotLayouts,
    };

    byDistrictId[district.id] = layout;
    districtLayouts.push(layout);
  });

  return { districts: districtLayouts, byDistrictId, byPlotId };
}

export function getDistrictWorldPosition(layout: CityLayout, districtId: string): Vec3 | null {
  return layout.byDistrictId[districtId]?.center ?? null;
}

export function getPlotWorldPosition(layout: CityLayout, plotId: string): Vec3 | null {
  return layout.byPlotId[plotId]?.position ?? null;
}