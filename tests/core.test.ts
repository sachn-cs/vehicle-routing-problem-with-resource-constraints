import { Problem, Node, Customer, Vehicle } from '../src/core/Problem.js';
import { Solution, Route } from '../src/core/Solution.js';
import { ALNS } from '../src/algorithms/alns/ALNS.js';
import { BRKGA } from '../src/algorithms/brkga/BRKGA.js';
import { VRP_RPD_Solver } from '../src/index.js';

describe('Problem', () => {
  test('should create a problem instance', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 10, 'D1'),
      2: new Node(2, 20, 20, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 5)];

    const problem = new Problem(nodes, customers, vehicles, 0);

    expect(problem.customers.length).toBe(1);
    expect(problem.vehicles.length).toBe(1);
    expect(problem.depotNodeId).toBe(0);
  });

  test('should calculate distance matrix', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 3, 4, 'D1'),
    };
    const customers = [new Customer(1, 1, 1, 50)];
    const vehicles = [new Vehicle(1, 5)];

    const problem = new Problem(nodes, customers, vehicles, 0);

    expect(problem.getDistance(0, 1)).toBeCloseTo(5, 5);
  });
});

describe('Solution', () => {
  test('should create a solution', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 10, 'D1'),
      2: new Node(2, 20, 20, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 5)];
    const problem = new Problem(nodes, customers, vehicles, 0);

    const routes = [new Route(1, [1, 2])];
    const solution = new Solution(problem, routes);

    expect(solution.routes.length).toBe(1);
    expect(solution.isComplete()).toBe(true);
  });

  test('should calculate schedule and makespan', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 5)];
    const problem = new Problem(nodes, customers, vehicles, 0);

    const routes = [new Route(1, [1, 2])];
    const solution = new Solution(problem, routes);
    const makespan = solution.calculateSchedule();

    expect(makespan).toBeGreaterThan(0);
    expect(solution.makespan).toBe(makespan);
  });

  test('should check capacity constraints', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 1)];
    const problem = new Problem(nodes, customers, vehicles, 0);

    const routes = [new Route(1, [1, 2])];
    const solution = new Solution(problem, routes);

    expect(solution.checkCapacity()).toBe(true);
  });

  test('should detect incomplete solutions', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 5)];
    const problem = new Problem(nodes, customers, vehicles, 0);

    const routes = [new Route(1, [1])]; // Missing pickup
    const solution = new Solution(problem, routes);

    expect(solution.isComplete()).toBe(false);
  });
});

describe('ALNS', () => {
  test('should solve a small problem', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
      3: new Node(3, 0, 10, 'D2'),
      4: new Node(4, 0, 20, 'P2'),
    };
    const customers = [new Customer(1, 1, 2, 50), new Customer(2, 3, 4, 50)];
    const vehicles = [new Vehicle(1, 10)];
    const problem = new Problem(nodes, customers, vehicles, 0);

    const alns = new ALNS(problem, { maxIterations: 10 });
    const solution = alns.solve();

    expect(solution.isFeasible()).toBe(true);
    expect(solution.isComplete()).toBe(true);
  });
});

describe('BRKGA', () => {
  test('should solve a small problem', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
      3: new Node(3, 0, 10, 'D2'),
      4: new Node(4, 0, 20, 'P2'),
    };
    const customers = [new Customer(1, 1, 2, 50), new Customer(2, 3, 4, 50)];
    const vehicles = [new Vehicle(1, 10)];
    const problem = new Problem(nodes, customers, vehicles, 0);

    const brkga = new BRKGA(problem, { populationSize: 10, maxGenerations: 10 });
    const solution = brkga.solve();

    expect(solution.isFeasible()).toBe(true);
    expect(solution.isComplete()).toBe(true);
  });
});

describe('VRP_RPD_Solver', () => {
  test('should solve with both algorithms', async () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 5)];
    const problem = new Problem(nodes, customers, vehicles, 0);

    const solver = new VRP_RPD_Solver(problem);
    const solution = await solver.solve({ alnsIterations: 10, maxGenerations: 10 });

    expect(solution.isFeasible()).toBe(true);
    expect(solution.makespan).toBeGreaterThan(0);
  });
});
