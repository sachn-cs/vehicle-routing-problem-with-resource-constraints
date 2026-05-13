import { expect } from 'chai';

import { BRKGA } from '../src/algorithms/brkga/BRKGA.js';
import { VrpProblem, LocationNode, Customer, Vehicle } from '../src/core/Problem.js';

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

describe('Island-Model BRKGA', () => {
  it('single-island fallback produces feasible solution', async () => {
    const problem = makeProblem();
    const brkga = new BRKGA(problem, { islands: 1, populationSize: 10, maxGenerations: 10 });
    const solution = await brkga.solve();
    expect(solution.isComplete()).to.be.true;
    expect(solution.isFeasible()).to.be.true;
    expect(solution.makespan).to.be.greaterThan(0);
  });

  it('two-island model produces feasible solution', async () => {
    const problem = makeProblem();
    const brkga = new BRKGA(problem, {
      islands: 2,
      populationSize: 20,
      maxGenerations: 30,
      migrationInterval: 10,
      migrantFraction: 0.1,
    });
    const solution = await brkga.solve();
    expect(solution.isComplete()).to.be.true;
    expect(solution.isFeasible()).to.be.true;
    expect(solution.makespan).to.be.greaterThan(0);
  });

  it('validates invalid island options', () => {
    const problem = makeProblem();
    expect(() => new BRKGA(problem, { islands: 0 })).to.throw('islands must be a positive integer');
    expect(() => new BRKGA(problem, { islands: -1 })).to.throw('islands must be a positive integer');
    expect(() => new BRKGA(problem, { migrationInterval: 0 })).to.throw('migrationInterval must be a positive integer');
    expect(() => new BRKGA(problem, { migrantFraction: 1.0 })).to.throw('migrantFraction must be between 0 and 1');
  });

  it('respects maxTimeMs with islands', async () => {
    const problem = makeProblem();
    const brkga = new BRKGA(problem, {
      islands: 2,
      populationSize: 20,
      maxGenerations: 500,
      maxTimeMs: 300,
    });
    const start = Date.now();
    const solution = await brkga.solve();
    const elapsed = Date.now() - start;
    expect(elapsed).to.be.lessThan(2000);
    expect(solution.isComplete()).to.be.true;
  });

  it('warm-start works with islands', async () => {
    const problem = makeProblem();
    const { ALNS } = await import('../src/algorithms/alns/ALNS.js');
    const alns = new ALNS(problem, { maxIterations: 5 });
    const warmStart = alns.solve();

    const brkga = new BRKGA(problem, {
      islands: 2,
      populationSize: 20,
      maxGenerations: 20,
      warmStartSolution: warmStart,
      warmStartProportion: 0.15,
    });
    const solution = await brkga.solve();
    expect(solution.isComplete()).to.be.true;
    expect(solution.isFeasible()).to.be.true;
  });
});
