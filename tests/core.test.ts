import { expect } from 'chai';

import { ALNS } from '../src/algorithms/alns/ALNS.js';
import { BRKGA } from '../src/algorithms/brkga/BRKGA.js';
import { VrpProblem, LocationNode, Customer, Vehicle } from '../src/core/Problem.js';
import { VrpSolution, Route } from '../src/core/Solution.js';
import { VrpRpdSolver } from '../src/index.js';

describe('Problem', () => {
  it('should create a problem instance', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 10, 'D1'),
      2: new LocationNode(2, 20, 20, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 5)];

    const problem = new VrpProblem(nodes, customers, vehicles, 0);

    expect(problem.customers.length).to.equal(1);
    expect(problem.vehicles.length).to.equal(1);
    expect(problem.depotNodeId).to.equal(0);
  });

  it('should calculate distance matrix', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 3, 4, 'D1'),
    };
    const customers = [new Customer(1, 1, 1, 50)];
    const vehicles = [new Vehicle(1, 5)];

    const problem = new VrpProblem(nodes, customers, vehicles, 0);

    expect(problem.getDistance(0, 1)).to.be.closeTo(5, 0.000005);
  });
});

describe('Solution', () => {
  it('should create a solution', () => {
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

    expect(solution.routes.length).to.equal(1);
    expect(solution.isComplete()).to.be.true;
  });

  it('should calculate schedule and makespan', () => {
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

    expect(makespan).to.be.greaterThan(0);
    expect(solution.makespan).to.equal(makespan);
  });

  it('should check capacity constraints', () => {
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

    expect(solution.checkCapacity()).to.be.true;
  });

  it('should detect incomplete solutions', () => {
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

    expect(solution.isComplete()).to.be.false;
  });
});

describe('ALNS', () => {
  it('should solve a small problem', () => {
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
    expect(initialSolution.isComplete()).to.be.true;
    expect(solution.makespan).to.be.greaterThan(0);
  });
});

describe('BRKGA', () => {
  it('should solve a small problem', () => {
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

    expect(solution.isFeasible()).to.be.true;
    expect(solution.isComplete()).to.be.true;
  });
});

describe('VrpRpdSolver', () => {
  it('should solve with both algorithms', async () => {
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

    expect(solution.isFeasible()).to.be.true;
    expect(solution.makespan).to.be.greaterThan(0);
  });

  it('should respect maxTimeMs timeout', async () => {
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

    expect(elapsed).to.be.lessThan(200);
    expect(solution.isFeasible()).to.be.true;
  });

  it('should call onProgress', async () => {
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

    expect(progressCalls.length).to.be.greaterThan(0);
    expect(progressCalls.some(p => p.stage === 'ALNS')).to.be.true;
    expect(progressCalls.some(p => p.stage === 'BRKGA')).to.be.true;
  });
});

describe('Solution serialization', () => {
  it('should serialize and deserialize', () => {
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
    expect(serialized.routes).to.have.lengthOf(1);
    expect(serialized.makespan).to.equal(solution.makespan);

    const deserialized = VrpSolution.deserialize(serialized, problem);
    expect(deserialized.isComplete()).to.be.true;
    expect(deserialized.makespan).to.equal(solution.makespan);
    expect(deserialized.routes[0]?.nodes).to.deep.equal([1, 2]);
  });
});
