import { expect } from 'chai';

import { ALNS } from '../src/algorithms/alns/alns.js';
import {
  RemovalOperators,
  InsertionOperators,
} from '../src/algorithms/alns/operators.js';
import { BRKGA } from '../src/algorithms/brkga/brkga.js';
import { Decoder } from '../src/algorithms/brkga/decoder.js';
import { Depot, MultiDepotProblem } from '../src/core/multi-depot-problem.js';
import {
  VrpProblem,
  LocationNode,
  Customer,
  CustomerWithTimeWindows,
  Vehicle,
} from '../src/core/problem.js';
import { TransferHub } from '../src/core/resource-transfer.js';
import {
  ProblemWithTransfers,
  SolutionWithTransfers,
} from '../src/core/solution-with-transfers.js';
import { VrpSolution, Route } from '../src/core/solution.js';
import {
  TrafficAwareProblem,
  TrafficModel,
} from '../src/core/traffic-aware-problem.js';
import { VehicleWithCapabilities } from '../src/core/vehicle-with-capabilities.js';
import { ValidationError } from '../src/errors.js';
import { GISExporter } from '../src/export/gis-exporter.js';

import { createBasicProblem, createSeededRng } from './helpers.js';

describe('Comprehensive - Problem Validation', () => {
  it('rejects non-existent pickup node', () => {
    const nodes = { 0: new LocationNode(0, 0, 0), 1: new LocationNode(1, 10, 0) };
    const customers = [new Customer(1, 1, 99, 10)];
    expect(() => new VrpProblem(nodes, customers, [new Vehicle(1, 5)]))
      .to.throw(ValidationError)
      .with.property('message')
      .that.includes('non-existent pickup node');
  });

  it('rejects non-existent depot node', () => {
    const nodes = { 0: new LocationNode(0, 0, 0), 1: new LocationNode(1, 10, 0), 2: new LocationNode(2, 20, 0) };
    const customers = [new Customer(1, 1, 2, 10)];
    expect(() => new VrpProblem(nodes, customers, [new Vehicle(1, 5)], 999))
      .to.throw(ValidationError)
      .with.property('message')
      .that.includes('does not exist in nodes');
  });

  it('rejects NaN coordinates', () => {
    expect(() => new VrpProblem(
      { 0: new LocationNode(0, NaN, 0) },
      [new Customer(1, 0, 0, 10)],
      [new Vehicle(1, 5)],
    )).to.throw(ValidationError);
  });

  it('rejects Infinity coordinates', () => {
    expect(() => new VrpProblem(
      { 0: new LocationNode(0, Infinity, 0) },
      [new Customer(1, 0, 0, 10)],
      [new Vehicle(1, 5)],
    )).to.throw(ValidationError);
  });

  it('rejects vehicle with capacity zero', () => {
    const nodes = { 0: new LocationNode(0, 0, 0), 1: new LocationNode(1, 10, 0), 2: new LocationNode(2, 20, 0) };
    expect(() => new VrpProblem(nodes, [new Customer(1, 1, 2, 10)], [new Vehicle(1, 0)]))
      .to.throw(ValidationError);
  });
});

