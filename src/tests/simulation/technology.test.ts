import { describe, it, expect } from 'vitest';
import {
  TECHNOLOGIES,
  TECHNOLOGY_CATEGORIES,
  advanceResearch,
  canStartResearch,
  cancelResearch,
  createInitialTechnologyState,
  getEmployeeContribution,
  getResearchContribution,
  getTechnologyDefinition,
  getTechnologyStatus,
  getUnlockedEffects,
  isValidTechnologyDefinition,
  isValidTechnologyState,
  startResearch,
} from '@/simulation/technology';
import { HOUR, makeEmployee, makeTechnologyState } from '@/tests/helpers/fixtures';

describe('Technology Engine — definitions', () => {
  it('defines a technology tree of the required size', () => {
    expect(TECHNOLOGIES.length).toBeGreaterThanOrEqual(20);
  });

  it('covers every required category', () => {
    expect(TECHNOLOGY_CATEGORIES).toEqual(
      expect.arrayContaining([
        'computing',
        'materials',
        'energy',
        'automation',
        'manufacturing',
        'ai',
      ]),
    );
  });

  it('uses unique identifiers', () => {
    const ids = TECHNOLOGIES.map((technology) => technology.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('defines valid technologies', () => {
    TECHNOLOGIES.forEach((technology) => {
      expect(isValidTechnologyDefinition(technology)).toBe(true);
      expect(technology.description.length).toBeGreaterThan(0);
      expect(technology.requires.length).toBeGreaterThanOrEqual(0);
    });
  });

  it('only requires technologies that exist', () => {
    TECHNOLOGIES.forEach((technology) => {
      technology.requires.forEach((requirement) => {
        expect(getTechnologyDefinition(requirement)).toBeDefined();
      });
    });
  });

  it('has no circular prerequisites', () => {
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const walk = (id: string): void => {
      if (visited.has(id)) return;
      if (visiting.has(id)) throw new Error(`Circular dependency on ${id}`);
      visiting.add(id);
      const definition = getTechnologyDefinition(id);
      definition?.requires.forEach(walk);
      visiting.delete(id);
      visited.add(id);
    };

    TECHNOLOGIES.forEach((technology) => walk(technology.id));
  });
});

describe('Technology Engine — prerequisites', () => {
  it('marks a technology without prerequisites as available', () => {
    const state = createInitialTechnologyState();
    const definition = getTechnologyDefinition('quantum-lattice')!;

    expect(getTechnologyStatus(state, definition, 'startup')).toBe('available');
    expect(canStartResearch(state, definition, 'startup').ok).toBe(true);
  });

  it('locks a technology whose prerequisites are missing', () => {
    const state = createInitialTechnologyState();
    const definition = getTechnologyDefinition('photonic-cores')!;

    expect(getTechnologyStatus(state, definition, 'startup')).toBe('locked');
    const result = canStartResearch(state, definition, 'startup');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('TECHNOLOGY_MISSING_PREREQUISITE');
  });

  it('unlocks a technology once the prerequisites are researched', () => {
    const state = makeTechnologyState({ unlocked: ['quantum-lattice'] });
    const definition = getTechnologyDefinition('photonic-cores')!;

    expect(getTechnologyStatus(state, definition, 'startup')).toBe('available');
  });

  it('refuses to research an already unlocked technology', () => {
    const state = makeTechnologyState({ unlocked: ['quantum-lattice'] });
    const definition = getTechnologyDefinition('quantum-lattice')!;

    const result = canStartResearch(state, definition, 'startup');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('TECHNOLOGY_ALREADY_UNLOCKED');
  });
});

describe('Technology Engine — research projects', () => {
  it('starts a research project with a deterministic identifier', () => {
    const state = createInitialTechnologyState();

    const result = startResearch(state, {
      technologyId: 'quantum-lattice',
      assignedEmployeeIds: ['emp_0001'],
      startedAtSimMs: 0,
      corporationTierId: 'startup',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.project.id).toBe('res_0001');
    expect(result.value.project.progress).toBe(0);
    expect(result.value.project.costPaid).toBe(
      getTechnologyDefinition('quantum-lattice')!.researchCost,
    );
    expect(result.value.state.sequence).toBe(1);
  });

  it('prevents a duplicate active research project', () => {
    const state = createInitialTechnologyState();
    const first = startResearch(state, {
      technologyId: 'quantum-lattice',
      assignedEmployeeIds: ['emp_0001'],
      startedAtSimMs: 0,
      corporationTierId: 'startup',
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = startResearch(first.value.state, {
      technologyId: 'quantum-lattice',
      assignedEmployeeIds: ['emp_0002'],
      startedAtSimMs: 0,
      corporationTierId: 'startup',
    });

    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe('TECHNOLOGY_RESEARCH_ACTIVE');
  });

  it('rejects an unknown technology and an invalid cost', () => {
    const state = createInitialTechnologyState();

    const unknown = startResearch(state, {
      technologyId: 'warp-drive',
      assignedEmployeeIds: [],
      startedAtSimMs: 0,
      corporationTierId: 'startup',
    });
    expect(unknown.ok).toBe(false);

    const invalid = canStartResearch(
      state,
      { ...getTechnologyDefinition('quantum-lattice')!, researchCost: 0 },
      'startup',
    );
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error.code).toBe('TECHNOLOGY_INVALID_COST');
  });

  it('cancels a running project and records the history', () => {
    const state = createInitialTechnologyState();
    const started = startResearch(state, {
      technologyId: 'quantum-lattice',
      assignedEmployeeIds: ['emp_0001'],
      startedAtSimMs: 0,
      corporationTierId: 'startup',
    });
    if (!started.ok) throw new Error('setup failed');

    const cancelled = cancelResearch(started.value.state, started.value.project.id, 1_000);

    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    expect(cancelled.value.project.status).toBe('cancelled');
    expect(cancelled.value.state.history).toHaveLength(1);
    expect(cancelled.value.state.history[0].outcome).toBe('cancelled');
    expect(cancelled.value.state.unlocked).toHaveLength(0);
  });

  it('refuses to cancel a finished project', () => {
    const state = createInitialTechnologyState();
    const started = startResearch(state, {
      technologyId: 'quantum-lattice',
      assignedEmployeeIds: ['emp_0001'],
      startedAtSimMs: 0,
      corporationTierId: 'startup',
    });
    if (!started.ok) throw new Error('setup failed');

    const cancelled = cancelResearch(started.value.state, started.value.project.id, 0);
    if (!cancelled.ok) throw new Error('setup failed');
    const cancelledAgain = cancelResearch(cancelled.value.state, started.value.project.id, 0);

    expect(cancelledAgain.ok).toBe(false);
    if (!cancelledAgain.ok) {
      expect(cancelledAgain.error.code).toBe('RESEARCH_PROJECT_NOT_ACTIVE');
    }
  });
});

describe('Technology Engine — workforce contribution', () => {
  it('scales the contribution with the skill and the productivity', () => {
    const definition = getTechnologyDefinition('quantum-lattice')!;

    const weak = makeEmployee({ skill: 25, productivity: 25 });
    const strong = makeEmployee({ skill: 80, productivity: 80 });

    expect(getEmployeeContribution(definition, strong)).toBeGreaterThan(
      getEmployeeContribution(definition, weak),
    );
  });

  it('penalises a mismatched profession', () => {
    const definition = getTechnologyDefinition('quantum-lattice')!;
    const researcher = makeEmployee({ profession: 'researcher' });
    const marketer = makeEmployee({ profession: 'marketer' });

    expect(getEmployeeContribution(definition, researcher)).toBeGreaterThan(
      getEmployeeContribution(definition, marketer),
    );
  });

  it('ignores a departed employee', () => {
    const definition = getTechnologyDefinition('quantum-lattice')!;
    const departed = makeEmployee({ status: 'departed' });

    expect(getEmployeeContribution(definition, departed)).toBe(0);
  });

  it('sums the contribution of the assigned workforce', () => {
    const definition = getTechnologyDefinition('quantum-lattice')!;
    const employees = [
      makeEmployee({ id: 'emp_0001' }),
      makeEmployee({ id: 'emp_0002', skill: 40, productivity: 40 }),
    ];

    const total = getResearchContribution(definition, employees, ['emp_0001', 'emp_0002']);
    const single = getResearchContribution(definition, employees, ['emp_0001']);

    expect(total).toBeGreaterThan(single);
  });
});

describe('Technology Engine — research progression', () => {
  it('advances the research progress with the elapsed simulated time', () => {
    const state = createInitialTechnologyState();
    const started = startResearch(state, {
      technologyId: 'quantum-lattice',
      assignedEmployeeIds: ['emp_0001'],
      startedAtSimMs: 0,
      corporationTierId: 'startup',
    });
    if (!started.ok) throw new Error('setup failed');

    const employees = [makeEmployee({ skill: 100, productivity: 100 })];
    const advanced = advanceResearch(
      started.value.state,
      { tick: 1, deltaMs: HOUR, simTimeMs: HOUR },
      employees,
    );

    const project = advanced.projects[0];
    expect(project.progress).toBeGreaterThan(0);
    expect(project.progress).toBeLessThanOrEqual(1);
  });

  it('makes no progress without an assigned workforce', () => {
    const state = createInitialTechnologyState();
    const started = startResearch(state, {
      technologyId: 'quantum-lattice',
      assignedEmployeeIds: [],
      startedAtSimMs: 0,
      corporationTierId: 'startup',
    });
    if (!started.ok) throw new Error('setup failed');

    const advanced = advanceResearch(
      started.value.state,
      { tick: 1, deltaMs: HOUR, simTimeMs: HOUR },
      [makeEmployee()],
    );

    expect(advanced.projects[0].progress).toBe(0);
  });

  it('completes the research and unlocks the technology', () => {
    const state = createInitialTechnologyState();
    const started = startResearch(state, {
      technologyId: 'quantum-lattice',
      assignedEmployeeIds: ['emp_0001'],
      startedAtSimMs: 0,
      corporationTierId: 'startup',
    });
    if (!started.ok) throw new Error('setup failed');

    const employees = [makeEmployee({ skill: 100, productivity: 100 })];
    const advanced = advanceResearch(
      started.value.state,
      { tick: 1, deltaMs: 1_000 * HOUR, simTimeMs: 1_000 * HOUR },
      employees,
    );

    expect(advanced.projects[0].status).toBe('completed');
    expect(advanced.projects[0].progress).toBe(1);
    expect(advanced.unlocked).toContain('quantum-lattice');
    expect(advanced.history[0].outcome).toBe('completed');
    expect(getTechnologyStatus(advanced, getTechnologyDefinition('quantum-lattice')!, 'startup')).toBe(
      'completed',
    );
  });

  it('never exceeds a progress of one', () => {
    const state = createInitialTechnologyState();
    const started = startResearch(state, {
      technologyId: 'quantum-lattice',
      assignedEmployeeIds: ['emp_0001'],
      startedAtSimMs: 0,
      corporationTierId: 'startup',
    });
    if (!started.ok) throw new Error('setup failed');

    const employees = [makeEmployee({ skill: 100, productivity: 100 })];
    const advanced = advanceResearch(
      started.value.state,
      { tick: 1, deltaMs: 100_000 * HOUR, simTimeMs: 100_000 * HOUR },
      employees,
    );

    expect(advanced.projects[0].progress).toBeLessThanOrEqual(1);
  });

  it('produces reproducible results', () => {
    const run = () => {
      const started = startResearch(createInitialTechnologyState(), {
        technologyId: 'quantum-lattice',
        assignedEmployeeIds: ['emp_0001'],
        startedAtSimMs: 0,
        corporationTierId: 'startup',
      });
      if (!started.ok) throw new Error('setup failed');
      const employees = [makeEmployee({ skill: 60, productivity: 60 })];
      let state = started.value.state;
      for (let i = 0; i < 10; i += 1) {
        state = advanceResearch(state, { tick: i + 1, deltaMs: HOUR, simTimeMs: i * HOUR }, employees);
      }
      return state;
    };

    expect(run()).toEqual(run());
  });

  it('rejects an invalid state without changing it', () => {
    const invalid = { ...createInitialTechnologyState(), unlocked: ['unknown-tech'] };

    const advanced = advanceResearch(
      invalid,
      { tick: 1, deltaMs: HOUR, simTimeMs: HOUR },
      [makeEmployee()],
    );

    expect(advanced).toBe(invalid);
  });
  it('validates the state', () => {
    expect(isValidTechnologyState(createInitialTechnologyState())).toBe(true);
  });
});

describe('Technology Engine — unlock effects', () => {
  it('aggregates the effects of the unlocked technologies', () => {
    const empty = getUnlockedEffects(createInitialTechnologyState());
    expect(empty.productionEfficiency).toBe(1);
    expect(empty.researchSpeed).toBe(1);
    expect(empty.qualityBonus).toBe(0);

    const unlocked = getUnlockedEffects(
      makeTechnologyState({ unlocked: ['quantum-lattice', 'neural-array'] }),
    );
    expect(unlocked.productionEfficiency).toBeGreaterThan(1);
    expect(unlocked.qualityBonus).toBeGreaterThan(0);
    expect(unlocked.researchSpeed).toBeGreaterThan(1);
  });
});
