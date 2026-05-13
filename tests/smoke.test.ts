import { ALNS } from '../src/algorithms/alns/ALNS.js';
import { BRKGA } from '../src/algorithms/brkga/BRKGA.js';
import { VrpProblem, LocationNode, Customer, Vehicle } from '../src/core/Problem.js';
import { VrpSolution, Route } from '../src/core/Solution.js';
import { expect } from 'chai';

describe('Smoke Tests', () => {
  const nodes: Record<number, LocationNode> = {
    0: new LocationNode(0, 0, 0, 'Depot'),
    1: new LocationNode(1, 10, 0, 'D1'),
    2: new LocationNode(2, 20, 0, 'P1'),
  };
  const customers = [new Customer(1, 1, 2, 50)];
  const vehicles = [new Vehicle(1, 5)];
  const problem = new VrpProblem(nodes, customers, vehicles, 0);

  it('creating problem instance', () => {
    expect(problem).to.exist;
  });

  it('calculating schedule', () => {
    const routes = [new Route(1, [1, 2])];
    const solution = new VrpSolution(problem, routes);
    const makespan = solution.calculateSchedule();
    expect(makespan).to.be.greaterThan(0);
  });

  it('ALNS solve', () => {
    const alns = new ALNS(problem, { maxIterations: 10 });
    const alnsSolution = alns.solve();
    expect(alnsSolution.isComplete()).to.be.true;
    expect(alnsSolution.makespan).to.be.greaterThan(0);
  });

  it('BRKGA solve', () => {
    const brkga = new BRKGA(problem, { populationSize: 10, maxGenerations: 10 });
    const brkgaSolution = brkga.solve();
    expect(brkgaSolution.isComplete()).to.be.true;
    expect(brkgaSolution.makespan).to.be.greaterThan(0);
  });

  it('ALNS input validation', () => {
    expect(() => {
      new ALNS(problem, { coolingRate: 1.5 });
    }).to.throw('Cooling rate');
  });

  it('BRKGA input validation', () => {
    expect(() => {
      new BRKGA(problem, { populationSize: -1 });
    }).to.throw('Population size');
  });
});
