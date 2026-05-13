import { VrpProblem, LocationNode, Customer, Vehicle } from '../src/core/Problem.js';
import { VrpSolution, Route } from '../src/core/Solution.js';
import { ValidationError } from '../src/errors.js';

describe('Edge Cases', () => {
  test('rejects empty nodes', () => {
    expect(() => new VrpProblem({}, [], [new Vehicle(1, 5)])).toThrow(ValidationError);
  });

  test('rejects empty customers', () => {
    expect(() => new VrpProblem({ 0: new LocationNode(0, 0, 0) }, [], [new Vehicle(1, 5)])).toThrow(ValidationError);
  });

  test('rejects empty vehicles', () => {
    expect(() => new VrpProblem({ 0: new LocationNode(0, 0, 0) }, [new Customer(1, 0, 0, 10)], [])).toThrow(ValidationError);
  });

  test('rejects duplicate customer IDs', () => {
    const nodes = { 0: new LocationNode(0, 0, 0), 1: new LocationNode(1, 1, 1) };
    const customers = [new Customer(1, 1, 1, 10), new Customer(1, 1, 1, 10)];
    expect(() => new VrpProblem(nodes, customers, [new Vehicle(1, 5)])).toThrow(ValidationError);
  });

  test('rejects duplicate vehicle IDs', () => {
    const nodes = { 0: new LocationNode(0, 0, 0), 1: new LocationNode(1, 1, 1) };
    const customers = [new Customer(1, 1, 1, 10)];
    expect(() => new VrpProblem(nodes, customers, [new Vehicle(1, 5), new Vehicle(1, 5)])).toThrow(ValidationError);
  });

  test('rejects negative coordinates', () => {
    expect(() => new VrpProblem(
      { 0: new LocationNode(0, -1, 0) },
      [new Customer(1, 0, 0, 10)],
      [new Vehicle(1, 5)]
    )).toThrow(ValidationError);
  });

  test('rejects zero capacity', () => {
    expect(() => new VrpProblem(
      { 0: new LocationNode(0, 0, 0), 1: new LocationNode(1, 1, 1) },
      [new Customer(1, 1, 1, 10)],
      [new Vehicle(1, 0)]
    )).toThrow(ValidationError);
  });

  test('rejects negative processing time', () => {
    expect(() => new VrpProblem(
      { 0: new LocationNode(0, 0, 0), 1: new LocationNode(1, 1, 1) },
      [new Customer(1, 1, 1, -5)],
      [new Vehicle(1, 5)]
    )).toThrow(ValidationError);
  });

  test('rejects non-existent delivery node', () => {
    expect(() => new VrpProblem(
      { 0: new LocationNode(0, 0, 0) },
      [new Customer(1, 99, 0, 10)],
      [new Vehicle(1, 5)]
    )).toThrow(ValidationError);
  });

  test('single customer single vehicle produces complete solution', () => {
    const nodes = { 0: new LocationNode(0, 0, 0), 1: new LocationNode(1, 10, 0), 2: new LocationNode(2, 20, 0) };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 5)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);

    const routes = [new Route(1, [1, 2])];
    const solution = new VrpSolution(problem, routes);
    solution.calculateSchedule();

    expect(solution.isComplete()).toBe(true);
    expect(solution.checkCapacity()).toBe(true);
    expect(solution.makespan).toBeGreaterThan(0);
  });

  test('clone produces independent copy', () => {
    const nodes = { 0: new LocationNode(0, 0, 0), 1: new LocationNode(1, 10, 0), 2: new LocationNode(2, 20, 0) };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 5)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);

    const routes = [new Route(1, [1, 2])];
    const solution = new VrpSolution(problem, routes);
    solution.calculateSchedule();

    const cloned = solution.clone();
    cloned.routes[0]!.addNode(999);

    expect(solution.routes[0]!.hasNode(999)).toBe(false);
    expect(cloned.routes[0]!.hasNode(999)).toBe(true);
  });

  test('calculateSchedule is idempotent', () => {
    const nodes = { 0: new LocationNode(0, 0, 0), 1: new LocationNode(1, 10, 0), 2: new LocationNode(2, 20, 0) };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 5)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);

    const routes = [new Route(1, [1, 2])];
    const solution = new VrpSolution(problem, routes);
    const m1 = solution.calculateSchedule();
    const m2 = solution.calculateSchedule();

    expect(m1).toBe(m2);
  });

  test('isFeasible implies isComplete, checkCapacity, checkTimeWindows', () => {
    const nodes = { 0: new LocationNode(0, 0, 0), 1: new LocationNode(1, 10, 0), 2: new LocationNode(2, 20, 0) };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 5)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);

    const routes = [new Route(1, [1, 2])];
    const solution = new VrpSolution(problem, routes);
    solution.calculateSchedule();

    if (solution.isFeasible()) {
      expect(solution.isComplete()).toBe(true);
      expect(solution.checkCapacity()).toBe(true);
      expect(solution.checkTimeWindows()).toBe(true);
    }
  });
});