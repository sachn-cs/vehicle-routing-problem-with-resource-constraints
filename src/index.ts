// Core (new names)
export {
  VrpProblem,
  LocationNode,
  Customer,
  CustomerWithTimeWindows,
  Vehicle,
} from './core/problem.js';
export { VrpSolution, Route } from './core/solution.js';
export type { SerializedRoute, SerializedSolution } from './core/solution.js';

// Errors
export {
  VrpError,
  ValidationError,
  InfeasibleSolutionError,
  AlgorithmConvergenceError,
} from './errors.js';

// Logger
export { defaultLogger, type Logger } from './logger.js';

// Multi-depot support
export { MultiDepotProblem, Depot } from './core/multi-depot-problem.js';

// Traffic-aware routing
export {
  TrafficAwareProblem,
  TrafficModel,
  type TrafficSegment,
} from './core/traffic-aware-problem.js';

// Inter-vehicle resource transfer
export {
  TransferManager,
  TransferHub,
  type ResourceTransfer,
} from './core/resource-transfer.js';
export {
  VehicleWithCapabilities,
  VehicleFleetManager,
  type ResourceType,
  type VehicleState,
} from './core/vehicle-with-capabilities.js';
export {
  SolutionWithTransfers,
  ProblemWithTransfers,
} from './core/solution-with-transfers.js';

// Algorithms
export { ALNS } from './algorithms/alns/alns.js';
export type { ALNSOptions } from './algorithms/alns/alns.js';
export { BRKGA } from './algorithms/brkga/brkga.js';
export type { BRKGAOptions, Individual } from './algorithms/brkga/brkga.js';
export type { Chromosome } from './algorithms/brkga/decoder.js';
export {
  TransferAwareInsertionOperators,
  TransferAwareRemovalOperators,
} from './algorithms/alns/transfer-aware-operators.js';

// Analytics
export { RouteAnalytics } from './analytics/route-analytics.js';
export { SolutionComparator } from './analytics/solution-comparator.js';
export type {
  VehicleUtilization,
  WaitTimeAnalysis,
  LoadOverTime,
  RouteComparison,
} from './analytics/route-analytics.js';
export type {
  SolutionMetrics,
  ComparisonResult,
  ParetoFront,
} from './analytics/solution-comparator.js';

// Export
export { GISExporter } from './export/gis-exporter.js';
export type { GeoJSON, GeoJSONFeature, KMLPlacemark } from './export/gis-exporter.js';

// Main solver class
import { resolve } from 'path';
import { Worker } from 'worker_threads';

import type { ALNSOptions, ALNSProgress } from './algorithms/alns/alns.js';
import { ALNS } from './algorithms/alns/alns.js';
import { BRKGA } from './algorithms/brkga/brkga.js';
import type { BRKGAOptions, BRKGAProgress } from './algorithms/brkga/brkga.js';
import type { VrpProblem } from './core/problem.js';
import { VrpSolution, Route } from './core/solution.js';
import { AlgorithmConvergenceError } from './errors.js';
import type { Logger } from './logger.js';
import { defaultLogger } from './logger.js';

function isWorkerResult(msg: object): msg is WorkerResult {
  return 'makespan' in msg && 'routes' in msg && 'type' in msg;
}

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
    const reportAlns = options.onProgress;
    const alns = new ALNS(this.problem, {
      maxIterations: options.alnsIterations ?? 500,
      initialTemp: options.initialTemp ?? 100,
      coolingRate: options.coolingRate ?? 0.9998,
      maxTimeMs: options.maxTimeMs ?? 0,
      onProgress: reportAlns
        ? (progress: ALNSProgress) => {
            reportAlns({
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
    const warmStart = options.warmStart ?? true;
    const reportBrkga = options.onProgress;
    const brkga = new BRKGA(this.problem, {
      populationSize: options.populationSize ?? 30000,
      maxGenerations: options.maxGenerations ?? 20000,
      warmStartSolution: warmStart ? alnsSolution : undefined,
      warmStartProportion: 0.15,
      maxTimeMs: options.maxTimeMs ?? 0,
      onProgress: reportBrkga
        ? (progress: BRKGAProgress) => {
            reportBrkga({
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
      `Parallel Solving completed. Best makespan: ` +
        `${results[0]!.makespan.toFixed(2)} (${results[0]!.type})`,
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

  protected runWorker(
    type: 'ALNS' | 'BRKGA',
    options: ALNSOptions | BRKGAOptions,
  ): Promise<WorkerResult> {
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
      worker.on('message', (msg: unknown) => {
        if (!settled) {
          settled = true;
          void worker.terminate();
          if (typeof msg === 'object' && msg !== null) {
            if ('error' in msg) {
              const errMsg = typeof msg.error === 'string' ? msg.error : 'Unknown error';
              reject(new AlgorithmConvergenceError(`Worker ${type} failed: ${errMsg}`));
            } else if (isWorkerResult(msg)) {
              resolveResult(msg);
            } else {
              reject(new AlgorithmConvergenceError(`Worker ${type} returned unexpected result`));
            }
          } else {
            reject(new AlgorithmConvergenceError(`Worker ${type} returned non-object result`));
          }
        }
      });
      worker.on('error', err => {
        if (!settled) {
          settled = true;
          void worker.terminate();
          reject(new AlgorithmConvergenceError(`Worker ${type} error: ${err.message}`));
        }
      });
      worker.on('exit', code => {
        if (!settled) {
          settled = true;
          void worker.terminate();
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
