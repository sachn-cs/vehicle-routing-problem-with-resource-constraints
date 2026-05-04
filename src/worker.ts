import { workerData, parentPort } from 'worker_threads';
import { Problem, Node, Customer, Vehicle } from './core/Problem.js';
import { Solution } from './core/Solution.js';
import { ALNS } from './algorithms/alns/ALNS.js';
import { BRKGA } from './algorithms/brkga/BRKGA.js';

interface WorkerData {
  nodes: Record<number, { id: number; x: number; y: number; name: string }>;
  customers: Array<{
    id: number;
    deliveryNodeId: number;
    pickupNodeId: number;
    processingTime: number;
  }>;
  vehicles: Array<{ id: number; capacity: number }>;
  depotNodeId: number;
  type: 'ALNS' | 'BRKGA';
  options: Record<string, number>;
}

interface WorkerResult {
  makespan: number;
  routes: Array<{ vehicleId: number; nodes: number[] }>;
  type: string;
}

const data = workerData as WorkerData;

// Reconstruct problem from serialized data
const nodes: Record<number, Node> = {};
for (const [id, nodeData] of Object.entries(data.nodes)) {
  nodes[Number(id)] = new Node(nodeData.id, nodeData.x, nodeData.y, nodeData.name);
}

const customers = data.customers.map(
  c => new Customer(c.id, c.deliveryNodeId, c.pickupNodeId, c.processingTime),
);

const vehicles = data.vehicles.map(v => new Vehicle(v.id, v.capacity));

const problem = new Problem(nodes, customers, vehicles, data.depotNodeId);

let solution: Solution;

if (data.type === 'ALNS') {
  const alns = new ALNS(problem, data.options);
  solution = alns.solve();
} else {
  const brkga = new BRKGA(problem, data.options);
  solution = brkga.solve();
}

const result: WorkerResult = {
  makespan: solution.makespan,
  routes: solution.routes.map(r => ({ vehicleId: r.vehicleId, nodes: r.nodes })),
  type: data.type,
};

parentPort?.postMessage(result);