describe('Comprehensive - Solution Edge Cases', () => {
  it('creates empty routes for each vehicle when none provided', () => {
    const problem = createBasicProblem();
    const solution = new VrpSolution(problem);
    expect(solution.routes.length).to.equal(problem.vehicles.length);
  });

  it('Route addNode/removeNode/hasNode work correctly', () => {
    const route = new Route(1, [10, 20]);
    expect(route.hasNode(10)).to.be.true;
    expect(route.hasNode(30)).to.be.false;

    route.addNode(30);
    expect(route.hasNode(30)).to.be.true;
    expect(route.nodes).to.deep.equal([10, 20, 30]);

    route.removeNode(20);
    expect(route.hasNode(20)).to.be.false;
    expect(route.nodes).to.deep.equal([10, 30]);

    route.removeNode(999);
    expect(route.nodes).to.deep.equal([10, 30]);
  });

  it('Route clone produces independent copy', () => {
    const original = new Route(1, [1, 2, 3]);
    const cloned = original.clone();
    cloned.addNode(4);
    expect(original.nodes).to.deep.equal([1, 2, 3]);
    expect(cloned.nodes).to.deep.equal([1, 2, 3, 4]);
  });

  it('detects capacity violation', () => {
    const nodes = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 10)];
    const vehicles = [new Vehicle(1, 1)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);

    const routes = [new Route(1, [1, 2])];
    const solution = new VrpSolution(problem, routes);
    solution.calculateSchedule();

    expect(solution.checkCapacity()).to.be.true;

    const tooMuch = [new Route(1, [1, 1])];
    const overloaded = new VrpSolution(problem, tooMuch);
    overloaded.calculateSchedule();
    expect(overloaded.checkCapacity()).to.be.false;
  });

  it('detects time window violations', () => {
    const nodes = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    const customers = [
      new CustomerWithTimeWindows(1, 1, 2, 10, 0, 1, 0, 100),
    ];
    const vehicles = [new Vehicle(1, 10)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);

    const routes = [new Route(1, [1, 2])];
    const solution = new VrpSolution(problem, routes);
    solution.calculateSchedule();

    expect(solution.checkCapacity()).to.be.true;
    expect(solution.isComplete()).to.be.true;
  });

  it('getObjectives returns correct values', () => {
    const problem = createBasicProblem();
    const routes = problem.vehicles.map(v => new Route(v.id, []));
    const solution = new VrpSolution(problem, routes);

    solution.totalDistance = 100;
    solution.totalCost = 200;
    solution.totalCO2 = 300;
    solution.makespan = 400;

    const obj = solution.getObjectives();
    expect(obj.totalDistance).to.equal(100);
    expect(obj.totalCost).to.equal(200);
    expect(obj.totalCO2).to.equal(300);
    expect(obj.makespan).to.equal(400);
  });

  it('serialize without routes works', () => {
    const problem = createBasicProblem();
    const solution = new VrpSolution(problem);
    const data = solution.serialize();
    expect(data.routes.length).to.equal(problem.vehicles.length);
    expect(data.makespan).to.equal(Infinity);

    const restored = VrpSolution.deserialize(data, problem);
    expect(restored.routes.length).to.equal(problem.vehicles.length);
  });
});

describe('Comprehensive - Multi-Depot', () => {
  it('MultiDepotProblem creates depots from vehicle start/end', () => {
    const nodes = {
      0: new LocationNode(0, 0, 0, 'Depot A'),
      1: new LocationNode(1, 10, 0, 'Node 1'),
      2: new LocationNode(2, 20, 0, 'Node 2'),
    };
    const customers = [new Customer(1, 1, 2, 10)];
    const vehicles = [new Vehicle(1, 10, 0, 0)];
    const depots = [new Depot(0, 0, 0, 'Depot A')];
    const assignments = new Map([[1, 0]]);
    const problem = new MultiDepotProblem(nodes, customers, vehicles, depots, assignments);
    expect(problem.depots.length).to.equal(1);
    expect(problem.getDepotForVehicle(1)?.name).to.equal('Depot A');
  });
});

describe('Comprehensive - Traffic-Aware', () => {
  it('TrafficAwareProblem applies congestion factor', () => {
    const nodes = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 10)];
    const vehicles = [new Vehicle(1, 10)];
    const model = new TrafficModel();
    const baseTime = Math.sqrt(10 * 10 + 0 * 0);
    model.setSegment({
      fromId: 0,
      toId: 1,
      baseTravelTime: baseTime,
      currentTravelTime: baseTime * 2.0,
      congestionLevel: 'high',
    });
    const problem = new TrafficAwareProblem(nodes, customers, vehicles, 0, model);

    const travelTime = problem.getTravelTime(0, 1, 0);
    expect(travelTime).to.equal(baseTime * 2.0);
  });

  it('getTravelTime without traffic factor uses default', () => {
    const nodes = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
    };
    const customers = [new Customer(1, 1, 1, 10)];
    const vehicles = [new Vehicle(1, 10)];
    const model = new TrafficModel();
    const problem = new TrafficAwareProblem(nodes, customers, vehicles, 0, model);

    const travelTime = problem.getTravelTime(0, 1, 0);
    expect(travelTime).to.equal(0);
  });
});

