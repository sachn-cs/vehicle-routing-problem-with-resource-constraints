import { ALNS } from './algorithms/alns/ALNS.js';
import { BRKGA } from './algorithms/brkga/BRKGA.js';
import { Problem, Node, Customer, Vehicle } from './core/Problem.js';
import { Solution } from './core/Solution.js';

export { Problem, Node, Customer, Vehicle };

import { Worker } from 'worker_threads';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export class VRP_RPD_Solver {
  constructor(problem) {
    this.problem = problem;
  }

  async solve(options = {}) {
    if (options.parallel) {
      return this.solveParallel(options);
    }

    console.log('Starting Stage 1: ALNS...');
    const alns = new ALNS(this.problem, {
      maxIterations: options.alnsIterations || 200,
      initialTemp: options.initialTemp || 100,
      coolingRate: options.coolingRate || 0.98
    });
    const alnsSolution = alns.solve();
    console.log(`ALNS completed. Best makespan: ${alnsSolution.makespan.toFixed(2)}`);

    console.log('Starting Stage 2: BRKGA...');
    const brkga = new BRKGA(this.problem, {
      populationSize: options.populationSize || 100,
      maxGenerations: options.maxGenerations || 100
    });
    const brkgaSolution = brkga.solve();
    console.log(`BRKGA completed. Best makespan: ${brkgaSolution.makespan.toFixed(2)}`);

    return alnsSolution.makespan < brkgaSolution.makespan ? alnsSolution : brkgaSolution;
  }

  async solveParallel(options) {
    console.log('Starting Parallel Solving (ALNS + BRKGA)...');
    
    const workerPromises = [
      this.runWorker('ALNS', { maxIterations: options.alnsIterations || 200 }),
      this.runWorker('BRKGA', { populationSize: options.populationSize || 100, maxGenerations: options.maxGenerations || 100 })
    ];

    const results = await Promise.all(workerPromises);
    results.sort((a, b) => a.makespan - b.makespan);
    
    console.log(`Parallel Solving completed. Best makespan: ${results[0].makespan.toFixed(2)} (${results[0].type})`);
    
    // Construct solution from worker result
    const best = results[0];
    const solution = new Solution(this.problem, best.routes);
    solution.calculateSchedule();
    return solution;
  }

  runWorker(type, options) {
    return new Promise((resolveResult, reject) => {
      const worker = new Worker(resolve(__dirname, 'worker.js'), {
        workerData: {
          nodes: this.problem.nodes,
          customers: this.problem.customers,
          vehicles: this.problem.vehicles,
          depotNodeId: this.problem.depotNodeId,
          type,
          options
        }
      });

      worker.on('message', resolveResult);
      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
      });
    });
  }
}
