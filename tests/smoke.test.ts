import { ALNS } from '../src/algorithms/alns/ALNS';
import { BRKGA } from '../src/algorithms/brkga/BRKGA';
import { Problem, Node, Customer, Vehicle } from '../src/core/Problem';
import { Solution, Route } from '../src/core/Solution';

describe('Smoke Tests', () => {
  const nodes: Record<number, Node> = {
    0: new Node(0, 0, 0, 'Depot'),
    1: new Node(1, 10, 0, 'D1'),
    2: new Node(2, 20, 0, 'P1'),
  };
  const customers = [new Customer(1, 1, 2, 50)];
  const vehicles = [new Vehicle(1, 5)];
  const problem = new Problem(nodes, customers, vehicles, 0);

  test('creating problem instance', () => {
    expect(problem).toBeDefined();
  });

  test('calculating schedule', () => {
    const routes = [new Route(1, [1, 2])];
    const solution = new Solution(problem, routes);
    const makespan = solution.calculateSchedule();
    expect(makespan).toBeGreaterThan(0);
  });

  test('ALNS solve', () => {
    const alns = new ALNS(problem, { maxIterations: 10 });
    const alnsSolution = alns.solve();
    expect(alnsSolution.isComplete()).toBe(true);
    expect(alnsSolution.makespan).toBeGreaterThan(0);
  });

  test('BRKGA solve', () => {
    const brkga = new BRKGA(problem, { populationSize: 10, maxGenerations: 10 });
    const brkgaSolution = brkga.solve();
    expect(brkgaSolution.isComplete()).toBe(true);
    expect(brkgaSolution.makespan).toBeGreaterThan(0);
  });

  test('ALNS input validation', () => {
    expect(() => {
      new ALNS(problem, { coolingRate: 1.5 });
    }).toThrow('Cooling rate');
  });

  test('BRKGA input validation', () => {
    expect(() => {
      new BRKGA(problem, { populationSize: -1 });
    }).toThrow('Population size');
  });
});
