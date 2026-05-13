// Core (new names)
export { VrpProblem, LocationNode, Customer, CustomerWithTimeWindows, Vehicle } from './core/Problem.js';
export { VrpSolution, Route } from './core/Solution.js';
export type { SerializedRoute, SerializedSolution } from './core/Solution.js';

// Backward-compatible aliases
// eslint-disable-next-line @typescript-eslint/no-deprecated
export { Problem, Node } from './core/Problem.js';
// eslint-disable-next-line @typescript-eslint/no-deprecated
export { Solution } from './core/Solution.js';

// Errors
export { VrpError, ValidationError, InfeasibleSolutionError, AlgorithmConvergenceError } from './errors.js';

// Logger
export { defaultLogger, type Logger } from './logger.js';

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
export type { ALNSOptions } from './algorithms/alns/ALNS.js';
export { BRKGA } from './algorithms/brkga/BRKGA.js';
export type { BRKGAOptions, Individual } from './algorithms/brkga/BRKGA.js';
export type { Chromosome } from './algorithms/brkga/Decoder.js';
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
import { resolve } from 'path';
import { Worker } from 'worker_threads';

import { ALNS } from './algorithms/alns/ALNS.js';
import type { ALNSOptions, ALNSProgress } from './algorithms/alns/ALNS.js';
import { BRKGA } from './algorithms/brkga/BRKGA.js';
import type { BRKGAOptions, BRKGAProgress } from './algorithms/brkga/BRKGA.js';
import type { VrpProblem } from './core/Problem.js';
import { VrpSolution, Route } from './core/Solution.js';
import { AlgorithmConvergenceError } from './errors.js';
import type { Logger } from './logger.js';
import { defaultLogger } from './logger.js';

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
  logger?: Logger;
  /** Maximum time in milliseconds before aborting */
  maxTimeMs?: number;
  /** Target makespan for early stopping */
  targetMakespan?: number;
  /** Called with progress updates */
  onProgress?: (progress: SolverProgress) => void;
}

export interface SolverProgress {
  stage: 'ALNS' | 'BRKGA' | 'parallel';
  iteration: number;
  maxIterations: number;
  bestMakespan: number;
  elapsedMs: number;
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
  private readonly logger: Logger;

  /**
   * @param problem - VRP-RPD problem instance to solve
   */
  constructor(
    protected readonly problem: VrpProblem,
    options?: { logger?: Logger },
  ) {
    this.logger = options?.logger ?? defaultLogger;
  }

  /**
   * @param options - Solver configuration
   * @returns Best solution found across both stages
   */
  async solve(options: SolveOptions = {}): Promise<VrpSolution> {
    if (options.parallel) {
      return this.solveParallel(options);
    }

    const startTime = Date.now();
    const targetMakespan = options.targetMakespan ?? 0;

    // Stage 1: ALNS
    this.logger.log('Starting Stage 1: ALNS...');
    const alns = new ALNS(this.problem, {
      maxIterations: options.alnsIterations ?? 500,
      initialTemp: options.initialTemp ?? 100,
      coolingRate: options.coolingRate ?? 0.9998,  // Paper spec
      maxTimeMs: options.maxTimeMs ?? 0,
      onProgress: options.onProgress
        ? (progress: ALNSProgress) => {
            options.onProgress!({
              stage: 'ALNS',
              iteration: progress.iteration,
              maxIterations: progress.maxIterations,
              bestMakespan: progress.bestMakespan,
              elapsedMs: Date.now() - startTime,
            });
          }
        : undefined,
    });
    const alnsSolution = alns.solve();
    this.logger.log(`ALNS completed. Best makespan: ${alnsSolution.makespan.toFixed(2)}`);

    // Early stop if target reached
    if (targetMakespan > 0 && alnsSolution.makespan <= targetMakespan) {
      this.logger.log(`Target makespan ${targetMakespan.toFixed(2)} reached after ALNS.`);
      return alnsSolution;
    }

    // Stage 2: BRKGA with warm-start from ALNS
    this.logger.log('Starting Stage 2: BRKGA with warm-start...');
    const warmStart = options.warmStart ?? true;  // Default: enabled (paper spec)
    const brkga = new BRKGA(this.problem, {
      populationSize: options.populationSize ?? 30000,  // Paper spec
      maxGenerations: options.maxGenerations ?? 20000,  // Paper spec
      warmStartSolution: warmStart ? alnsSolution : undefined,
      warmStartProportion: 0.15,  // Paper spec: 15% warm-start
      maxTimeMs: options.maxTimeMs ?? 0,
      onProgress: options.onProgress
        ? (progress: BRKGAProgress) => {
            options.onProgress!({
              stage: 'BRKGA',
              iteration: progress.generation,
              maxIterations: progress.maxGenerations,
              bestMakespan: progress.bestMakespan,
              elapsedMs: Date.now() - startTime,
            });
          }
        : undefined,
    });
    const brkgaSolution = await brkga.solve();
    this.logger.log(`BRKGA completed. Best makespan: ${brkgaSolution.makespan.toFixed(2)}`);

    // Return best of both stages
    return alnsSolution.makespan < brkgaSolution.makespan ? alnsSolution : brkgaSolution;
  }

  protected async solveParallel(options: SolveOptions = {}): Promise<VrpSolution> {
    this.logger.log('Starting Parallel Solving (ALNS + BRKGA)...');

    const workerPromises = [
      this.runWorker('ALNS', {
        maxIterations: options.alnsIterations ?? 500,
        initialTemp: options.initialTemp,
        coolingRate: options.coolingRate ?? 0.9998,
        maxTimeMs: options.maxTimeMs ?? 0,
      }),
      this.runWorker('BRKGA', {
        populationSize: options.populationSize ?? 30000,
        maxGenerations: options.maxGenerations ?? 20000,
        maxTimeMs: options.maxTimeMs ?? 0,
      }),
    ];

    const results = await Promise.all(workerPromises);
    results.sort((a, b) => a.makespan - b.makespan);

    this.logger.log(
      `Parallel Solving completed. Best makespan: ${results[0]!.makespan.toFixed(2)} (${results[0]!.type})`,
    );

    const best = results[0];
    if (!best) {
      throw new AlgorithmConvergenceError('No solution returned from workers');
    }
    const solution = new VrpSolution(
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
            const errorMsg = (msg as Record<string, unknown>)['error'];
            reject(new AlgorithmConvergenceError(`Worker ${type} failed: ${String(errorMsg)}`));
          } else {
            resolveResult(msg as WorkerResult);
          }
        }
      });
      worker.on('error', err => {
        if (!settled) {
          settled = true;
          worker.terminate().catch(() => {});
          reject(new AlgorithmConvergenceError(`Worker ${type} error: ${err.message}`));
        }
      });
      worker.on('exit', code => {
        if (!settled) {
          settled = true;
          worker.terminate().catch(() => {});
          if (code !== 0) {
            reject(new AlgorithmConvergenceError(`Worker stopped with exit code ${code}`));
          } else {
            reject(new AlgorithmConvergenceError('Worker exited without producing a result'));
          }
        }
      });
    });
  }
}
