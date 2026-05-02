import { Decoder } from './Decoder.js';

export class BRKGA {
  constructor(problem, options = {}) {
    this.problem = problem;
    this.populationSize = options.populationSize || 50;
    this.eliteFraction = options.eliteFraction || 0.2;
    this.mutantFraction = options.mutantFraction || 0.1;
    this.crossoverProb = options.crossoverProb || 0.7;
    this.maxGenerations = options.maxGenerations || 50;
    
    this.decoder = new Decoder(problem);
    this.chromosomeSize = problem.customers.length * 2; // 2 ops per customer (D, P)
  }

  solve() {
    let population = this.initializePopulation();
    let bestIndividual = null;

    for (let g = 0; g < this.maxGenerations; g++) {
      // Evaluate
      population.forEach(ind => {
        if (ind.fitness === null) {
          const solution = this.decoder.decode(ind.chromosome);
          ind.fitness = solution.isFeasible() ? solution.makespan : Infinity;
          ind.solution = solution;
        }
      });

      // Sort by fitness
      population.sort((a, b) => a.fitness - b.fitness);

      if (!bestIndividual || population[0].fitness < bestIndividual.fitness) {
        bestIndividual = { ...population[0] };
      }

      // Evolve
      const nextPopulation = [];
      
      // Elite preservation
      const eliteCount = Math.floor(this.populationSize * this.eliteFraction);
      for (let i = 0; i < eliteCount; i++) {
        nextPopulation.push(population[i]);
      }

      // Mutants
      const mutantCount = Math.floor(this.populationSize * this.mutantFraction);
      for (let i = 0; i < mutantCount; i++) {
        nextPopulation.push(this.randomIndividual());
      }

      // Crossover
      const crossoverCount = this.populationSize - nextPopulation.length;
      for (let i = 0; i < crossoverCount; i++) {
        const elite = population[Math.floor(Math.random() * eliteCount)];
        const nonElite = population[eliteCount + Math.floor(Math.random() * (this.populationSize - eliteCount))];
        nextPopulation.push(this.crossover(elite, nonElite));
      }

      population = nextPopulation;
    }

    return bestIndividual.solution;
  }

  initializePopulation() {
    return Array.from({ length: this.populationSize }, () => this.randomIndividual());
  }

  randomIndividual() {
    return {
      chromosome: {
        priorities: Array.from({ length: this.chromosomeSize }, () => Math.random()),
        preferences: Array.from({ length: this.chromosomeSize }, () => Math.random())
      },
      fitness: null,
      solution: null
    };
  }

  crossover(elite, nonElite) {
    const child = this.randomIndividual();
    for (let i = 0; i < this.chromosomeSize; i++) {
      if (Math.random() < this.crossoverProb) {
        child.chromosome.priorities[i] = elite.chromosome.priorities[i];
        child.chromosome.preferences[i] = elite.chromosome.preferences[i];
      } else {
        child.chromosome.priorities[i] = nonElite.chromosome.priorities[i];
        child.chromosome.preferences[i] = nonElite.chromosome.preferences[i];
      }
    }
    return child;
  }
}
