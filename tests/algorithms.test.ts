import { ALNS } from '../src/algorithms/alns/ALNS.js';
import { BRKGA } from '../src/algorithms/brkga/BRKGA.js';
import { VrpProblem, LocationNode, Customer, Vehicle } from '../src/core/Problem.js';
import { VrpSolution, Route } from '../src/core/Solution.js';

describe('Algorithm Correctness', () => {
  const makeProblem = () => {
    const nodes = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
      3: new LocationNode(3, 0, 10, 'D2'),
      4: new LocationNode(4, 0, 20, 'P2'),
    };
    const customers = [new Customer(1, 1, 2, 50), new Customer(2, 3, 4, 50)];
    const vehicles = [new Vehicle(1, 10)];
    return new VrpProblem(nodes, customers, vehicles, 0);
  };

  test('ALNS generateInitialSolution is always complete', () => {
    const problem = makeProblem();
    const alns = new ALNS(problem, { maxIterations: 1 });
    const solution = alns.generateInitialSolution();
    expect(solution.isComplete()).toBe(true);
    expect(solution.isFeasible()).toBe(true);
  });

  test('ALNS operator stats return consistent lengths', () => {
    const problem = makeProblem();
    const alns = new ALNS(problem, { maxIterations: 1 });
    alns.solve();
    const stats = alns.getOperatorStats();

    expect(stats.removalWeights.length).toBe(stats.removalOps.length);
    expect(stats.insertionWeights.length).toBe(stats.insertionOps.length);
    expect(stats.removalWeights.every(w => w > 0)).toBe(true);
    expect(stats.insertionWeights.every(w => w > 0)).toBe(true);
  });

  test('BRKGA warm-start roundtrip preserves feasibility', () => {
    const problem = makeProblem();
    const alns = new ALNS(problem, { maxIterations: 10 });
    const initial = alns.generateInitialSolution();

    const brkga = new BRKGA(problem, {
      populationSize: 10,
      maxGenerations: 5,
      warmStartSolution: initial,
    });
    const solution = brkga.solve();

    expect(solution.isFeasible()).toBe(true);
    expect(solution.isComplete()).toBe(true);
    expect(solution.makespan).toBeGreaterThan(0);
  });

  test('BRKGA with tiny population still returns complete solution', () => {
    const problem = makeProblem();
    const brkga = new BRKGA(problem, { populationSize: 2, maxGenerations: 2 });
    const solution = brkga.solve();

    expect(solution.isComplete()).toBe(true);
    expect(solution.makespan).toBeGreaterThan(0);
  });

  test('Decoder produces complete solution', () => {
    const problem = makeProblem();
    const brkga = new BRKGA(problem, { populationSize: 5, maxGenerations: 3 });
    const solution = brkga.solve();

    expect(solution.isComplete()).toBe(true);
    expect(solution.checkCapacity()).toBe(true);
  });
});
