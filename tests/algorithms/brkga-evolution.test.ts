import { expect } from 'chai';

import { BRKGA, type Individual } from '../../src/algorithms/brkga/brkga.js';
import { createBasicProblem, createSeededRng } from '../helpers.js';

describe('BRKGA Evolution', () => {
  it('crossover with prob=1 inherits all elite genes', () => {
    const problem = createBasicProblem();
    const brkga = new BRKGA(problem, { populationSize: 10, maxGenerations: 1 });

    const n = problem.customers.length;
    const elite: Individual = {
      chromosome: {
        priorities: Array<number>(n).fill(0.1),
        assignments: Array<number>(n).fill(0.2),
        dependencies: Array<number>(n).fill(0.3),
        transfers: Array<number>(n).fill(0.4),
      },
      fitness: 100,
      solution: null,
    };
    const nonElite: Individual = {
      chromosome: {
        priorities: Array<number>(n).fill(0.9),
        assignments: Array<number>(n).fill(0.8),
        dependencies: Array<number>(n).fill(0.7),
        transfers: Array<number>(n).fill(0.6),
      },
      fitness: 200,
      solution: null,
    };

    const rng = createSeededRng(42);
    const origRandom = Math.random;
    Math.random = rng;

    try {
      // Access protected method for testing
      // @ts-expect-error - accessing protected method for test
      const child = brkga.crossover(elite, nonElite);

      expect(child.chromosome.priorities.every(v => v === 0.1)).to.be.true;
      expect(child.chromosome.assignments.every(v => v === 0.2)).to.be.true;
      expect(child.chromosome.dependencies.every(v => v === 0.3)).to.be.true;
      expect(child.chromosome.transfers.every(v => v === 0.4)).to.be.true;
    } finally {
      Math.random = origRandom;
    }
  });

  it('evolvePopulation preserves correct elite/mutant/crossover counts', () => {
    const problem = createBasicProblem();
    const brkga = new BRKGA(problem, { populationSize: 100, maxGenerations: 1 });

    const pop: Individual[] = [];
    for (let i = 0; i < 100; i++) {
      pop.push({
        chromosome: {
          priorities: [Math.random(), Math.random()],
          assignments: [Math.random(), Math.random()],
          dependencies: [Math.random(), Math.random()],
          transfers: [Math.random(), Math.random()],
        },
        fitness: i,
        solution: null,
      });
    }

    const nextPop = brkga.evolvePopulation(pop);

    const eliteCount = Math.floor(100 * 0.15);

    expect(nextPop.length).to.equal(100);
    const numElite = nextPop.filter(ind => ind.fitness !== null).length;
    expect(numElite).to.equal(eliteCount);
  });

  it('elite individuals are at front of next population', () => {
    const problem = createBasicProblem();
    const brkga = new BRKGA(problem, { populationSize: 20, maxGenerations: 1 });

    const pop: Individual[] = [];
    for (let i = 0; i < 20; i++) {
      pop.push({
        chromosome: {
          priorities: [i / 20, i / 20],
          assignments: [i / 20, i / 20],
          dependencies: [i / 20, i / 20],
          transfers: [i / 20, i / 20],
        },
        fitness: i,
        solution: null,
      });
    }

    const nextPop = brkga.evolvePopulation(pop);
    const eliteCount = Math.floor(20 * 0.15);

    for (let i = 0; i < eliteCount; i++) {
      expect(nextPop[i]!.fitness).to.equal(i);
    }
  });

  it('initializePopulation creates correct number of individuals', () => {
    const problem = createBasicProblem();
    const brkga = new BRKGA(problem, { populationSize: 50, maxGenerations: 1 });

    const pop = brkga.initializePopulation();

    expect(pop.length).to.equal(50);
    for (const ind of pop) {
      expect(ind.chromosome.priorities.length).to.equal(problem.customers.length);
      expect(ind.chromosome.assignments.length).to.equal(problem.customers.length);
      expect(ind.chromosome.dependencies.length).to.equal(problem.customers.length);
      expect(ind.chromosome.transfers.length).to.equal(problem.customers.length);
    }
  });

  it('evolvePopulation handles minimum population size', () => {
    const problem = createBasicProblem();
    const brkga = new BRKGA(problem, { populationSize: 2, maxGenerations: 1 });

    const pop: Individual[] = [];
    for (let i = 0; i < 2; i++) {
      pop.push({
        chromosome: {
          priorities: [0.5, 0.5],
          assignments: [0.5, 0.5],
          dependencies: [0.5, 0.5],
          transfers: [0.5, 0.5],
        },
        fitness: i,
        solution: null,
      });
    }

    const nextPop = brkga.evolvePopulation(pop);
    expect(nextPop.length).to.equal(2);
  });

  it('evolvePopulation with stagnationRatio injects diversity through elite mutation', () => {
    const problem = createBasicProblem();
    const brkga = new BRKGA(problem, { populationSize: 100, maxGenerations: 1 });

    const pop: Individual[] = [];
    for (let i = 0; i < 100; i++) {
      pop.push({
        chromosome: {
          priorities: [0.25, 0.25],
          assignments: [0.25, 0.25],
          dependencies: [0.25, 0.25],
          transfers: [0.25, 0.25],
        },
        fitness: i,
        solution: null,
      });
    }

    const eliteCount = Math.floor(100 * 0.15);

    const origRandom = Math.random;
    Math.random = () => 0.01; // Ensure Math.random < 0.05 for mutations

    try {
      const stagnantPop = brkga.evolvePopulation(pop, 1.0);

      // With eliteMutationRate = 0.05 at stagnation=1, and Math.random always 0.01,
      // every gene in every elite should be mutated
      const allMutated = stagnantPop
        .slice(0, eliteCount)
        .every(e =>
          e.chromosome.priorities.every(g => g !== 0.25) &&
          e.chromosome.assignments.every(g => g !== 0.25) &&
          e.chromosome.dependencies.every(g => g !== 0.25) &&
          e.chromosome.transfers.every(g => g !== 0.25),
        );
      expect(allMutated).to.be.true;
    } finally {
      Math.random = origRandom;
    }
  });

  it('evolvePopulation with stagnationRatio > 0 mutates elite chromosomes for diversity', () => {
    const problem = createBasicProblem();
    const brkga = new BRKGA(problem, { populationSize: 20, maxGenerations: 1 });

    const eliteCount = Math.floor(20 * 0.15);

    // Create population where all elites have identical predictable chromosomes
    const pop: Individual[] = [];
    for (let i = 0; i < 20; i++) {
      const v = i < eliteCount ? 0.25 : 0.75;
      pop.push({
        chromosome: {
          priorities: [v, v],
          assignments: [v, v],
          dependencies: [v, v],
          transfers: [v, v],
        },
        fitness: i,
        solution: null,
      });
    }

    const rng = createSeededRng(99);
    const origRandom = Math.random;
    Math.random = rng;

    try {
      // With high stagnation, elite chromosomes should be mutated (not exact copies)
      const evolved = brkga.evolvePopulation(pop, 1.0);

      for (let i = 0; i < eliteCount; i++) {
        const e = evolved[i]!;
        const someGeneChanged =
          e.chromosome.priorities.some(g => g !== 0.25) ||
          e.chromosome.assignments.some(g => g !== 0.25) ||
          e.chromosome.dependencies.some(g => g !== 0.25) ||
          e.chromosome.transfers.some(g => g !== 0.25);

        // With eliteMutationRate = 0.05 and 4*2=8 genes, at least some elites
        // should have mutations (probability of 0 is negligible)
        if (someGeneChanged) {
          return; // test passes
        }
      }
      // If we get here, no elite had mutations — check again with more aggressive check
      const allUnchanged = evolved
        .slice(0, eliteCount)
        .every(e =>
          e.chromosome.priorities.every(g => g === 0.25) &&
          e.chromosome.assignments.every(g => g === 0.25) &&
          e.chromosome.dependencies.every(g => g === 0.25) &&
          e.chromosome.transfers.every(g => g === 0.25),
        );
      expect(allUnchanged).to.be.false;
    } finally {
      Math.random = origRandom;
    }
  });
});
