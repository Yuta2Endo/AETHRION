/**
 * Command layer — the only entry point for player actions.
 *
 * The interface calls commands; commands validate, apply the domain rules and
 * write the result to the game state. No simulation rule is ever executed
 * inside a React component.
 *
 * Every command returns a typed `Result` so the interface can display a
 * precise validation message. A failed command leaves the state unchanged.
 */

export {
  createPlayerCorporation,
  dismissEmployeeCommand,
  hireEmployeeCommand,
} from './corporationCommands';
export type {
  CreateCorporationCommand,
  HireEmployeeCommand,
} from './corporationCommands';

export { cancelResearchCommand, startResearchCommand } from './technologyCommands';
export type { StartResearchCommand } from './technologyCommands';

export {
  assignProductEmployeesCommand,
  setProductPriceCommand,
  setProductSalesActiveCommand,
  startProductDevelopmentCommand,
} from './productCommands';
export type { StartProductDevelopmentCommand } from './productCommands';

export { purchaseResourceCommand } from './resourceCommands';
export type { PurchaseResourceCommand } from './resourceCommands';

export {
  assignFacilityEmployeesCommand,
  cancelProductionCommand,
  createFacilityCommand,
  startProductionCommand,
} from './productionCommands';
export type {
  CreateFacilityCommand,
  StartProductionCommand,
} from './productionCommands';

export {
  assignBuildingCommand,
  cancelConstructionCommand,
  demolishBuildingCommand,
  purchaseLandCommand,
  renameCityCommand,
  resumeBuildingCommand,
  sellLandCommand,
  startConstructionCommand,
  suspendBuildingCommand,
  unassignBuildingCommand,
} from './cityCommands';
export type { StartConstructionCommand } from './cityCommands';

export { failure } from './shared';

import { createPlayerCorporation, dismissEmployeeCommand, hireEmployeeCommand } from './corporationCommands';
import { cancelResearchCommand, startResearchCommand } from './technologyCommands';
import {
  assignProductEmployeesCommand,
  setProductPriceCommand,
  setProductSalesActiveCommand,
  startProductDevelopmentCommand,
} from './productCommands';
import { purchaseResourceCommand } from './resourceCommands';
import {
  assignFacilityEmployeesCommand,
  cancelProductionCommand,
  createFacilityCommand,
  startProductionCommand,
} from './productionCommands';
import {
  assignBuildingCommand,
  cancelConstructionCommand,
  demolishBuildingCommand,
  purchaseLandCommand,
  renameCityCommand,
  resumeBuildingCommand,
  sellLandCommand,
  startConstructionCommand,
  suspendBuildingCommand,
  unassignBuildingCommand,
} from './cityCommands';

/**
 * All player commands, grouped for convenient access from the interface.
 */
export const commands = {
  // Corporation & workforce
  createCorporation: createPlayerCorporation,
  hireEmployee: hireEmployeeCommand,
  dismissEmployee: dismissEmployeeCommand,
  // Research
  startResearch: startResearchCommand,
  cancelResearch: cancelResearchCommand,
  // Products
  startProductDevelopment: startProductDevelopmentCommand,
  assignProductEmployees: assignProductEmployeesCommand,
  setProductPrice: setProductPriceCommand,
  setProductSalesActive: setProductSalesActiveCommand,
  // Resources
  purchaseResource: purchaseResourceCommand,
  // Production
  createFacility: createFacilityCommand,
  assignFacilityEmployees: assignFacilityEmployeesCommand,
  startProduction: startProductionCommand,
  cancelProduction: cancelProductionCommand,
  // City
  purchaseLand: purchaseLandCommand,
  sellLand: sellLandCommand,
  startConstruction: startConstructionCommand,
  cancelConstruction: cancelConstructionCommand,
  assignBuilding: assignBuildingCommand,
  unassignBuilding: unassignBuildingCommand,
  suspendBuilding: suspendBuildingCommand,
  resumeBuilding: resumeBuildingCommand,
  demolishBuilding: demolishBuildingCommand,
  renameCity: renameCityCommand,
};
