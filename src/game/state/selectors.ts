/**
 * Typed selectors for the game state.
 *
 * Components subscribe through these selectors so that re-renders stay
 * narrow: a component watching one indicator does not re-render when an
 * unrelated slice changes.
 *
 * Every selector returns either a primitive or a stable slice reference.
 * Derived values (metrics, trends) are computed by the domain modules with
 * `useMemo` in the component, never duplicated here.
 */

import type { GameStoreState } from '@/game/state/gameStore';
import { getPlayerCorporation } from '@/simulation/corporation';

export const selectEmpire = (state: GameStoreState) => state.empire;
export const selectEmpireName = (state: GameStoreState) => state.empire.name;
export const selectEmpireCharter = (state: GameStoreState) => state.empire.charter;
export const selectEmpireFoundedOn = (state: GameStoreState) => state.empire.foundedOn;
export const selectHomeRegionId = (state: GameStoreState) => state.empire.homeRegionId;

export const selectWorld = (state: GameStoreState) => state.world;
export const selectRegions = (state: GameStoreState) => state.world.regions;
export const selectActiveRegionId = (state: GameStoreState) => state.world.activeRegionId;
export const selectWorldTick = (state: GameStoreState) => state.world.tick;

export const selectEconomy = (state: GameStoreState) => state.economy;
export const selectCommodities = (state: GameStoreState) => state.economy.commodities;
export const selectCurrencies = (state: GameStoreState) => state.economy.currencies;
export const selectEconomyTick = (state: GameStoreState) => state.economy.tick;

export const selectSimulation = (state: GameStoreState) => state.simulation;
export const selectSimulationStatus = (state: GameStoreState) => state.simulation.status;
export const selectSimulationTick = (state: GameStoreState) => state.simulation.tick;
export const selectSimulationSpeed = (state: GameStoreState) => state.simulation.speed;
export const selectSimulationDate = (state: GameStoreState) => state.simulation.date;
export const selectSimulationTime = (state: GameStoreState) => state.simulation.simTimeMs;
export const selectSimulationError = (state: GameStoreState) => state.simulation.lastError;

export const selectCorporationState = (state: GameStoreState) => state.corporation;
/** The player corporation, or null before it has been established. */
export const selectPlayerCorporation = (state: GameStoreState) =>
  getPlayerCorporation(state.corporation);
export const selectCorporationTick = (state: GameStoreState) => state.corporation.tick;

export const selectEmployeeState = (state: GameStoreState) => state.employees;
/** All employee records — a stable array reference between updates. */
export const selectEmployees = (state: GameStoreState) => state.employees.employees;
export const selectEmployeeCount = (state: GameStoreState) => state.employees.employees.length;

export const selectTechnologyState = (state: GameStoreState) => state.technology;
export const selectUnlockedTechnologies = (state: GameStoreState) => state.technology.unlocked;
export const selectResearchProjects = (state: GameStoreState) => state.technology.projects;

export const selectProductState = (state: GameStoreState) => state.products;
export const selectProductInstances = (state: GameStoreState) => state.products.instances;

export const selectResourceState = (state: GameStoreState) => state.resources;
export const selectResourceBalances = (state: GameStoreState) => state.resources.balances;
export const selectResourceTransactions = (state: GameStoreState) => state.resources.transactions;

export const selectProductionState = (state: GameStoreState) => state.production;
export const selectFacilities = (state: GameStoreState) => state.production.facilities;
export const selectProductionOrders = (state: GameStoreState) => state.production.orders;

export const selectMarketState = (state: GameStoreState) => state.market;
export const selectMarketListings = (state: GameStoreState) => state.market.listings;

export const selectCityState = (state: GameStoreState) => state.city;
/** The city record, or null when no city exists. */
export const selectCity = (state: GameStoreState) => state.city.city;
/** The districts of the city — a stable reference, or undefined without a city. */
export const selectCityDistricts = (state: GameStoreState) => state.city.city?.districts;
/** The land plots of the city — a stable reference, or undefined without a city. */
export const selectCityPlots = (state: GameStoreState) => state.city.city?.plots;
/** The city buildings — a stable reference, or undefined without a city. */
export const selectCityBuildings = (state: GameStoreState) => state.city.city?.buildings;
/** The aggregated urban figures — a stable reference, or undefined without a city. */
export const selectCityStatistics = (state: GameStoreState) => state.city.city?.statistics;

export const selectEventsState = (state: GameStoreState) => state.events;
/** The global events that are currently active — a stable reference. */
export const selectActiveEvents = (state: GameStoreState) => state.events.activeEvents;
/** The bounded event history — a stable reference. */
export const selectEventHistory = (state: GameStoreState) => state.events.history;
/** The news feed — a stable reference. */
export const selectNews = (state: GameStoreState) => state.events.news;

export const selectCompetitorsState = (state: GameStoreState) => state.competitors;
/** The AI corporations — a stable reference. */
export const selectCompetitors = (state: GameStoreState) => state.competitors.competitors;
