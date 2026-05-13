import type { VrpProblem } from '../../core/Problem.js';
import { VrpSolution, Route } from '../../core/Solution.js';
import { ValidationError } from '../../errors.js';
import type { Logger } from '../../logger.js';
import { defaultLogger } from '../../logger.js';

import { RemovalOperators, InsertionOperators } from './operators.js';

export interface ALNSProgress {
  iteration: number;
  maxIterations: number;
  bestMakespan: number;
  currentMakespan: number;
  temperature: number;
}

export interface ALNSOptions {
  maxIterations?: number;
  initialTemp?: number;
  coolingRate?: number;
  segmentSize?: number;
  // Paper-specific scores for new best, better, accepted
  scoreNewBest?: number;
  scoreBetter?: number;
  scoreAccepted?: number;
  logger?: Logger;
  /** Maximum time in milliseconds before aborting */
  maxTimeMs?: number;
  /** Called every 10 iterations with progress */
  onProgress?: (progress: ALNSProgress) => void;
}

/**
 * ALNS (Adaptive Large Neighborhood Search) implementation.
 *
 * Paper parameters (arXiv:2602.23685v2):
 * - 6 destroy operators: Random, Worst, Shaw, Cluster, Proximity, Temporal
 * - 4 repair operators: Greedy, Regret-2, Regret-3, Regret-4
 * - Operator scores: (33, 9, 13) for new best, better, accepted
 * - Cooling rate: 0.9998
 * - 32 parallel instances per GPU
 */
export class ALNS {
  protected readonly problem: VrpProblem;
  protected readonly maxIterations: number;
  protected readonly initialTemp: number;
  protected readonly coolingRate: number;
  protected readonly segmentSize: number;

  // Paper-specific scores
  protected readonly scoreNewBest: number;
  protected readonly scoreBetter: number;
  protected readonly scoreAccepted: number;

  protected removalOps: string[];
  protected insertionOps: string[];
  protected removalWeights: number[];
  protected insertionWeights: number[];
  protected scores: { removal: number[]; insertion: number[] };
  protected usage: { removal: number[]; insertion: number[] };
  protected readonly lambda: number;
  protected readonly logger: Logger;
  protected readonly maxTimeMs: number;
  protected readonly onProgress: ((progress: ALNSProgress) => void) | null;

  protected temp: number;

  /**
   * @param problem - VRP-RPD problem instance to solve
   * @param options - ALNS configuration options
   */
  constructor(problem: VrpProblem, options: ALNSOptions = {}) {
    this.problem = problem;

    // Validate options
    if (options.maxIterations !== undefined && options.maxIterations < 1) {
      throw new ValidationError('Max iterations must be a positive integer');
    }
    if (options.coolingRate !== undefined && (options.coolingRate <= 0 || options.coolingRate >= 1)) {
      throw new ValidationError('Cooling rate must be between 0 and 1 (exclusive)');
    }
    if (options.initialTemp !== undefined && options.initialTemp <= 0) {
      throw new ValidationError('Initial temperature must be positive');
    }
    if (options.segmentSize !== undefined && options.segmentSize < 1) {
      throw new ValidationError('Segment size must be a positive integer');
    }

    // Paper defaults: cooling rate 0.9998, scores (33, 9, 13)
    this.maxIterations = options.maxIterations ?? 500;
    this.initialTemp = options.initialTemp ?? 100;
    this.coolingRate = options.coolingRate ?? 0.9998;  // Paper spec
    this.segmentSize = options.segmentSize ?? 50;

    // Paper operator scores
    this.scoreNewBest = options.scoreNewBest ?? 33;    // Paper spec
    this.scoreBetter = options.scoreBetter ?? 9;       // Paper spec
    this.scoreAccepted = options.scoreAccepted ?? 13;  // Paper spec

    // 6 destroy operators from paper
    this.removalOps = Object.keys(RemovalOperators);
    // 4 repair operators from paper
    this.insertionOps = Object.keys(InsertionOperators);

    this.removalWeights = new Array<number>(this.removalOps.length).fill(1);
    this.insertionWeights = new Array<number>(this.insertionOps.length).fill(1);

    this.scores = {
      removal: new Array<number>(this.removalOps.length).fill(0),
      insertion: new Array<number>(this.insertionOps.length).fill(0),
    };
    this.usage = {
      removal: new Array<number>(this.removalOps.length).fill(0),
      insertion: new Array<number>(this.insertionOps.length).fill(0),
    };
    this.lambda = 0.1;
    this.logger = options.logger ?? defaultLogger;
    this.maxTimeMs = options.maxTimeMs ?? 0;
    this.onProgress = options.onProgress ?? null;

    this.temp = this.initialTemp;
  }

