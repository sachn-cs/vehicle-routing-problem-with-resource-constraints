import { workerData, parentPort } from 'worker_threads';

import { ALNS } from './algorithms/alns/alns.js';
import { BRKGA } from './algorithms/brkga/brkga.js';
import type { Chromosome } from './algorithms/brkga/decoder.js';
import { VrpProblem, LocationNode, Customer, Vehicle } from './core/problem.js';
import type { VrpSolution } from './core/solution.js';
import { isWorkerData, validateWorkerData } from './worker-validation.js';

interface WorkerResult {
  makespan: number;
  routes: Array<{ vehicleId: number; nodes: number[] }>;
  type: string;
}

if (!isWorkerData(workerData)) {
  parentPort?.postMessage({
    error: 'Invalid workerData: expected ' +
      '{ nodes, customers, vehicles, depotNodeId, type, options }',
    type: 'unknown',
  });
  process.exit(1);
}

const validationError = validateWorkerData(workerData);
if (validationError) {
  parentPort?.postMessage({
    error: `Invalid workerData: ${validationError}`,
    type: workerData.type,
  });
  process.exit(1);
}

const data = workerData;

// Reconstruct problem from serialized data
const nodes: Record<number, LocationNode> = {};
for (const [id, nodeData] of Object.entries(data.nodes)) {
  nodes[Number(id)] = new LocationNode(nodeData.id, nodeData.x, nodeData.y, nodeData.name);
}

const customers = data.customers.map(
  c => new Customer(c.id, c.deliveryNodeId, c.pickupNodeId, c.processingTime),
);

const vehicles = data.vehicles.map(v => new Vehicle(v.id, v.capacity));

const problem = new VrpProblem(nodes, customers, vehicles, data.depotNodeId);

void (async () => {
  try {
    let solution: VrpSolution;

    if (data.type === 'island-brkga') {
      const { BRKGA } = await import('./algorithms/brkga/brkga.js');
      const brkga = new BRKGA(problem, data.options);
      const islandMaxGenerations = typeof data.options['islandMaxGenerations'] === 'number'
        ? data.options['islandMaxGenerations']
        : 100;
      const migrationInterval = typeof data.options['migrationInterval'] === 'number'
        ? data.options['migrationInterval']
        : 50;

      let population = brkga.initializePopulation();
      let generation = 0;

      const evaluate = () => {
        for (const ind of population) {
          if (ind.fitness === null) {
            const sol = brkga.decoder.decode(ind.chromosome);
            ind.fitness = sol.isFeasible() ? sol.makespan : Infinity;
            ind.solution = sol;
          }
        }
        population.sort((a, b) => (a.fitness ?? Infinity) - (b.fitness ?? Infinity));
      };

      evaluate();

      function isChromosome(value: unknown): value is Chromosome {
        if (typeof value !== 'object' || value === null) return false;
        return 'priorities' in value && Array.isArray(value.priorities) &&
               'assignments' in value && Array.isArray(value.assignments) &&
               'dependencies' in value && Array.isArray(value.dependencies) &&
               'transfers' in value && Array.isArray(value.transfers);
      }

      const messageHandler = (msg: unknown) => {
        if (
          typeof msg !== 'object' || msg === null ||
          !('type' in msg) || typeof msg.type !== 'string'
        ) return;
        if (msg.type === 'evolve') {
          const gens = 'generations' in msg && typeof msg.generations === 'number'
            ? msg.generations
            : migrationInterval;
          for (let g = 0; g < gens && generation < islandMaxGenerations; g++, generation++) {
            population = brkga.evolvePopulation(population);
            evaluate();
          }
          parentPort?.postMessage({
            type: 'checkpoint',
            islandId: data.islandId,
            generation,
            population,
          });
        } else if (msg.type === 'inject') {
          const rawMigrants = 'migrants' in msg ? msg.migrants : undefined;
          const migrants = Array.isArray(rawMigrants) ? rawMigrants : [];
          const replaceCount = Math.min(migrants.length, population.length);
          for (let i = 0; i < replaceCount; i++) {
            const targetIdx = population.length - 1 - i;
            if (i >= migrants.length) continue;
            const migrantRaw: unknown = migrants[i];
            if (
              typeof migrantRaw !== 'object' || migrantRaw === null ||
              !isChromosome(migrantRaw)
            ) continue;
            population[targetIdx] = {
              chromosome: {
                priorities: migrantRaw.priorities,
                assignments: migrantRaw.assignments,
                dependencies: migrantRaw.dependencies,
                transfers: migrantRaw.transfers,
              },
              fitness: null,
              solution: null,
            };
          }
          parentPort?.postMessage({
            type: 'checkpoint',
            islandId: data.islandId,
            generation,
            population,
          });
        } else if (msg.type === 'finish') {
          evaluate();
          const best = population[0];
          parentPort?.postMessage({
            type: 'finish',
            islandId: data.islandId,
            bestIndividual: best ?? null,
          });
          parentPort?.off('message', messageHandler);
        }
      };

      parentPort?.on('message', messageHandler);
      parentPort?.postMessage({
        type: 'checkpoint',
        islandId: data.islandId,
        generation,
        population,
      });
      return;
    }

    if (data.type === 'ALNS') {
      const alns = new ALNS(problem, data.options);
      solution = alns.solve();
    } else {
      const brkga = new BRKGA(problem, data.options);
      solution = await brkga.solve();
    }

    const result: WorkerResult = {
      makespan: solution.makespan,
      routes: solution.routes.map(r => ({ vehicleId: r.vehicleId, nodes: r.nodes })),
      type: data.type,
    };

    parentPort?.postMessage(result);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    parentPort?.postMessage({ error: errorMessage, type: data.type });
  }
})();
