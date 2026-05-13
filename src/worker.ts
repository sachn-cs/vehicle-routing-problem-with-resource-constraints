import { workerData, parentPort } from 'worker_threads';

import { ALNS } from './algorithms/alns/ALNS.js';
import { BRKGA } from './algorithms/brkga/BRKGA.js';
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

(async () => {
  try {
    let solution: VrpSolution;

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
