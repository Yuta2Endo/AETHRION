/**
 * Technology Research Engine — data model.
 *
 * The technology tree is a **data driven table**: a new technology is added
 * by extending `TECHNOLOGIES` and the `TechnologyId` union. The engine never
 * hardcodes individual technologies.
 */

import { isFiniteNumber } from '@/core/utils';
import type { ProfessionId } from '@/simulation/employees';

export type TechnologyCategory =
  | 'computing'
  | 'materials'
  | 'energy'
  | 'automation'
  | 'manufacturing'
  | 'ai';

export type TechnologyId = string;

/**
 * Effects a technology unlocks.
 * Every field is a multiplier or an additive bonus; 1 means "no change".
 */
export interface TechnologyEffects {
  /** Multiplier on the manufacturing output. */
  productionEfficiency?: number;
  /** Multiplier on the research speed. */
  researchSpeed?: number;
  /** Additive bonus to the quality of developed products. */
  qualityBonus?: number;
  /** Multiplier on the market demand for products. */
  marketReach?: number;
  /** Multiplier on the resource yield of purchases. */
  resourceYield?: number;
}

export interface TechnologyDefinition {
  id: TechnologyId;
  name: string;
  description: string;
  category: TechnologyCategory;
  /** Research cost charged when the project starts. */
  researchCost: number;
  /** Simulated milliseconds of work required at full contribution. */
  researchDurationMs: number;
  /** Technologies that must be unlocked first. */
  requires: TechnologyId[];
  /** Minimum corporation tier required to start the research. */
  requiresTier?: string;
  /** Profession that contributes efficiently. */
  requiredProfession?: ProfessionId;
  /** Skill level that yields a full contribution. */
  requiredSkill?: number;
  effects: TechnologyEffects;
}

const HOUR = 3_600_000;