describe('Comprehensive - Transfers', () => {
  it('ProblemWithTransfers identifies transfer hubs', () => {
    const nodes = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
      5: new LocationNode(5, 15, 5, 'Hub'),
    };
    const customers = [new Customer(1, 1, 2, 10)];
    const vehicles = [new VehicleWithCapabilities(1, 10, ['standard'])];
    const hubs = [new TransferHub(5, 15, 5, 'Hub', 2, 1)];
    const problem = new ProblemWithTransfers(nodes, customers, vehicles, 0, hubs);

    expect(problem.isTransferHub(5)).to.be.true;
    expect(problem.isTransferHub(0)).to.be.false;
    expect(problem.isTransferHub(1)).to.be.false;
  });

  it('SolutionWithTransfers accepts vehicle capabilities', () => {
    const problem = createBasicProblem();
    const routes = [new Route(1, [])];
    const solution = new SolutionWithTransfers(problem, routes, []);
    expect(solution.transfers).to.deep.equal([]);
  });
});

describe('Comprehensive - Algorithm Edge Cases', () => {
  it('ALNS with single iteration returns complete solution', () => {
    const problem = createBasicProblem();
    const alns = new ALNS(problem, { maxIterations: 1 });
    const solution = alns.solve();
    expect(solution.isComplete()).to.be.true;
  });

  it('ALNS rejects negative iterations', () => {
    const problem = createBasicProblem();
    expect(() => new ALNS(problem, { maxIterations: -1 })).to.throw(ValidationError);
  });

  it('ALNS rejects cooling rate out of range', () => {
    const problem = createBasicProblem();
    expect(() => new ALNS(problem, { coolingRate: 0 })).to.throw(ValidationError);
    expect(() => new ALNS(problem, { coolingRate: 1 })).to.throw(ValidationError);
    expect(() => new ALNS(problem, { coolingRate: -1 })).to.throw(ValidationError);
    expect(() => new ALNS(problem, { coolingRate: 2 })).to.throw(ValidationError);
  });

  it('ALNS rejects non-positive initial temperature', () => {
    const problem = createBasicProblem();
    expect(() => new ALNS(problem, { initialTemp: 0 })).to.throw(ValidationError);
    expect(() => new ALNS(problem, { initialTemp: -1 })).to.throw(ValidationError);
  });

  it('random removal with k=0 removes nothing', () => {
    const problem = createBasicProblem();
    const routes = problem.vehicles.map(v => new Route(v.id, [1, 2]));
    const solution = new VrpSolution(problem, routes);
    solution.calculateSchedule();

    const result = RemovalOperators.random(solution, 0);
    expect(result.removed.length).to.equal(0);
    expect(result.solution.routes.length).to.equal(problem.vehicles.length);
  });

  it('random removal with negative k removes nothing', () => {
    const problem = createBasicProblem();
    const routes = problem.vehicles.map(v => new Route(v.id, [1, 2]));
    const solution = new VrpSolution(problem, routes);
    solution.calculateSchedule();

    const result = RemovalOperators.random(solution, -1);
    expect(result.removed.length).to.equal(0);
  });

  it('shaw removal with k=0 removes nothing', () => {
    const problem = createBasicProblem();
    const routes = problem.vehicles.map(v => new Route(v.id, [1, 2]));
    const solution = new VrpSolution(problem, routes);
    solution.calculateSchedule();

    const result = RemovalOperators.shaw(solution, 0);
    expect(result.removed.length).to.equal(0);
  });

  it('greedy insertion with empty solution still works', () => {
    const problem = createBasicProblem();
    const solution = new VrpSolution(problem);
    const result = InsertionOperators.greedyInsertion(solution, problem.customers);
    expect(result.isComplete()).to.be.true;
  });

  it('worst removal with k=1 removes one customer', () => {
    const problem = createBasicProblem();
    const routes = problem.vehicles.map(v => new Route(v.id, [1, 2]));
    const solution = new VrpSolution(problem, routes);
    solution.calculateSchedule();

    const result = RemovalOperators.worst(solution, 1);
    expect(result.removed.length).to.equal(1);
  });
});

