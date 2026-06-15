import { resolve } from 'path';
import { Worker } from 'worker_threads';

import type { VrpProblem } from '../../core/problem.js';
import type { VrpSolution } from '../../core/solution.js';
import { ValidationError } from '../../errors.js';
import type { Logger } from '../../logger.js';
import { defaultLogger } from '../../logger.js';

import { Decoder, type Chromosome } from './decoder.js';
import { sendCommand } from './island-messenger.js';

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
  public readonly decoder: Decoder;
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
    if (
      options.eliteFraction !== undefined &&
      (options.eliteFraction <= 0 || options.eliteFraction >= 1)
    ) {
      throw new ValidationError('Elite fraction must be between 0 and 1 (exclusive)');
    }
    if (
      options.mutantFraction !== undefined &&
      (options.mutantFraction <= 0 || options.mutantFraction >= 1)
    ) {
      throw new ValidationError('Mutant fraction must be between 0 and 1 (exclusive)');
    }
    if (
      options.crossoverProb !== undefined &&
      (options.crossoverProb < 0 || options.crossoverProb > 1)
    ) {
      throw new ValidationError('Crossover probability must be between 0 and 1');
    }
    if (options.maxGenerations !== undefined && options.maxGenerations < 1) {
      throw new ValidationError('Max generations must be a positive integer');
    }
    if (
      options.warmStartProportion !== undefined &&
      (options.warmStartProportion <= 0 || options.warmStartProportion >= 1)
    ) {
      throw new ValidationError('Warm-start proportion must be between 0 and 1 (exclusive)');
    }
    if (options.islands !== undefined && options.islands < 1) {
      throw new ValidationError('islands must be a positive integer');
    }
    if (options.migrationInterval !== undefined && options.migrationInterval < 1) {
      throw new ValidationError('migrationInterval must be a positive integer');
    }
    if (
      options.migrantFraction !== undefined &&
      (options.migrantFraction <= 0 || options.migrantFraction >= 1)
    ) {
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
    this.chromosomeSize = problem.customers.length;
    // n genes per component; 4 components = 4n total
  }

  /**
   * @returns Best solution found after convergence or max generations
   */
  async solve(): Promise<VrpSolution> {
    const startTime = Date.now();
    if (this.islands > 1) {
      return this.solveIslands(startTime);
    }
    return this.runSingleIsland(startTime);
  }

  initializePopulation(): Individual[] {
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
        priorities: Array.from<number>({ length: n }),
        assignments: Array.from<number>({ length: n }),
        dependencies: Array.from<number>({ length: n }),
        transfers: Array.from<number>({ length: n }),
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
   * @param stagnationRatio - 0..1 indicating how long since last improvement
   * @returns Next generation population
   */
  evolvePopulation(population: Individual[], stagnationRatio: number = 0): Individual[] {
    const nextPopulation: Individual[] = [];

    const eliteCount = Math.floor(this.populationSize * this.eliteFraction);

    // Elite preservation with mild mutation for diversity
    const eliteMutationRate = Math.min(0.05, stagnationRatio * 0.1);
    for (let i = 0; i < eliteCount; i++) {
      const elite = population[i];
      if (!elite) continue;
      const mutated = eliteMutationRate > 0;
      nextPopulation.push({
        ...elite,
        chromosome: mutated
          ? this.mutateChromosome(elite.chromosome, eliteMutationRate)
          : { ...elite.chromosome },
        fitness: mutated ? null : elite.fitness,
        solution: mutated ? null : elite.solution,
      });
    }

    // Mutants + immigrants (more mutants when stagnant)
    const baseMutantCount = Math.floor(this.populationSize * this.mutantFraction);
    const extraMutants = Math.floor(stagnationRatio * this.populationSize * 0.05);
    const mutantCount = Math.min(baseMutantCount + extraMutants, this.populationSize - eliteCount);
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

  protected runSingleIsland(startTime: number): VrpSolution {
    let population = this.initializePopulation();
    let hallOfFame: Individual | null = null;
    let generationsWithoutImprovement = 0;
    const maxStagnantGenerations = Math.floor(this.maxGenerations * 0.1);

    for (let g = 0; g < this.maxGenerations; g++) {
      if (this.maxTimeMs > 0 && Date.now() - startTime >= this.maxTimeMs) {
        this.logger.log(`BRKGA stopped early after ${g} generations (timeout)`);
        break;
      }

      for (const ind of population) {
        if (ind.fitness === null) {
          const solution = this.decoder.decode(ind.chromosome);
          ind.fitness = solution.isFeasible() ? solution.makespan : Infinity;
          ind.solution = solution;
        }
      }

      population.sort((a, b) => (a.fitness ?? Infinity) - (b.fitness ?? Infinity));

      const top = population[0];
      const topFitness = top?.fitness ?? Infinity;
      if (
        !hallOfFame ||
        (hallOfFame.fitness !== null && topFitness < hallOfFame.fitness)
      ) {
        if (!top) continue;
        hallOfFame = {
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

      if (generationsWithoutImprovement >= maxStagnantGenerations) {
        // Inject fresh random individuals before giving up
        const injectionCount = Math.floor(this.populationSize * 0.2);
        for (let i = 0; i < injectionCount; i++) {
          population[population.length - 1 - i] = this.randomIndividual();
        }
        generationsWithoutImprovement = Math.floor(maxStagnantGenerations * 0.8);
        continue;
      }

      const stagnationRatio = Math.min(1, generationsWithoutImprovement / maxStagnantGenerations);
      population = this.evolvePopulation(population, stagnationRatio);

      if (this.onProgress && g % 100 === 0) {
        this.onProgress({
          generation: g,
          maxGenerations: this.maxGenerations,
          bestMakespan: hallOfFame.fitness ?? Infinity,
          populationSize: this.populationSize,
        });
      }

      if (g % 10 === 0) {
        this.logger.log(
          `BRKGA Gen ${g}: Best makespan = ${(hallOfFame.fitness ?? Infinity).toFixed(2)}`,
        );
      }
    }

    return (
      hallOfFame?.solution ?? this.decoder.decode(this.randomIndividual().chromosome)
    );
  }

  protected async solveIslands(startTime: number): Promise<VrpSolution> {
    const islandPopulationSize = Math.max(10, Math.floor(this.populationSize / this.islands));
    const islandMaxGenerations = this.maxGenerations;
    const workerPath = resolve(process.cwd(), 'dist', 'worker.js');

    const workers: Worker[] = [];

    for (let i = 0; i < this.islands; i++) {
      const worker = new Worker(workerPath, {
        workerData: {
          nodes: this.problem.nodes,
          customers: this.problem.customers,
          vehicles: this.problem.vehicles,
          depotNodeId: this.problem.depotNodeId,
          type: 'island-brkga',
          islandId: i,
          options: {
            populationSize: islandPopulationSize,
            eliteFraction: this.eliteFraction,
            mutantFraction: this.mutantFraction,
            crossoverProb: this.crossoverProb,
            maxGenerations: islandMaxGenerations,
            islandPopulationSize,
            islandMaxGenerations,
            migrationInterval: this.migrationInterval,
            warmStartSolution: this.warmStartSolution,
            warmStartProportion: this.warmStartProportion,
            maxTimeMs: this.maxTimeMs,
          },
        },
      });
      workers.push(worker);
    }

    let globalBest: Individual | null = null;
    let generation = 0;

    try {
      await Promise.all(
        workers.map(w => sendCommand(w, { type: 'evolve', generations: 0 })),
      );

      while (generation < this.maxGenerations) {
        if (this.maxTimeMs > 0 && Date.now() - startTime >= this.maxTimeMs) {
          this.logger.log('Island BRKGA stopping early (global timeout)');
          break;
        }

        const evolveResults = await Promise.all(
          workers.map(w =>
            sendCommand(w, { type: 'evolve', generations: this.migrationInterval }),
          ),
        );

        const populations: Individual[][] = [];
        for (const result of evolveResults) {
          if (result.type === 'checkpoint') {
            populations.push(result.population);
            const islandBest = result.population[0] ?? null;
            if (
              islandBest &&
              (globalBest === null ||
                (
                islandBest.fitness !== null &&
                islandBest.fitness < (globalBest.fitness ?? Infinity)
              ))
            ) {
              globalBest = {
                chromosome: {
                  priorities: [...islandBest.chromosome.priorities],
                  assignments: [...islandBest.chromosome.assignments],
                  dependencies: [...islandBest.chromosome.dependencies],
                  transfers: [...islandBest.chromosome.transfers],
                },
                fitness: islandBest.fitness,
                solution: islandBest.solution?.clone() ?? null,
              };
            }
          }
        }

        generation += this.migrationInterval;

        if (this.onProgress && generation % 100 === 0) {
          this.onProgress({
            generation,
            maxGenerations: this.maxGenerations,
            bestMakespan: globalBest?.fitness ?? Infinity,
            populationSize: this.populationSize,
          });
        }

        if (generation >= this.maxGenerations) break;

        const migrantCount = Math.max(1, Math.floor(islandPopulationSize * this.migrantFraction));
        const allMigrants: Chromosome[] = [];
        for (const pop of populations) {
          for (let i = 0; i < migrantCount; i++) {
            const donor = pop[i];
            if (donor) {
              allMigrants.push({
                priorities: [...donor.chromosome.priorities],
                assignments: [...donor.chromosome.assignments],
                dependencies: [...donor.chromosome.dependencies],
                transfers: [...donor.chromosome.transfers],
              });
            }
          }
        }

        for (let i = allMigrants.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const temp = allMigrants[i]!;
          allMigrants[i] = allMigrants[j]!;
          allMigrants[j] = temp;
        }

        const migrantsPerIsland = Math.max(1, Math.floor(allMigrants.length / this.islands));
        const injectPromises: Promise<unknown>[] = [];
        workers.forEach((worker, i) => {
          const startIdx = i * migrantsPerIsland;
          const slice = allMigrants.slice(startIdx, startIdx + migrantsPerIsland);
          injectPromises.push(sendCommand(worker, { type: 'inject', migrants: slice }));
        });
        await Promise.all(injectPromises);
      }

      const finishResults = await Promise.all(
        workers.map(w => sendCommand(w, { type: 'finish' })),
      );

      for (const result of finishResults) {
        if (result.type === 'finish' && result.bestIndividual) {
          const ind = result.bestIndividual;
          if (
            globalBest === null ||
            (ind.fitness !== null && ind.fitness < (globalBest.fitness ?? Infinity))
          ) {
            globalBest = ind;
          }
        }
      }
    } catch (err) {
      this.logger.log(
        `Island BRKGA worker failed: ${err instanceof Error ? err.message : String(err)}. ` +
        `Falling back to single-island.`,
      );
      for (const w of workers) {
        void w.terminate();
      }
      return this.runSingleIsland(startTime);
    }

    for (const w of workers) {
      void w.terminate();
    }

    return (
      globalBest?.solution ?? this.decoder.decode(this.randomIndividual().chromosome)
    );
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