export const TECHNOLOGIES: readonly TechnologyDefinition[] = [
  // ----------------------------------------------------------- Computing
  {
    id: 'quantum-lattice',
    name: 'Quantum Lattice',
    description: 'A stable substrate for quantum-scale computation.',
    category: 'computing',
    researchCost: 2_500,
    researchDurationMs: 24 * HOUR,
    requires: [],
    requiredProfession: 'researcher',
    requiredSkill: 30,
    effects: { productionEfficiency: 1.05 },
  },
  {
    id: 'photonic-cores',
    name: 'Photonic Cores',
    description: 'Light-based processors that outperform electronic silicon.',
    category: 'computing',
    researchCost: 3_800,
    researchDurationMs: 30 * HOUR,
    requires: ['quantum-lattice'],
    requiredProfession: 'researcher',
    requiredSkill: 40,
    effects: { productionEfficiency: 1.08, researchSpeed: 1.05 },
  },
  {
    id: 'neural-array',
    name: 'Neural Array',
    description: 'Dense adaptive compute fabric for machine cognition.',
    category: 'computing',
    researchCost: 6_200,
    researchDurationMs: 42 * HOUR,
    requires: ['photonic-cores'],
    requiredProfession: 'researcher',
    requiredSkill: 50,
    effects: { qualityBonus: 0.05, researchSpeed: 1.1 },
  },
  {
    id: 'distributed-intelligence',
    name: 'Distributed Intelligence',
    description: 'Swarm intelligence spanning an entire corporate network.',
    category: 'computing',
    researchCost: 9_500,
    researchDurationMs: 60 * HOUR,
    requires: ['neural-array'],
    requiredProfession: 'researcher',
    requiredSkill: 55,
    effects: { researchSpeed: 1.15, qualityBonus: 0.05 },
  },

  // ----------------------------------------------------------- Materials
  {
    id: 'nano-alloy',
    name: 'Nano Alloy',
    description: 'Molecularly bonded metals with exceptional strength.',
    category: 'materials',
    researchCost: 2_200,
    researchDurationMs: 22 * HOUR,
    requires: [],
    requiredProfession: 'researcher',
    requiredSkill: 28,
    effects: { resourceYield: 1.1 },
  },
  {
    id: 'smart-polymers',
    name: 'Smart Polymers',
    description: 'Self-healing synthetic materials for industry.',
    category: 'materials',
    researchCost: 3_400,
    researchDurationMs: 28 * HOUR,
    requires: ['nano-alloy'],
    requiredProfession: 'researcher',
    requiredSkill: 38,
    effects: { resourceYield: 1.08, qualityBonus: 0.03 },
  },
  {
    id: 'meta-ceramics',
    name: 'Meta Ceramics',
    description: 'Engineered ceramics that survive extreme conditions.',
    category: 'materials',
    researchCost: 5_100,
    researchDurationMs: 38 * HOUR,
    requires: ['smart-polymers'],
    requiredProfession: 'engineer',
    requiredSkill: 45,
    effects: { qualityBonus: 0.06, productionEfficiency: 1.05 },
  },

  // -------------------------------------------------------------- Energy
  {
    id: 'helion-fusion',
    name: 'Helion Fusion',
    description: 'Compact fusion cells usable outside a star.',
    category: 'energy',
    researchCost: 3_000,
    researchDurationMs: 26 * HOUR,
    requires: [],
    requiredProfession: 'researcher',
    requiredSkill: 32,
    effects: { resourceYield: 1.12 },
  },
  {
    id: 'antimatter-capacitor',
    name: 'Antimatter Capacitor',
    description: 'Safe containment of exotic matter for industrial power.',
    category: 'energy',
    researchCost: 5_800,
    researchDurationMs: 40 * HOUR,
    requires: ['helion-fusion'],
    requiredProfession: 'engineer',
    requiredSkill: 46,
    effects: { productionEfficiency: 1.1 },
  },
  {
    id: 'zero-point-tap',
    name: 'Zero-Point Tap',
    description: 'Draws power directly from the quantum vacuum.',
    category: 'energy',
    researchCost: 8_900,
    researchDurationMs: 56 * HOUR,
    requires: ['antimatter-capacitor'],
    requiredProfession: 'engineer',
    requiredSkill: 58,
    effects: { productionEfficiency: 1.15, marketReach: 1.1 },
  },

  // ----------------------------------------------------------- Automation
  {
    id: 'robotic-assembly',
    name: 'Robotic Assembly',
    description: 'General purpose industrial assembly robots.',
    category: 'automation',
    researchCost: 2_800,
    researchDurationMs: 24 * HOUR,
    requires: [],
    requiredProfession: 'engineer',
    requiredSkill: 30,
    effects: { productionEfficiency: 1.12 },
  },
  {
    id: 'adaptive-logistics',
    name: 'Adaptive Logistics',
    description: 'Self-optimising supply routing across every facility.',
    category: 'automation',
    researchCost: 4_600,
    researchDurationMs: 34 * HOUR,
    requires: ['robotic-assembly'],
    requiredProfession: 'engineer',
    requiredSkill: 40,
    effects: { resourceYield: 1.1, marketReach: 1.05 },
  },
  {
    id: 'self-replicating-systems',
    name: 'Self-Replicating Systems',
    description: 'Production lines that reproduce their own tooling.',
    category: 'automation',
    researchCost: 7_600,
    researchDurationMs: 50 * HOUR,
    requires: ['adaptive-logistics'],
    requiredProfession: 'engineer',
    requiredSkill: 52,
    effects: { productionEfficiency: 1.2 },
  },

  // -------------------------------------------------------- Manufacturing
  {
    id: 'precision-fabrication',
    name: 'Precision Fabrication',
    description: 'Sub-micron machining for exact industrial parts.',
    category: 'manufacturing',
    researchCost: 2_600,
    researchDurationMs: 24 * HOUR,
    requires: ['nano-alloy'],
    requiredProfession: 'engineer',
    requiredSkill: 34,
    effects: { productionEfficiency: 1.07, qualityBonus: 0.04 },
  },
  {
    id: 'molecular-assembly',
    name: 'Molecular Assembly',
    description: 'Building products one molecule at a time.',
    category: 'manufacturing',
    researchCost: 7_200,
    researchDurationMs: 48 * HOUR,
    requires: ['precision-fabrication', 'robotic-assembly'],
    requiredProfession: 'engineer',
    requiredSkill: 50,
    effects: { qualityBonus: 0.08, productionEfficiency: 1.1 },
  },

  // ------------------------------------------------------------------- AI
  {
    id: 'cognitive-architecture',
    name: 'Cognitive Architecture',
    description: 'Machine cognition modelled on adaptive reasoning.',
    category: 'ai',
    researchCost: 4_200,
    researchDurationMs: 34 * HOUR,
    requires: ['neural-array'],
    requiredProfession: 'researcher',
    requiredSkill: 44,
    effects: { researchSpeed: 1.12, qualityBonus: 0.05 },
  },
  {
    id: 'predictive-intelligence',
    name: 'Predictive Intelligence',
    description: 'Forecasting models that anticipate market shifts.',
    category: 'ai',
    researchCost: 6_400,
    researchDurationMs: 44 * HOUR,
    requires: ['cognitive-architecture'],
    requiredProfession: 'researcher',
    requiredSkill: 50,
    effects: { marketReach: 1.08, researchSpeed: 1.06 },
  },
  {
    id: 'adaptive-algorithms',
    name: 'Adaptive Algorithms',
    description: 'Self-improving optimisation across the corporation.',
    category: 'ai',
    researchCost: 8_400,
    researchDurationMs: 54 * HOUR,
    requires: ['predictive-intelligence'],
    requiredProfession: 'researcher',
    requiredSkill: 56,
    effects: { qualityBonus: 0.07, researchSpeed: 1.08 },
  },

  // ---------------------------------------------------- Cross-category
  {
    id: 'quantum-commerce',
    name: 'Quantum Commerce',
    description: 'Instantaneous, trustless trade across every market.',
    category: 'computing',
    researchCost: 10_500,
    researchDurationMs: 64 * HOUR,
    requires: ['distributed-intelligence', 'adaptive-algorithms'],
    requiredProfession: 'engineer',
    requiredSkill: 58,
    effects: { marketReach: 1.15 },
  },
  {
    id: 'planetary-scale-compute',
    name: 'Planetary-Scale Compute',
    description: 'A distributed compute fabric spanning the whole empire.',
    category: 'computing',
    researchCost: 14_000,
    researchDurationMs: 80 * HOUR,
    requires: ['zero-point-tap', 'molecular-assembly', 'quantum-commerce'],
    requiredProfession: 'engineer',
    requiredSkill: 64,
    effects: { productionEfficiency: 1.25, marketReach: 1.12, qualityBonus: 0.1 },
  },
];

