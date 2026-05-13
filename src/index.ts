// Core
export { Problem, Node, Customer, CustomerWithTimeWindows, Vehicle } from './core/Problem.js';

// Errors
export { VrpError, ValidationError, InfeasibleSolutionError, AlgorithmConvergenceError } from './errors.js';

// Logger
export { defaultLogger, type Logger } from './logger.js';
export { Solution, Route } from './core/Solution.js';

// Multi-depot support
export { MultiDepotProblem, Depot } from './core/MultiDepotProblem.js';

// Traffic-aware routing
export { TrafficAwareProblem, TrafficModel, type TrafficSegment } from './core/TrafficAwareProblem.js';

// Inter-vehicle resource transfer
export {
  TransferManager,
  TransferHub,
  type ResourceTransfer,
} from './core/ResourceTransfer.js';
export {
  VehicleWithCapabilities,
  VehicleFleetManager,
  type ResourceType,
  type VehicleState,
} from './core/VehicleWithCapabilities.js';
export {
  SolutionWithTransfers,
  ProblemWithTransfers,
} from './core/SolutionWithTransfers.js';

// Algorithms
export { ALNS } from './algorithms/alns/ALNS.js';
export { BRKGA } from './algorithms/brkga/BRKGA.js';
export { TransferAwareInsertionOperators, TransferAwareRemovalOperators } from './algorithms/alns/TransferAwareOperators.js';

// Analytics
export { RouteAnalytics } from './analytics/RouteAnalytics.js';
export { SolutionComparator } from './analytics/SolutionComparator.js';
export type {
  VehicleUtilization,
  WaitTimeAnalysis,
  LoadOverTime,
  RouteComparison,
} from './analytics/RouteAnalytics.js';
export type { SolutionMetrics, ComparisonResult, ParetoFront } from './analytics/SolutionComparator.js';

// Export
export { GISExporter } from './export/GISExporter.js';
export type { GeoJSON, GeoJSONFeature, KMLPlacemark } from './export/GISExporter.js';

// Main solver class
import { ALNS } from './algorithms/alns/ALNS.js';
import { BRKGA } from './algorithms/brkga/BRKGA.js';
import type { Problem } from './core/Problem.js';
import { Solution, Route } from './core/Solution.js';
import { Worker } from 'worker_threads';
import { resolve } from 'path';
import type { ALNSOptions } from './algorithms/alns/ALNS.js';
import type { BRKGAOptions } from './algorithms/brkga/BRKGA.js';

// Worker path resolution
const getWorkerPath = (): string => {
  return resolve(process.cwd(), 'dist', 'worker.js');
};

export interface SolveOptions {
  alnsIterations?: number;
  populationSize?: number;
  maxGenerations?: number;
  initialTemp?: number;
  coolingRate?: number;
  parallel?: boolean;
  warmStart?: boolean;  // Enable ALNS→BRKGA warm-start
}

export interface WorkerResult {
  makespan: number;
  routes: Array<{ vehicleId: number; nodes: number[] }>;
  type: string;
}

/**
 * Two-stage metaheuristic solver for VRP-RPD.
 *
 * Stage 1: ALNS (Adaptive Large Neighborhood Search)
 * Stage 2: BRKGA (Biased Random-Key Genetic Algorithm)
 *
 * Paper: arXiv:2602.23685v2
 */
export class VrpRpdSolver {
  /**
   * @param problem - VRP-RPD problem instance to solve
   */
  constructor(protected readonly problem: Problem) {}

  /**
   * @param options - Solver configuration
   * @returns Best solution found across both stages
   */
  async solve(options: SolveOptions = {}): Promise<Solution> {
    if (options.parallel) {
      return this.solveParallel(options);
    }

    // Stage 1: ALNS
    console.log('Starting Stage 1: ALNS...');
    const alns = new ALNS(this.problem, {
      maxIterations: options.alnsIterations ?? 500,
      initialTemp: options.initialTemp ?? 100,
      coolingRate: options.coolingRate ?? 0.9998,  // Paper spec
    });
    const alnsSolution = alns.solve();
    console.log(`ALNS completed. Best makespan: ${alnsSolution.makespan.toFixed(2)}`);

    // Stage 2: BRKGA with warm-start from ALNS
    console.log('Starting Stage 2: BRKGA with warm-start...');
    const warmStart = options.warmStart ?? true;  // Default: enabled (paper spec)
    const brkga = new BRKGA(this.problem, {
      populationSize: options.populationSize ?? 30000,  // Paper spec
      maxGenerations: options.maxGenerations ?? 20000,  // Paper spec
      warmStartSolution: warmStart ? alnsSolution : undefined,
      warmStartProportion: 0.15,  // Paper spec: 15% warm-start
    });
    const brkgaSolution = brkga.solve();
    console.log(`BRKGA completed. Best makespan: ${brkgaSolution.makespan.toFixed(2)}`);

    // Return best of both stages
    return alnsSolution.makespan < brkgaSolution.makespan ? alnsSolution : brkgaSolution;
  }

  protected async solveParallel(options: SolveOptions = {}): Promise<Solution> {
    console.log('Starting Parallel Solving (ALNS + BRKGA)...');

    const workerPromises = [
      this.runWorker('ALNS', {
        maxIterations: options.alnsIterations ?? 500,
        initialTemp: options.initialTemp,
        coolingRate: options.coolingRate ?? 0.9998,
      }),
      this.runWorker('BRKGA', {
        populationSize: options.populationSize ?? 30000,
        maxGenerations: options.maxGenerations ?? 20000,
      }),
    ];

    const results = await Promise.all(workerPromises);
    results.sort((a, b) => a.makespan - b.makespan);

    console.log(
      `Parallel Solving completed. Best makespan: ${results[0]!.makespan.toFixed(2)} (${results[0]!.type})`,
    );

    const best = results[0];
    if (!best) {
      throw new Error('No solution returned from workers');
    }
    const solution = new Solution(
      this.problem,
      best.routes.map(r => new Route(r.vehicleId, r.nodes)),
    );
    solution.calculateSchedule();
    return solution;
  }

  protected runWorker(type: 'ALNS' | 'BRKGA', options: ALNSOptions | BRKGAOptions): Promise<WorkerResult> {
    return new Promise((resolveResult, reject) => {
      const worker = new Worker(getWorkerPath(), {
        workerData: {
          nodes: this.problem.nodes,
          customers: this.problem.customers,
          vehicles: this.problem.vehicles,
          depotNodeId: this.problem.depotNodeId,
          type,
          options,
        },
      });

      let settled = false;
      worker.on('message', msg => {
        if (!settled) {
          settled = true;
          worker.terminate().catch(() => {});
          if (msg && typeof msg === 'object' && 'error' in msg) {
            reject(new Error(`Worker ${type} failed: ${String(msg.error)}`));
          } else {
            resolveResult(msg as WorkerResult);
          }
        }
      });
      worker.on('error', err => {
        if (!settled) {
          settled = true;
          worker.terminate().catch(() => {});
          reject(err);
        }
      });
      worker.on('exit', code => {
        if (!settled) {
          settled = true;
          worker.terminate().catch(() => {});
          if (code !== 0) {
            reject(new Error(`Worker stopped with exit code ${code}`));
          } else {
            reject(new Error('Worker exited without producing a result'));
          }
        }
      });
    });
  }
}
