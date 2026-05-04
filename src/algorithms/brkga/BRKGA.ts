import { Decoder, type Chromosome } from './Decoder.js';
import { Solution } from '../../core/Solution.js';
import type { Problem } from '../../core/Problem.js';

export interface BRKGAOptions {
  populationSize?: number;
  eliteFraction?: number;
  mutantFraction?: number;
  crossoverProb?: number;
  maxGenerations?: number;
  warmStartSolution?: Solution | undefined;
  warmStartProportion?: number;
}

interface Individual {
  chromosome: Chromosome;
  fitness: number | null;
  solution: Solution | null;
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
  protected readonly problem: Problem;
  protected readonly populationSize: number;
  protected readonly eliteFraction: number;
  protected readonly mutantFraction: number;
  protected readonly crossoverProb: number;
  protected readonly maxGenerations: number;
  protected readonly decoder: Decoder;
  protected readonly chromosomeSize: number;

  // Warm-start configuration
  protected readonly warmStartSolution: Solution | null;
  protected readonly warmStartProportion: number;

  constructor(problem: Problem, options: BRKGAOptions = {}) {
    this.problem = problem;

    // Validate options
    if (options.populationSize !== undefined && options.populationSize < 1) {
      throw new Error('Population size must be a positive integer');
    }
    if (options.eliteFraction !== undefined && (options.eliteFraction <= 0 || options.eliteFraction >= 1)) {
      throw new Error('Elite fraction must be between 0 and 1 (exclusive)');
    }
    if (options.mutantFraction !== undefined && (options.mutantFraction <= 0 || options.mutantFraction >= 1)) {
      throw new Error('Mutant fraction must be between 0 and 1 (exclusive)');
    }
    if (options.crossoverProb !== undefined && (options.crossoverProb < 0 || options.crossoverProb > 1)) {
      throw new Error('Crossover probability must be between 0 and 1');
    }
    if (options.maxGenerations !== undefined && options.maxGenerations < 1) {
      throw new Error('Max generations must be a positive integer');
    }
    if (options.warmStartProportion !== undefined && (options.warmStartProportion <= 0 || options.warmStartProportion >= 1)) {
      throw new Error('Warm-start proportion must be between 0 and 1 (exclusive)');
    }

    // Paper defaults
    this.populationSize = options.populationSize ?? 30000;  // Paper spec
    this.eliteFraction = options.eliteFraction ?? 0.15;     // Paper spec
    this.mutantFraction = options.mutantFraction ?? 0.10;   // Paper spec
    this.crossoverProb = options.crossoverProb ?? 0.7;
    this.maxGenerations = options.maxGenerations ?? 20000; // Paper spec

    // Warm-start from ALNS
    this.warmStartSolution = options.warmStartSolution ?? null;
    this.warmStartProportion = options.warmStartProportion ?? 0.15; // Paper spec

    this.decoder = new Decoder(problem);
    this.chromosomeSize = problem.customers.length; // n genes per component (4 components)
  }

  solve(): Solution {
    let population = this.initializePopulation();
    let bestIndividual: Individual | null = null;
    let generationsWithoutImprovement = 0;
    const maxStagnantGenerations = Math.floor(this.maxGenerations * 0.1); // 10% stagnation limit

    for (let g = 0; g < this.maxGenerations; g++) {
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
      if (
        !bestIndividual ||
        (population[0]?.fitness ?? Infinity) < bestIndividual.fitness!
      ) {
        bestIndividual = { ...population[0]! };
        generationsWithoutImprovement = 0;
      } else {
        generationsWithoutImprovement++;
      }

      // Early termination if stagnant
      if (generationsWithoutImprovement >= maxStagnantGenerations) {
        break;
      }

      // Evolve
      const nextPopulation: Individual[] = [];

      // Elite preservation
      const eliteCount = Math.floor(this.populationSize * this.eliteFraction);
      for (let i = 0; i < eliteCount; i++) {
        nextPopulation.push({ ...population[i]! });
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

      population = nextPopulation;

      // Progress logging for long runs (every 1000 generations)
      if (g % 1000 === 0 && bestIndividual) {
        console.log(`BRKGA Gen ${g}: Best makespan = ${(bestIndividual.fitness ?? Infinity).toFixed(2)}`);
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
        priorities: new Array(n),
        assignments: new Array(n),
        dependencies: new Array(n),
        transfers: new Array(n),
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
   * Gets the current best solution found.
   */
  getBestSolution(population: Individual[]): Solution | null {
    const sorted = [...population].sort(
      (a, b) => (a.fitness ?? Infinity) - (b.fitness ?? Infinity),
    );
    return sorted[0]?.solution ?? null;
  }
}
