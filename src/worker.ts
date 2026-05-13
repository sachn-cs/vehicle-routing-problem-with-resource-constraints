import { workerData, parentPort } from 'worker_threads';

import { ALNS } from './algorithms/alns/ALNS.js';
import { BRKGA } from './algorithms/brkga/BRKGA.js';
import type { Chromosome } from './algorithms/brkga/Decoder.js';
import { VrpProblem, LocationNode, Customer, Vehicle } from './core/Problem.js';
import type { VrpSolution } from './core/Solution.js';
import { isWorkerData, validateWorkerData } from './workerValidation.js';

interface WorkerResult {
  makespan: number;
  routes: Array<{ vehicleId: number; nodes: number[] }>;
  type: string;
}

if (!isWorkerData(workerData)) {
  parentPort?.postMessage({
    error: 'Invalid workerData: expected { nodes, customers, vehicles, depotNodeId, type, options }',
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
      const { BRKGA } = await import('./algorithms/brkga/BRKGA.js');
      const brkga = new BRKGA(problem, data.options);
      const islandMaxGenerations = (data.options['islandMaxGenerations'] as number | undefined) ?? 100;
      const migrationInterval = (data.options['migrationInterval'] as number | undefined) ?? 50;

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

      const messageHandler = (msg: unknown) => {
        const cmd = msg as { type: string; generations?: number; migrants?: Chromosome[] };
        if (cmd.type === 'evolve') {
          const gens = cmd.generations ?? migrationInterval;
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
        } else if (cmd.type === 'inject') {
          const migrants = cmd.migrants ?? [];
          const replaceCount = Math.min(migrants.length, population.length);
          for (let i = 0; i < replaceCount; i++) {
            const targetIdx = population.length - 1 - i;
            population[targetIdx] = {
              chromosome: migrants[i] as Chromosome,
              fitness: null,
              solution: null,
            };
          }
          parentPort?.postMessage({ type: 'checkpoint', islandId: data.islandId, generation, population });
        } else if (cmd.type === 'finish') {
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
      parentPort?.postMessage({ type: 'checkpoint', islandId: data.islandId, generation, population });
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
