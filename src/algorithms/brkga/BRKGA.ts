import type { VrpProblem } from '../../core/Problem.js';
import type { VrpSolution } from '../../core/Solution.js';
import { ValidationError } from '../../errors.js';
import type { Logger } from '../../logger.js';
import { defaultLogger } from '../../logger.js';

import { Decoder, type Chromosome } from './Decoder.js';

export interface BRKGAProgress {
  generation: number;
  maxGenerations: number;
  bestMakespan: number;
  populationSize: number;
}

export interface BRKGAOptions {
  populationSize?: number;
  eliteFraction?: number;
  mutantFraction?: number;
  crossoverProb?: number;
  maxGenerations?: number;
  warmStartSolution?: VrpSolution | undefined;
  warmStartProportion?: number;
  logger?: Logger;
  /** Maximum time in milliseconds before aborting */
  maxTimeMs?: number;
  /** Called every 100 generations with progress */
  onProgress?: (progress: BRKGAProgress) => void;
  /** Number of parallel island populations (default: 1 = single-island) */
  islands?: number;
  /** Generations between migrations (default: 50) */
  migrationInterval?: number;
  /** Fraction of each island that emigrates (default: 0.05) */
  migrantFraction?: number;
}

export interface Individual {
  chromosome: Chromosome;
  fitness: number | null;
  solution: VrpSolution | null;
}

/**
 * BRKGA (Biased Random-Key Genetic Algorithm) implementation.
 *
 * Paper parameters (arXiv:2602.23685v2):
 * - Chromosome: 4n genes (π, σ, α, β)
 * - Population: 30,000
 * - Elite fraction: 0.15
 * - Mutant fraction: 0.10
 * - Max generations: 20,000
 * - Warm-start: 15% from ALNS solution
 */
export class BRKGA {
  protected readonly problem: VrpProblem;
  protected readonly populationSize: number;
  protected readonly eliteFraction: number;
  protected readonly mutantFraction: number;
  protected readonly crossoverProb: number;
  protected readonly maxGenerations: number;
  protected readonly decoder: Decoder;
  protected readonly chromosomeSize: number;

  // Warm-start configuration
  protected readonly warmStartSolution: VrpSolution | null;
  protected readonly warmStartProportion: number;
  protected readonly logger: Logger;
  protected readonly maxTimeMs: number;
  protected readonly onProgress: ((progress: BRKGAProgress) => void) | null;
  protected readonly islands: number;
  protected readonly migrationInterval: number;
  protected readonly migrantFraction: number;

  /**
   * @param problem - VRP-RPD problem instance to solve
   * @param options - BRKGA configuration options
   */
  constructor(problem: VrpProblem, options: BRKGAOptions = {}) {
    this.problem = problem;

    // Validate options
    if (options.populationSize !== undefined && options.populationSize < 1) {
      throw new ValidationError('Population size must be a positive integer');
    }
    if (options.eliteFraction !== undefined && (options.eliteFraction <= 0 || options.eliteFraction >= 1)) {
      throw new ValidationError('Elite fraction must be between 0 and 1 (exclusive)');
    }
    if (options.mutantFraction !== undefined && (options.mutantFraction <= 0 || options.mutantFraction >= 1)) {
      throw new ValidationError('Mutant fraction must be between 0 and 1 (exclusive)');
    }
    if (options.crossoverProb !== undefined && (options.crossoverProb < 0 || options.crossoverProb > 1)) {
      throw new ValidationError('Crossover probability must be between 0 and 1');
    }
    if (options.maxGenerations !== undefined && options.maxGenerations < 1) {
      throw new ValidationError('Max generations must be a positive integer');
    }
    if (options.warmStartProportion !== undefined && (options.warmStartProportion <= 0 || options.warmStartProportion >= 1)) {
      throw new ValidationError('Warm-start proportion must be between 0 and 1 (exclusive)');
    }
    if (options.islands !== undefined && options.islands < 1) {
      throw new ValidationError('islands must be a positive integer');
    }
    if (options.migrationInterval !== undefined && options.migrationInterval < 1) {
      throw new ValidationError('migrationInterval must be a positive integer');
    }
    if (options.migrantFraction !== undefined && (options.migrantFraction <= 0 || options.migrantFraction >= 1)) {
      throw new ValidationError('migrantFraction must be between 0 and 1 (exclusive)');
    }

    // Practical library defaults (paper spec: 30,000 pop / 20,000 gen)
    this.populationSize = options.populationSize ?? 100;
    this.eliteFraction = options.eliteFraction ?? 0.15;     // Paper spec
    this.mutantFraction = options.mutantFraction ?? 0.10;   // Paper spec
    this.crossoverProb = options.crossoverProb ?? 0.7;
    this.maxGenerations = options.maxGenerations ?? 100;    // Practical default

    // Warm-start from ALNS
    this.warmStartSolution = options.warmStartSolution ?? null;
    this.warmStartProportion = options.warmStartProportion ?? 0.15; // Paper spec
    this.logger = options.logger ?? defaultLogger;
    this.maxTimeMs = options.maxTimeMs ?? 0;
    this.onProgress = options.onProgress ?? null;
    this.islands = options.islands ?? 1;
    this.migrationInterval = options.migrationInterval ?? 50;
    this.migrantFraction = options.migrantFraction ?? 0.05;

    this.decoder = new Decoder(problem);
    this.chromosomeSize = problem.customers.length; // n genes per component; 4 components = 4n total
  }

