/**
 * Simulation Worker — the entry point.
 *
 * The module is loaded as a module Worker by Vite. It wires the pure API of
 * `workerApi.ts` into the Comlink transport and does nothing else.
 *
 * The Worker imports **no** React, DOM, Zustand or rendering code.
 */

import * as Comlink from 'comlink';
import { createSimulationWorkerApi } from '@/game/simulation/workerApi';
import type { SimulationWorkerApi } from '@/game/simulation/protocol';

const api: SimulationWorkerApi = createSimulationWorkerApi();

Comlink.expose(api);
