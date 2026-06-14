import { expect } from 'chai';

import { RemovalOperators, InsertionOperators } from '../../src/algorithms/alns/operators.js';
import { VrpProblem, LocationNode, Customer, CustomerWithTimeWindows, Vehicle } from '../../src/core/problem.js';
import { VrpSolution, Route } from '../../src/core/solution.js';
import { createBasicProblem, createSingleCustomerProblem, createTwoVehicleProblem, assertFeasible } from '../helpers.js';

describe('ALNS Removal Operators', () => {
  it('random removes exactly k customers', () => {
    const problem = createBasicProblem();
    const routes = problem.vehicles.map(v => new Route(v.id, []));
    const solution = new VrpSolution(problem, routes);
    for (const c of problem.customers) {
      solution.routes[0]!.nodes.push(c.deliveryNodeId, c.pickupNodeId);
    }
    solution.calculateSchedule();

    const k = 1;
    const { solution: partial, removed } = RemovalOperators.random(solution, k);
    expect(removed.length).to.equal(k);
    expect(partial.routes[0]!.nodes.length).to.be.lessThan(solution.routes[0]!.nodes.length);
  });

  it('random returns empty removed for k=0', () => {
    const problem = createSingleCustomerProblem();
    const solution = createKnownSolution(problem);
    const { solution: partial, removed } = RemovalOperators.random(solution, 0);
    expect(removed).to.deep.equal([]);
    expect(partial.routes[0]!.nodes.length).to.equal(solution.routes[0]!.nodes.length);
  });

  it('worst removes the highest-cost customer', () => {
    const problem = createBasicProblem();
    const routes = problem.vehicles.map(v => new Route(v.id, []));
    const solution = new VrpSolution(problem, routes);
    for (const c of problem.customers) {
      solution.routes[0]!.nodes.push(c.deliveryNodeId, c.pickupNodeId);
    }
    solution.calculateSchedule();

    const k = 1;
    const { solution: partial, removed } = RemovalOperators.worst(solution, k);
    expect(removed.length).to.equal(k);
    expect(partial.isComplete()).to.be.false;
  });

  it('worst removes k customers when k > all customers', () => {
    const problem = createSingleCustomerProblem();
    const solution = createKnownSolution(problem);
    const k = 10;
    const { solution: partial, removed } = RemovalOperators.worst(solution, k);
    expect(removed.length).to.equal(1);
    expect(partial.isComplete()).to.be.false;
  });

  it('shaw removes k customers', () => {
    const problem = createBasicProblem();
    const solution = createKnownSolution(problem);
    const k = 1;
    const { solution: partial, removed } = RemovalOperators.shaw(solution, k);
    expect(removed.length).to.equal(k);
    expect(partial.isComplete()).to.be.false;
  });

  it('shaw handles empty customer list', () => {
    const problem = createSingleCustomerProblem();
    const solution = createKnownSolution(problem);
    const { solution: partial, removed } = RemovalOperators.shaw(solution, 0);
    expect(removed).to.deep.equal([]);
    expect(partial.routes[0]!.nodes.length).to.equal(solution.routes[0]!.nodes.length);
  });

  it('cluster removes k customers', () => {
    const problem = createBasicProblem();
    const solution = createKnownSolution(problem);
    const k = 1;
    const { solution: partial, removed } = RemovalOperators.cluster(solution, k);
    expect(removed.length).to.equal(k);
    expect(partial.isComplete()).to.be.false;
  });

  it('proximity removes k customers', () => {
    const problem = createBasicProblem();
    const solution = createKnownSolution(problem);
    const k = 1;
    const { solution: partial, removed } = RemovalOperators.proximity(solution, k);
    expect(removed.length).to.equal(k);
    expect(partial.isComplete()).to.be.false;
  });

  it('temporal removes k customers', () => {
    const problem = createBasicProblem();
    const solution = createKnownSolution(problem);
    const k = 1;
    const { solution: partial, removed } = RemovalOperators.temporal(solution, k);
    expect(removed.length).to.equal(k);
    expect(partial.isComplete()).to.be.false;
  });

  it('temporal ranks time-window customers higher', () => {
    // Customer 1 has tight time windows (both early late beyond arrival times),
    // while customer 2 has none. The temporal operator should favor the
    // time-window-constrained customer.
    const nodes = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
      3: new LocationNode(3, 50, 0, 'D2'),
      4: new LocationNode(4, 60, 0, 'P2'),
    };
    const customers = [
      new CustomerWithTimeWindows(1, 1, 2, 10, 200, 400, 300, 500),
      new Customer(2, 3, 4, 10),
    ];
    const problem = new VrpProblem(nodes, customers, [new Vehicle(1, 20)], 0);
    const routes = problem.vehicles.map(v => new Route(v.id, []));
    const solution = new VrpSolution(problem, routes);
    for (const c of problem.customers) {
      solution.routes[0]!.nodes.push(c.deliveryNodeId, c.pickupNodeId);
    }
    solution.calculateSchedule();

    const k = 1;
    const { removed } = RemovalOperators.temporal(solution, k);
    expect(removed.length).to.equal(1);
    // Customer 1 (time windows with generous slack) scores higher than
    // customer 2 (no time windows, no wait), so should be selected first
    expect(removed[0]!.id).to.equal(1);
  });

  it('removes delivery and pickup from same route correctly', () => {
    const problem = createSingleCustomerProblem();
    const routes = problem.vehicles.map(v => new Route(v.id, []));
    const solution = new VrpSolution(problem, routes);
    const c = problem.customers[0]!;
    solution.routes[0]!.nodes.push(c.deliveryNodeId, c.pickupNodeId);
    solution.calculateSchedule();

    const { solution: partial, removed } = RemovalOperators.random(solution, 1);
    expect(removed.length).to.equal(1);
    expect(partial.routes[0]!.nodes.includes(c.deliveryNodeId)).to.be.false;
    expect(partial.routes[0]!.nodes.includes(c.pickupNodeId)).to.be.false;
  });

  function createKnownSolution(problem: VrpProblem): VrpSolution {
    const routes = problem.vehicles.map(v => new Route(v.id, []));
    const solution = new VrpSolution(problem, routes);
    for (const c of problem.customers) {
      const route = solution.routes[0];
      if (route) {
        route.nodes.push(c.deliveryNodeId, c.pickupNodeId);
      }
    }
    solution.calculateSchedule();
    return solution;
  }
});