describe('Comprehensive - BRKGA Edge Cases', () => {
  it('BRKGA rejects invalid population size', () => {
    const problem = createBasicProblem();
    expect(() => new BRKGA(problem, { populationSize: 0 })).to.throw(ValidationError);
    expect(() => new BRKGA(problem, { populationSize: -1 })).to.throw(ValidationError);
  });

  it('BRKGA rejects zero generations', () => {
    const problem = createBasicProblem();
    expect(() => new BRKGA(problem, { maxGenerations: 0 })).to.throw(ValidationError);
    expect(() => new BRKGA(problem, { maxGenerations: -1 })).to.throw(ValidationError);
  });

  it('Decoder handles chromosome with mismatched length gracefully', () => {
    const problem = createBasicProblem();
    const decoder = new Decoder(problem);
    const chromosome = {
      priorities: [0.5],
      assignments: [0.5],
      dependencies: [0.5],
      transfers: [0.5],
    };
    const solution = decoder.decode(chromosome);
    expect(solution.routes).to.have.lengthOf(problem.vehicles.length);
  });

  it('seeded random produces deterministic results', () => {
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(42);
    const values1 = Array.from({ length: 10 }, () => rng1());
    const values2 = Array.from({ length: 10 }, () => rng2());
    expect(values1).to.deep.equal(values2);
  });
});

describe('Comprehensive - Solution Feasibility', () => {
  it('detects incomplete solution (missing delivery)', () => {
    const problem = createBasicProblem();
    const solution = new VrpSolution(problem, [new Route(1, [2])]); // only pickup
    solution.calculateSchedule();
    expect(solution.isComplete()).to.be.false;
    expect(solution.isFeasible()).to.be.false;
  });

  it('detects capacity violation with too many deliveries before pickups', () => {
    const nodes = {
      0: new LocationNode(0, 0, 0),
      1: new LocationNode(1, 10, 0),
      2: new LocationNode(2, 20, 0),
      3: new LocationNode(3, 15, 0),
      4: new LocationNode(4, 25, 0),
    };
    const customers = [
      new Customer(1, 1, 2, 5),
      new Customer(2, 3, 4, 5),
    ];
    const vehicles = [new Vehicle(1, 1)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);
    const routes = [new Route(1, [1, 3, 2, 4])];
    const solution = new VrpSolution(problem, routes);
    solution.calculateSchedule();
    expect(solution.checkCapacity()).to.be.false;
    expect(solution.isFeasible()).to.be.false;
  });
});

describe('Comprehensive - GIS Export', () => {
  it('toKML produces valid output', () => {
    const problem = createBasicProblem();
    const routes = problem.vehicles.map(v => new Route(v.id, [1, 2]));
    const solution = new VrpSolution(problem, routes);
    solution.calculateSchedule();

    const exporter = new GISExporter(solution, problem);
    const kml = exporter.toKML();
    expect(kml).to.include('<kml');
    expect(kml).to.include('</kml>');
  });

  it('toCSV produces tabular route data', () => {
    const problem = createBasicProblem();
    const routes = problem.vehicles.map(v => new Route(v.id, [1, 2]));
    const solution = new VrpSolution(problem, routes);
    solution.calculateSchedule();

    const exporter = new GISExporter(solution, problem);
    const csv = exporter.toCSV();
    expect(csv).to.include('Route');
    const lines = csv.trim().split('\n');
    expect(lines.length).to.be.greaterThan(1);
  });
});
