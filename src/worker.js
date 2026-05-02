import { parentPort, workerData } from 'worker_threads';
import { ALNS } from './algorithms/alns/ALNS.js';
import { BRKGA } from './algorithms/brkga/BRKGA.js';
import { Problem, Node, Customer, Vehicle } from './core/Problem.js';

// Reconstruct problem from workerData
const { nodes, customers, vehicles, depotNodeId, type, options } = workerData;

const problem = new Problem(nodes, customers, vehicles, depotNodeId);

let solution;
if (type === 'ALNS') {
  const solver = new ALNS(problem, options);
  solution = solver.solve();
} else if (type === 'BRKGA') {
  const solver = new BRKGA(problem, options);
  solution = solver.solve();
}

parentPort.postMessage({
  makespan: solution.makespan,
  routes: solution.routes,
  type
});