  /**
   * @returns Initial feasible solution built with greedy insertion
   */
  generateInitialSolution(): VrpSolution {
    const routes = this.problem.vehicles.map(v => new Route(v.id, []));
    const emptySolution = new VrpSolution(this.problem, routes);
    return InsertionOperators.greedyInsertion(emptySolution, this.problem.customers);
  }

  /**
   * @returns Best solution found after maxIterations
   */
  solve(): VrpSolution {
    const startTime = Date.now();
    let currentSolution = this.generateInitialSolution();
    let bestSolution = currentSolution.clone();
    let currentCost = currentSolution.calculateSchedule();
    let bestCost = currentCost;

    for (let i = 0; i < this.maxIterations; i++) {
      // Timeout check
      if (this.maxTimeMs > 0 && Date.now() - startTime >= this.maxTimeMs) {
        this.logger.log(`ALNS stopped early after ${i} iterations (timeout)`);
        break;
      }

      const rIdx = this.selectOperator(this.removalWeights);
      const iIdx = this.selectOperator(this.insertionWeights);

      const removalOp = RemovalOperators[this.removalOps[rIdx] as keyof typeof RemovalOperators];
      const insertionOp =
        InsertionOperators[this.insertionOps[iIdx] as keyof typeof InsertionOperators];

      this.usage.removal[rIdx] = (this.usage.removal[rIdx] ?? 0) + 1;
      this.usage.insertion[iIdx] = (this.usage.insertion[iIdx] ?? 0) + 1;

      // Adaptive removal size based on problem scale
      const k = Math.max(
        1,
        Math.floor(this.problem.customers.length * (0.1 + Math.random() * 0.3)),
      );
      const { solution: removedSolution, removed } = removalOp(currentSolution, k);
      const newSolution = insertionOp(removedSolution, removed);

      const newCost = newSolution.calculateSchedule();

      let score = 0;
      if (newCost < bestCost) {
        bestSolution = newSolution.clone();
        bestCost = newCost;
        score = this.scoreNewBest;  // Paper: 33
      } else if (newCost < currentCost) {
        score = this.scoreBetter;   // Paper: 9
      } else if (this.accept(currentCost, newCost)) {
        score = this.scoreAccepted; // Paper: 13
      }

      this.scores.removal[rIdx] = (this.scores.removal[rIdx] ?? 0) + score;
      this.scores.insertion[iIdx] = (this.scores.insertion[iIdx] ?? 0) + score;

      if (score > 0) {
        currentSolution = newSolution;
        currentCost = newCost;
      }

      // Update weights every segment
      if (i > 0 && i % this.segmentSize === 0) {
        this.updateWeights();
      }

      // Paper cooling rate: 0.9998 (very slow cooling)
      this.temp *= this.coolingRate;

      // Progress callback every 10 iterations
      if (this.onProgress && i % 10 === 0) {
        this.onProgress({
          iteration: i,
          maxIterations: this.maxIterations,
          bestMakespan: bestCost,
          currentMakespan: currentCost,
          temperature: this.temp,
        });
      }
    }

    return bestSolution;
  }

  private updateSingleWeights(
    weights: number[],
    scores: number[],
    usage: number[],
  ): void {
    for (let i = 0; i < weights.length; i++) {
      const usageVal = usage[i];
      const scoreVal = scores[i];
      const weightVal = weights[i];
      if (usageVal === undefined || usageVal <= 0 || scoreVal === undefined || weightVal === undefined) {
        continue;
      }
      const avgScore = scoreVal / usageVal;
      weights[i] = (1 - this.lambda) * weightVal + this.lambda * avgScore;
      scores[i] = 0;
      usage[i] = 0;
    }
  }

  protected updateWeights(): void {
    this.updateSingleWeights(this.removalWeights, this.scores.removal, this.usage.removal);
    this.updateSingleWeights(this.insertionWeights, this.scores.insertion, this.usage.insertion);
  }

  protected selectOperator(weights: number[]): number {
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum <= 0 || !Number.isFinite(sum)) {
      return Math.floor(Math.random() * weights.length);
    }

    const r = Math.random() * sum;
    let cumulative = 0;
    for (let i = 0; i < weights.length; i++) {
      cumulative += weights[i]!;
      if (r <= cumulative) return i;
    }
    return weights.length - 1;
  }

  protected accept(currentCost: number, newCost: number): boolean {
    if (newCost < currentCost) return true;
    const p = Math.exp((currentCost - newCost) / this.temp);
    return Math.random() < p;
  }

  /**
   * @returns Current operator weights and names for analysis
   */
  getOperatorStats(): {
    removalWeights: number[];
    insertionWeights: number[];
    removalOps: string[];
    insertionOps: string[];
  } {
    return {
      removalWeights: [...this.removalWeights],
      insertionWeights: [...this.insertionWeights],
      removalOps: [...this.removalOps],
      insertionOps: [...this.insertionOps],
    };
  }
}
