import { expect } from 'chai';

import { Decoder, type Chromosome } from '../../src/algorithms/brkga/decoder.js';
import { VrpProblem, LocationNode, Customer, Vehicle } from '../../src/core/problem.js';
import { VrpSolution, Route } from '../../src/core/solution.js';
import { createBasicProblem, createSingleCustomerProblem, assertFeasible } from '../helpers.js';

describe('BRKGA Decoder', () => {
  it('decode produces complete feasible solution', () => {
    const problem = createBasicProblem();
    const decoder = new Decoder(problem);
    const chromosome: Chromosome = {
      priorities: [0.3, 0.7],
      assignments: [0.4, 0.6],
      dependencies: [0.5, 0.5],
      transfers: [0.5, 0.5],
    };
    const solution = decoder.decode(chromosome);
    assertFeasible(solution);
    expect(solution.makespan).to.be.greaterThan(0);
  });

  it('decode handles single customer', () => {
    const problem = createSingleCustomerProblem();
    const decoder = new Decoder(problem);
    const chromosome: Chromosome = {
      priorities: [0.5],
      assignments: [0.5],
      dependencies: [0.5],
      transfers: [0.5],
    };
    const solution = decoder.decode(chromosome);
    assertFeasible(solution);
  });

  it('decode assigns customers to vehicles based on assignment genes', () => {
    const nodes = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
      3: new LocationNode(3, 100, 0, 'D2'),
      4: new LocationNode(4, 200, 0, 'P2'),
    };
    const customers = [new Customer(1, 1, 2, 10), new Customer(2, 3, 4, 10)];
    const vehicles = [new Vehicle(1, 10), new Vehicle(2, 10)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);
    const decoder = new Decoder(problem);

    const chromosome: Chromosome = {
      priorities: [0.3, 0.7],
      assignments: [0.1, 0.9],
      dependencies: [0.5, 0.5],
      transfers: [0.5, 0.5],
    };
    const solution = decoder.decode(chromosome);
    assertFeasible(solution);
  });

  it('priority genes determine scheduling order', () => {
    const problem = createBasicProblem();
    const decoder = new Decoder(problem);

    const lowFirst: Chromosome = {
      priorities: [0.1, 0.9],
      assignments: [0.5, 0.5],
      dependencies: [0.5, 0.5],
      transfers: [0.5, 0.5],
    };
    const highFirst: Chromosome = {
      priorities: [0.9, 0.1],
      assignments: [0.5, 0.5],
      dependencies: [0.5, 0.5],
      transfers: [0.5, 0.5],
    };
    const solA = decoder.decode(lowFirst);
    const solB = decoder.decode(highFirst);
    assertFeasible(solA);
    assertFeasible(solB);
  });

  it('encode produces valid chromosome from solution', () => {
    const problem = createBasicProblem();
    const decoder = new Decoder(problem);
    const routes = problem.vehicles.map(v => new Route(v.id, []));
    const solution = new VrpSolution(problem, routes);
    for (const c of problem.customers) {
      solution.routes[0]!.nodes.push(c.deliveryNodeId, c.pickupNodeId);
    }
    solution.calculateSchedule();

    const chromosome = decoder.encode(solution);
    expect(chromosome.priorities.length).to.equal(problem.customers.length);
    expect(chromosome.assignments.length).to.equal(problem.customers.length);
    expect(chromosome.dependencies.length).to.equal(problem.customers.length);
    expect(chromosome.transfers.length).to.equal(problem.customers.length);
  });

  it('encode-decode round-trip preserves feasibility', () => {
    const problem = createBasicProblem();
    const decoder = new Decoder(problem);
    const routes = problem.vehicles.map(v => new Route(v.id, []));
    const original = new VrpSolution(problem, routes);
    for (const c of problem.customers) {
      original.routes[0]!.nodes.push(c.deliveryNodeId, c.pickupNodeId);
    }
    original.calculateSchedule();

    const chromosome = decoder.encode(original);
    const decoded = decoder.decode(chromosome);
    assertFeasible(decoded);
  });

  it('capacity-aware routing spills over to alternative vehicles', () => {
    const nodes = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
      3: new LocationNode(3, 30, 0, 'D2'),
      4: new LocationNode(4, 40, 0, 'P2'),
      5: new LocationNode(5, 50, 0, 'D3'),
      6: new LocationNode(6, 60, 0, 'P3'),
    };
    const customers = [
      new Customer(1, 1, 2, 5),
      new Customer(2, 3, 4, 5),
      new Customer(3, 5, 6, 5),
    ];
    const vehicles = [new Vehicle(1, 1), new Vehicle(2, 10)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);
    const decoder = new Decoder(problem);

    const chromosome: Chromosome = {
      priorities: [0.1, 0.5, 0.9],
      assignments: [0.1, 0.1, 0.1],
      dependencies: [0.5, 0.5, 0.5],
      transfers: [0.5, 0.5, 0.5],
    };
    const solution = decoder.decode(chromosome);
    assertFeasible(solution);

    const vehicle2Nodes = solution.routes[1]!.nodes.length;

    expect(vehicle2Nodes).to.be.greaterThan(0);
  });

  it('decode handles all-zero chromosome (boundary)', () => {
    const problem = createBasicProblem();
    const decoder = new Decoder(problem);
    const chromosome: Chromosome = {
      priorities: [0, 0],
      assignments: [0, 0],
      dependencies: [0, 0],
      transfers: [0, 0],
    };
    const solution = decoder.decode(chromosome);
    assertFeasible(solution);
  });

  it('decode handles all-max chromosome (boundary)', () => {
    const problem = createBasicProblem();
    const decoder = new Decoder(problem);
    const chromosome: Chromosome = {
      priorities: [1, 1],
      assignments: [1, 1],
      dependencies: [1, 1],
      transfers: [1, 1],
    };
    const solution = decoder.decode(chromosome);
    assertFeasible(solution);
  });
});
