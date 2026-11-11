/**
 * Simulation-to-rendering adapter.
 *
 * Extracts read-only visual state from the authoritative city model. No
 * simulation state is mutated.
 */

import type { City, CityBuilding, CityStatistics, District, LandPlot } from '@/simulation/city';
import type { BuildingVisualState, DistrictVisualState, PlotVisualState } from '@/rendering/types';

export interface CityVisualModel {
  cityId: string;
  name: string;
  statistics: CityStatistics;
  districts: DistrictVisualState[];
  plots: PlotVisualState[];
  buildings: BuildingVisualState[];
}

export function toDistrictVisualState(district: District, city: City): DistrictVisualState {
  const districtPlots = city.plots.filter((plot) => plot.districtId === district.id);
  const districtBuildings = city.buildings.filter(
    (building) => building.districtId === district.id && building.status !== 'demolished',
  );

  return {
    id: district.id,
    name: district.name,
    type: district.type,
    development: district.development,
    plotCount: districtPlots.length,
    ownedPlots: districtPlots.filter((plot) => plot.status === 'owned' || plot.status === 'occupied').length,
    occupiedPlots: districtPlots.filter((plot) => plot.status === 'occupied').length,
    buildingCount: districtBuildings.length,
    operationalBuildingCount: districtBuildings.filter((building) => building.status === 'operational').length,
  };
}

export function toPlotVisualState(plot: LandPlot, district: District): PlotVisualState {
  return {
    id: plot.id,
    districtId: plot.districtId,
    districtType: district.type,
    zoning: plot.zoning,
    status: plot.status,
    price: plot.price,
    buildingId: plot.buildingId,
    infrastructureAvailable: plot.infrastructureAvailable,
  };
}

export function toBuildingVisualState(building: CityBuilding): BuildingVisualState {
  return {
    id: building.id,
    name: building.name,
    typeId: building.typeId,
    category: building.category,
    districtId: building.districtId,
    plotId: building.plotId,
    status: building.status,
    progress: building.progress,
    workforceCapacity: building.workforceCapacity,
    operatingCostPerHour: building.operatingCostPerHour,
    infrastructureSatisfied: building.infrastructureSatisfied,
  };
}

export function buildCityVisualModel(city: City): CityVisualModel {
  const districtById = new Map(city.districts.map((district) => [district.id, district]));

  return {
    cityId: city.id,
    name: city.name,
    statistics: city.statistics,
    districts: city.districts.map((district) => toDistrictVisualState(district, city)),
    plots: city.plots.map((plot) => {
      const district = districtById.get(plot.districtId);
      return toPlotVisualState(plot, district ?? city.districts[0]);
    }),
    buildings: city.buildings
      .filter((building) => building.status !== 'demolished')
      .map((building) => toBuildingVisualState(building)),
  };
}

export function findDistrictVisual(model: CityVisualModel, districtId: string): DistrictVisualState | undefined {
  return model.districts.find((district) => district.id === districtId);
}

export function findPlotVisual(model: CityVisualModel, plotId: string): PlotVisualState | undefined {
  return model.plots.find((plot) => plot.id === plotId);
}

export function findBuildingVisual(model: CityVisualModel, buildingId: string): BuildingVisualState | undefined {
  return model.buildings.find((building) => building.id === buildingId);
}