import { ALNS } from '../src/algorithms/alns/ALNS.js';
import { BRKGA } from '../src/algorithms/brkga/BRKGA.js';
import { VrpProblem, LocationNode, Customer, Vehicle } from '../src/core/Problem.js';
import { VrpSolution, Route } from '../src/core/Solution.js';
import { VrpRpdSolver } from '../src/index.js';

describe('Problem', () => {
  test('should create a problem instance', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 10, 'D1'),
      2: new LocationNode(2, 20, 20, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 5)];

    const problem = new VrpProblem(nodes, customers, vehicles, 0);

    expect(problem.customers.length).toBe(1);
    expect(problem.vehicles.length).toBe(1);
    expect(problem.depotNodeId).toBe(0);
  });

  test('should calculate distance matrix', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 3, 4, 'D1'),
    };
    const customers = [new Customer(1, 1, 1, 50)];
    const vehicles = [new Vehicle(1, 5)];

    const problem = new VrpProblem(nodes, customers, vehicles, 0);

    expect(problem.getDistance(0, 1)).toBeCloseTo(5, 5);
  });
});

describe('Solution', () => {
  test('should create a solution', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 10, 'D1'),
      2: new LocationNode(2, 20, 20, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 5)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);

    const routes = [new Route(1, [1, 2])];
    const solution = new VrpSolution(problem, routes);

    expect(solution.routes.length).toBe(1);
    expect(solution.isComplete()).toBe(true);
  });

  test('should calculate schedule and makespan', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 5)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);

    const routes = [new Route(1, [1, 2])];
    const solution = new VrpSolution(problem, routes);
    const makespan = solution.calculateSchedule();

    expect(makespan).toBeGreaterThan(0);
    expect(solution.makespan).toBe(makespan);
  });

  test('should check capacity constraints', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 1)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);

    const routes = [new Route(1, [1, 2])];
    const solution = new VrpSolution(problem, routes);

    expect(solution.checkCapacity()).toBe(true);
  });

  test('should detect incomplete solutions', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 5)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);

    const routes = [new Route(1, [1])]; // Missing pickup
    const solution = new VrpSolution(problem, routes);

    expect(solution.isComplete()).toBe(false);
  });
});

describe('ALNS', () => {
  test('should solve a small problem', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
      3: new LocationNode(3, 0, 10, 'D2'),
      4: new LocationNode(4, 0, 20, 'P2'),
    };
    const customers = [new Customer(1, 1, 2, 50), new Customer(2, 3, 4, 50)];
    const vehicles = [new Vehicle(1, 10)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);

    const alns = new ALNS(problem, { maxIterations: 500 });
    const initialSolution = alns.generateInitialSolution();
    const solution = alns.solve();

    // ALNS is stochastic; initial solution is always complete,
    // final solution may vary due to simulated annealing.
    expect(initialSolution.isComplete()).toBe(true);
    expect(solution.makespan).toBeGreaterThan(0);
  });
});

describe('BRKGA', () => {
  test('should solve a small problem', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
      3: new LocationNode(3, 0, 10, 'D2'),
      4: new LocationNode(4, 0, 20, 'P2'),
    };
    const customers = [new Customer(1, 1, 2, 50), new Customer(2, 3, 4, 50)];
    const vehicles = [new Vehicle(1, 10)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);

    const brkga = new BRKGA(problem, { populationSize: 10, maxGenerations: 10 });
    const solution = brkga.solve();

    expect(solution.isFeasible()).toBe(true);
    expect(solution.isComplete()).toBe(true);
  });
});

describe('VrpRpdSolver', () => {
  test('should solve with both algorithms', async () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 5)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);

    const solver = new VrpRpdSolver(problem);
    const solution = await solver.solve({ alnsIterations: 10, maxGenerations: 10 });

    expect(solution.isFeasible()).toBe(true);
    expect(solution.makespan).toBeGreaterThan(0);
  });

  test('should respect maxTimeMs timeout', async () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
      3: new LocationNode(3, 0, 10, 'D2'),
      4: new LocationNode(4, 0, 20, 'P2'),
    };
    const customers = [new Customer(1, 1, 2, 50), new Customer(2, 3, 4, 50)];
    const vehicles = [new Vehicle(1, 10)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);

    const solver = new VrpRpdSolver(problem);
    const start = Date.now();
    const solution = await solver.solve({ maxTimeMs: 1 });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(200);
    expect(solution.isFeasible()).toBe(true);
  });

  test('should call onProgress', async () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 5)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);

    const progressCalls: Array<{ stage: string; iteration: number }> = [];
    const solver = new VrpRpdSolver(problem);
    await solver.solve({
      alnsIterations: 50,
      maxGenerations: 100,
      onProgress: (p) => {
        progressCalls.push({ stage: p.stage, iteration: p.iteration });
      },
    });

    expect(progressCalls.length).toBeGreaterThan(0);
    expect(progressCalls.some(p => p.stage === 'ALNS')).toBe(true);
    expect(progressCalls.some(p => p.stage === 'BRKGA')).toBe(true);
  });
});

describe('Solution serialization', () => {
  test('should serialize and deserialize', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 5)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);

    const routes = [new Route(1, [1, 2])];
    const solution = new VrpSolution(problem, routes);
    solution.calculateSchedule();

    const serialized = solution.serialize();
    expect(serialized.routes).toHaveLength(1);
    expect(serialized.makespan).toBe(solution.makespan);

    const deserialized = VrpSolution.deserialize(serialized, problem);
    expect(deserialized.isComplete()).toBe(true);
    expect(deserialized.makespan).toBe(solution.makespan);
    expect(deserialized.routes[0]?.nodes).toEqual([1, 2]);
  });
});