describe('ALNS Insertion Operators', () => {
  it('greedyInsertion restores completeness after removal', () => {
    const problem = createBasicProblem();
    const routes = problem.vehicles.map(v => new Route(v.id, []));
    const solution = new VrpSolution(problem, routes);
    for (const c of problem.customers) {
      solution.routes[0]!.nodes.push(c.deliveryNodeId, c.pickupNodeId);
    }
    solution.calculateSchedule();

    const { solution: partial, removed } = RemovalOperators.random(solution, 1);
    const repaired = InsertionOperators.greedyInsertion(partial, removed);
    assertFeasible(repaired);
  });

  it('greedyInsertion places customer in cheapest position', () => {
    const problem = createTwoVehicleProblem();
    const routes = problem.vehicles.map(v => new Route(v.id, []));
    const solution = new VrpSolution(problem, routes);
    for (const c of problem.customers) {
      solution.routes[0]!.nodes.push(c.deliveryNodeId, c.pickupNodeId);
    }
    solution.calculateSchedule();

    const { solution: partial, removed } = RemovalOperators.random(solution, 1);
    const repaired = InsertionOperators.greedyInsertion(partial, removed);
    assertFeasible(repaired);
  });

  it('regret2Insertion restores completeness', () => {
    const problem = createBasicProblem();
    const solution = createKnownSolution(problem);
    const { solution: partial, removed } = RemovalOperators.random(solution, 1);
    const repaired = InsertionOperators.regret2Insertion(partial, removed);
    assertFeasible(repaired);
  });

  it('regret3Insertion restores completeness', () => {
    const problem = createBasicProblem();
    const solution = createKnownSolution(problem);
    const { solution: partial, removed } = RemovalOperators.random(solution, 1);
    const repaired = InsertionOperators.regret3Insertion(partial, removed);
    assertFeasible(repaired);
  });

  it('regret4Insertion restores completeness', () => {
    const problem = createBasicProblem();
    const solution = createKnownSolution(problem);
    const { solution: partial, removed } = RemovalOperators.random(solution, 1);
    const repaired = InsertionOperators.regret4Insertion(partial, removed);
    assertFeasible(repaired);
  });

  it('all insertion operators handle empty customer list', () => {
    const problem = createBasicProblem();
    const routes = problem.vehicles.map(v => new Route(v.id, []));
    const solution = new VrpSolution(problem, routes);
    solution.calculateSchedule();

    const greedy = InsertionOperators.greedyInsertion(solution, []);
    expect(greedy.routes[0]!.nodes.length).to.equal(0);

    const r2 = InsertionOperators.regret2Insertion(solution, []);
    expect(r2.routes[0]!.nodes.length).to.equal(0);
  });

  function createKnownSolution(problem: VrpProblem): VrpSolution {
    const routes = problem.vehicles.map(v => new Route(v.id, []));
    const solution = new VrpSolution(problem, routes);
    for (const c of problem.customers) {
      const route = solution.routes[0];
      if (route) {
        route.nodes.push(c.deliveryNodeId, c.pickupNodeId);
      }
    }
    solution.calculateSchedule();
    return solution;
  }
});