  /**
   * @returns Best solution found after convergence or max generations
   */
  async solve(): Promise<VrpSolution> {
    const startTime = Date.now();
    if (this.islands > 1) {
      return this.solveIslands(startTime);
    }
    let population = this.initializePopulation();
    let bestIndividual: Individual | null = null;
    let generationsWithoutImprovement = 0;
    const maxStagnantGenerations = Math.floor(this.maxGenerations * 0.1); // 10% stagnation limit

    for (let g = 0; g < this.maxGenerations; g++) {
      // Timeout check
      if (this.maxTimeMs > 0 && Date.now() - startTime >= this.maxTimeMs) {
        this.logger.log(`BRKGA stopped early after ${g} generations (timeout)`);
        break;
      }

      // Evaluate
      for (const ind of population) {
        if (ind.fitness === null) {
          const solution = this.decoder.decode(ind.chromosome);
          ind.fitness = solution.isFeasible() ? solution.makespan : Infinity;
          ind.solution = solution;
        }
      }

      // Sort by fitness (lower is better)
      population.sort((a, b) => (a.fitness ?? Infinity) - (b.fitness ?? Infinity));

      // Update best
      const top = population[0];
      const topFitness = top?.fitness ?? Infinity;
      if (
        !bestIndividual ||
        (bestIndividual.fitness !== null && topFitness < bestIndividual.fitness)
      ) {
        if (!top) continue;
        bestIndividual = {
          chromosome: {
            priorities: [...top.chromosome.priorities],
            assignments: [...top.chromosome.assignments],
            dependencies: [...top.chromosome.dependencies],
            transfers: [...top.chromosome.transfers],
          },
          fitness: top.fitness,
          solution: top.solution?.clone() ?? null,
        };
        generationsWithoutImprovement = 0;
      } else {
        generationsWithoutImprovement++;
      }

      // Early termination if stagnant
      if (generationsWithoutImprovement >= maxStagnantGenerations) {
        break;
      }

      population = this.evolvePopulation(population);

      // Progress callback every 100 generations
      if (this.onProgress && g % 100 === 0) {
        this.onProgress({
          generation: g,
          maxGenerations: this.maxGenerations,
          bestMakespan: bestIndividual.fitness ?? Infinity,
          populationSize: this.populationSize,
        });
      }

      // Progress logging for long runs (every 10 generations)
      if (g % 10 === 0) {
        this.logger.log(`BRKGA Gen ${g}: Best makespan = ${(bestIndividual.fitness ?? Infinity).toFixed(2)}`);
      }
    }

    return (
      bestIndividual?.solution ?? this.decoder.decode(this.randomIndividual().chromosome)
    );
  }

  protected initializePopulation(): Individual[] {
    const population: Individual[] = [];

    // Warm-start: seed population with ALNS solution
    if (this.warmStartSolution) {
      const warmStartCount = Math.floor(this.populationSize * this.warmStartProportion);
      const warmStartChromosome = this.decoder.encode(this.warmStartSolution);

      for (let i = 0; i < warmStartCount; i++) {
        // Add slight mutations to warm-start chromosomes
        const mutatedChromosome = this.mutateChromosome(warmStartChromosome, 0.1);
        population.push({
          chromosome: mutatedChromosome,
          fitness: null,
          solution: null,
        });
      }
    }

    // Fill rest with random individuals
    const remaining = this.populationSize - population.length;
    for (let i = 0; i < remaining; i++) {
      population.push(this.randomIndividual());
    }

    return population;
  }