export const TECHNOLOGY_CATEGORIES: readonly TechnologyCategory[] = [
  'computing',
  'materials',
  'energy',
  'automation',
  'manufacturing',
  'ai',
];

/**
 * Status of a technology with respect to the current state.
 */
export type TechnologyStatus = 'locked' | 'available' | 'researching' | 'completed';

export type ResearchProjectStatus = 'active' | 'completed' | 'cancelled';

export interface ResearchProject {
  id: string;
  technologyId: TechnologyId;
  status: ResearchProjectStatus;
  /** Completion between 0 and 1. */
  progress: number;
  assignedEmployeeIds: string[];
  /** Research cost already charged. */
  costPaid: number;
  startedAtSimMs: number;
  completedAtSimMs: number | null;
}

export interface ResearchHistoryEntry {
  technologyId: TechnologyId;
  projectId: string;
  outcome: 'completed' | 'cancelled';
  simTimeMs: number;
  employeeIds: string[];
}

export interface TechnologyState {
  /** Identifiers of the completed technologies. */
  unlocked: TechnologyId[];
  projects: ResearchProject[];
  history: ResearchHistoryEntry[];
  /** Sequence used to generate unique, deterministic project ids. */
  sequence: number;
  tick: number;
}

/** Maximum number of research history entries kept. */
export const MAX_RESEARCH_HISTORY = 24;
/** Maximum number of research projects kept (active and finished). */
export const MAX_RESEARCH_PROJECTS = 24;

export function createInitialTechnologyState(): TechnologyState {
  return {
    unlocked: [],
    projects: [],
    history: [],
    sequence: 0,
    tick: 0,
  };
}

export function getTechnologyDefinition(id: TechnologyId): TechnologyDefinition | undefined {
  return TECHNOLOGIES.find((technology) => technology.id === id);
}

export function isValidTechnologyDefinition(definition: TechnologyDefinition): boolean {
  if (!definition || typeof definition.id !== 'string' || definition.id.length === 0) return false;
  if (typeof definition.name !== 'string' || definition.name.length === 0) return false;
  if (!TECHNOLOGY_CATEGORIES.includes(definition.category)) return false;
  if (!isFiniteNumber(definition.researchCost) || definition.researchCost <= 0) return false;
  if (!isFiniteNumber(definition.researchDurationMs) || definition.researchDurationMs <= 0) {
    return false;
  }
  if (!Array.isArray(definition.requires)) return false;
  return true;
}

export function isValidTechnologyState(state: TechnologyState): boolean {
  if (!state || !Array.isArray(state.unlocked)) return false;
  if (!Array.isArray(state.projects)) return false;
  if (!Array.isArray(state.history)) return false;
  if (state.history.length > MAX_RESEARCH_HISTORY) return false;
  if (!isFiniteNumber(state.sequence) || state.sequence < 0) return false;
  if (!isFiniteNumber(state.tick) || state.tick < 0) return false;

  const unlocked = new Set(state.unlocked);
  if (unlocked.size !== state.unlocked.length) return false;
  for (const id of state.unlocked) {
    if (!getTechnologyDefinition(id)) return false;
  }

  const projectIds = new Set<string>();
  for (const project of state.projects) {
    if (!project || typeof project.id !== 'string' || project.id.length === 0) return false;
    if (projectIds.has(project.id)) return false;
    projectIds.add(project.id);
    if (!getTechnologyDefinition(project.technologyId)) return false;
    if (!isFiniteNumber(project.progress) || project.progress < 0 || project.progress > 1) return false;
    if (!isFiniteNumber(project.costPaid) || project.costPaid < 0) return false;
  }

  return true;
}

export function findResearchProject(
  state: TechnologyState,
  projectId: string,
): ResearchProject | undefined {
  return state.projects.find((project) => project.id === projectId);
}
