import { VrpProblem, LocationNode, Customer, CustomerWithTimeWindows, Vehicle } from '../src/core/problem.js';
import { VrpSolution, Route } from '../src/core/solution.js';

export function createBasicProblem(): VrpProblem {
  const nodes = {
    0: new LocationNode(0, 0, 0, 'Depot'),
    1: new LocationNode(1, 10, 0, 'D1'),
    2: new LocationNode(2, 20, 0, 'P1'),
    3: new LocationNode(3, 0, 10, 'D2'),
    4: new LocationNode(4, 0, 20, 'P2'),
  };
  const customers = [
    new Customer(1, 1, 2, 50),
    new Customer(2, 3, 4, 50),
  ];
  const vehicles = [new Vehicle(1, 10)];
  return new VrpProblem(nodes, customers, vehicles, 0);
}

export function createTwoVehicleProblem(): VrpProblem {
  const nodes = {
    0: new LocationNode(0, 0, 0, 'Depot'),
    1: new LocationNode(1, 10, 0, 'D1'),
    2: new LocationNode(2, 20, 0, 'P1'),
    3: new LocationNode(3, 100, 0, 'D2'),
    4: new LocationNode(4, 200, 0, 'P2'),
  };
  const customers = [
    new Customer(1, 1, 2, 10),
    new Customer(2, 3, 4, 10),
  ];
  const vehicles = [
    new Vehicle(1, 10, 0, 0, 1, 1),
    new Vehicle(2, 10, 0, 0, 2, 2),
  ];
  return new VrpProblem(nodes, customers, vehicles, 0);
}

export function createThreeCustomerProblem(): VrpProblem {
  const nodes = {
    0: new LocationNode(0, 0, 0, 'Depot'),
    1: new LocationNode(1, 10, 0, 'D1'),
    2: new LocationNode(2, 20, 0, 'P1'),
    3: new LocationNode(3, 10, 10, 'D2'),
    4: new LocationNode(4, 20, 10, 'P2'),
    5: new LocationNode(5, 10, 20, 'D3'),
    6: new LocationNode(6, 20, 20, 'P3'),
  };
  const customers = [
    new Customer(1, 1, 2, 30),
    new Customer(2, 3, 4, 30),
    new Customer(3, 5, 6, 30),
  ];
  const vehicles = [new Vehicle(1, 20)];
  return new VrpProblem(nodes, customers, vehicles, 0);
}

export function createTimeWindowProblem(): VrpProblem {
  const nodes = {
    0: new LocationNode(0, 0, 0, 'Depot'),
    1: new LocationNode(1, 10, 0, 'D1'),
    2: new LocationNode(2, 20, 0, 'P1'),
    3: new LocationNode(3, 100, 0, 'D2'),
    4: new LocationNode(4, 200, 0, 'P2'),
  };
  const customers = [
    new CustomerWithTimeWindows(1, 1, 2, 10, 50, 200, 70, 250),
    new Customer(2, 3, 4, 10),
  ];
  const vehicles = [new Vehicle(1, 20)];
  return new VrpProblem(nodes, customers, vehicles, 0);
}

export function createSingleCustomerProblem(): VrpProblem {
  const nodes = {
    0: new LocationNode(0, 0, 0, 'Depot'),
    1: new LocationNode(1, 10, 0, 'D1'),
    2: new LocationNode(2, 20, 0, 'P1'),
  };
  const customers = [new Customer(1, 1, 2, 50)];
  const vehicles = [new Vehicle(1, 5)];
  return new VrpProblem(nodes, customers, vehicles, 0);
}

export function createKnownSolution(problem: VrpProblem): VrpSolution {
  const routes = problem.vehicles.map(v => new Route(v.id, []));
  const solution = new VrpSolution(problem, routes);
  for (const c of problem.customers) {
    const route = solution.routes[0];
    if (route) {
      route.nodes.push(c.deliveryNodeId);
      route.nodes.push(c.pickupNodeId);
    }
  }
  solution.calculateSchedule();
  return solution;
}

export function assertFeasible(solution: VrpSolution): void {
  if (!solution.isComplete()) {
    throw new Error('Solution is not complete');
  }
  if (!solution.checkCapacity()) {
    throw new Error('Solution violates capacity constraints');
  }
  if (!solution.isFeasible()) {
    throw new Error('Solution is not feasible');
  }
}

/** Simple seeded PRNG for reproducible tests. */
export function createSeededRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
}