  protected randomIndividual(): Individual {
    const n = this.chromosomeSize;
    return {
      chromosome: {
        priorities: Array.from({ length: n }, () => Math.random()),
        assignments: Array.from({ length: n }, () => Math.random()),
        dependencies: Array.from({ length: n }, () => Math.random()),
        transfers: Array.from({ length: n }, () => Math.random()),
      },
      fitness: null,
      solution: null,
    };
  }

  protected crossover(elite: Individual, nonElite: Individual): Individual {
    const n = this.chromosomeSize;
    const child: Individual = {
      chromosome: {
        priorities: new Array<number>(n),
        assignments: new Array<number>(n),
        dependencies: new Array<number>(n),
        transfers: new Array<number>(n),
      },
      fitness: null,
      solution: null,
    };

    for (let i = 0; i < n; i++) {
      if (Math.random() < this.crossoverProb) {
        // Inherit from elite
        child.chromosome.priorities[i] = elite.chromosome.priorities[i]!;
        child.chromosome.assignments[i] = elite.chromosome.assignments[i]!;
        child.chromosome.dependencies[i] = elite.chromosome.dependencies[i]!;
        child.chromosome.transfers[i] = elite.chromosome.transfers[i]!;
      } else {
        // Inherit from non-elite
        child.chromosome.priorities[i] = nonElite.chromosome.priorities[i]!;
        child.chromosome.assignments[i] = nonElite.chromosome.assignments[i]!;
        child.chromosome.dependencies[i] = nonElite.chromosome.dependencies[i]!;
        child.chromosome.transfers[i] = nonElite.chromosome.transfers[i]!;
      }
    }

    return child;
  }

  /**
   * Evolves one generation of the population.
   * @param population - Current population (already evaluated and sorted)
   * @returns Next generation population
   */
  evolvePopulation(population: Individual[]): Individual[] {
    const nextPopulation: Individual[] = [];

    // Elite preservation
    const eliteCount = Math.floor(this.populationSize * this.eliteFraction);
    for (let i = 0; i < eliteCount; i++) {
      const elite = population[i];
      if (elite) {
        nextPopulation.push({ ...elite });
      }
    }

    // Mutants (random individuals)
    const mutantCount = Math.floor(this.populationSize * this.mutantFraction);
    for (let i = 0; i < mutantCount; i++) {
      nextPopulation.push(this.randomIndividual());
    }

    // Crossover (biased: always one elite parent)
    const crossoverCount = this.populationSize - nextPopulation.length;
    for (let i = 0; i < crossoverCount; i++) {
      const eliteParent = population[Math.floor(Math.random() * eliteCount)];
      const nonEliteParent =
        population[
          eliteCount + Math.floor(Math.random() * (this.populationSize - eliteCount))
        ];
      if (eliteParent && nonEliteParent) {
        nextPopulation.push(this.crossover(eliteParent, nonEliteParent));
      }
    }

    return nextPopulation;
  }

  /**
   * Solves using multiple island populations in parallel.
   * Stub: full implementation deferred to later tasks.
   */
  protected solveIslands(_startTime: number): Promise<VrpSolution> {
    this.logger.log(`Island-model BRKGA not yet implemented (requested ${this.islands} islands)`);
    return Promise.resolve(this.decoder.decode(this.randomIndividual().chromosome));
  }

  /**
   * Applies random mutation to a chromosome.
   * @param chromosome - The chromosome to mutate
   * @param rate - Probability of mutating each gene
   */
  protected mutateChromosome(chromosome: Chromosome, rate: number): Chromosome {
    const n = chromosome.priorities.length;
    const mutated: Chromosome = {
      priorities: [...chromosome.priorities],
      assignments: [...chromosome.assignments],
      dependencies: [...chromosome.dependencies],
      transfers: [...chromosome.transfers],
    };

    for (let i = 0; i < n; i++) {
      if (Math.random() < rate) {
        mutated.priorities[i] = Math.random();
      }
      if (Math.random() < rate) {
        mutated.assignments[i] = Math.random();
      }
      if (Math.random() < rate) {
        mutated.dependencies[i] = Math.random();
      }
      if (Math.random() < rate) {
        mutated.transfers[i] = Math.random();
      }
    }

    return mutated;
  }

  /**
   * @param population - Current population to search
   * @returns Best feasible solution in the population
   */
  getBestSolution(population: Individual[]): VrpSolution | null {
    const sorted = [...population].sort(
      (a, b) => (a.fitness ?? Infinity) - (b.fitness ?? Infinity),
    );
    return sorted[0]?.solution ?? null;
  }
}
