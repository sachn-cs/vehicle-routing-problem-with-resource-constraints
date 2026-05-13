import { VrpProblem, LocationNode, Customer, Vehicle } from '../src/core/Problem.js';
import { VrpSolution, Route } from '../src/core/Solution.js';
import { ValidationError } from '../src/errors.js';
import { expect } from 'chai';

describe('Edge Cases', () => {
  it('rejects empty nodes', () => {
    expect(() => new VrpProblem({}, [], [new Vehicle(1, 5)])).to.throw(ValidationError);
  });

  it('rejects empty customers', () => {
    expect(() => new VrpProblem({ 0: new LocationNode(0, 0, 0) }, [], [new Vehicle(1, 5)])).to.throw(ValidationError);
  });

  it('rejects empty vehicles', () => {
    expect(() => new VrpProblem({ 0: new LocationNode(0, 0, 0) }, [new Customer(1, 0, 0, 10)], [])).to.throw(ValidationError);
  });

  it('rejects duplicate customer IDs', () => {
    const nodes = { 0: new LocationNode(0, 0, 0), 1: new LocationNode(1, 1, 1) };
    const customers = [new Customer(1, 1, 1, 10), new Customer(1, 1, 1, 10)];
    expect(() => new VrpProblem(nodes, customers, [new Vehicle(1, 5)])).to.throw(ValidationError);
  });

  it('rejects duplicate vehicle IDs', () => {
    const nodes = { 0: new LocationNode(0, 0, 0), 1: new LocationNode(1, 1, 1) };
    const customers = [new Customer(1, 1, 1, 10)];
    expect(() => new VrpProblem(nodes, customers, [new Vehicle(1, 5), new Vehicle(1, 5)])).to.throw(ValidationError);
  });

  it('rejects negative coordinates', () => {
    expect(() => new VrpProblem(
      { 0: new LocationNode(0, -1, 0) },
      [new Customer(1, 0, 0, 10)],
      [new Vehicle(1, 5)]
    )).to.throw(ValidationError);
  });

  it('rejects zero capacity', () => {
    expect(() => new VrpProblem(
      { 0: new LocationNode(0, 0, 0), 1: new LocationNode(1, 1, 1) },
      [new Customer(1, 1, 1, 10)],
      [new Vehicle(1, 0)]
    )).to.throw(ValidationError);
  });

  it('rejects negative processing time', () => {
    expect(() => new VrpProblem(
      { 0: new LocationNode(0, 0, 0), 1: new LocationNode(1, 1, 1) },
      [new Customer(1, 1, 1, -5)],
      [new Vehicle(1, 5)]
    )).to.throw(ValidationError);
  });

  it('rejects non-existent delivery node', () => {
    expect(() => new VrpProblem(
      { 0: new LocationNode(0, 0, 0) },
      [new Customer(1, 99, 0, 10)],
      [new Vehicle(1, 5)]
    )).to.throw(ValidationError);
  });

  it('single customer single vehicle produces complete solution', () => {
    const nodes = { 0: new LocationNode(0, 0, 0), 1: new LocationNode(1, 10, 0), 2: new LocationNode(2, 20, 0) };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 5)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);

    const routes = [new Route(1, [1, 2])];
    const solution = new VrpSolution(problem, routes);
    solution.calculateSchedule();

    expect(solution.isComplete()).to.be.true;
    expect(solution.checkCapacity()).to.be.true;
    expect(solution.makespan).to.be.greaterThan(0);
  });

  it('clone produces independent copy', () => {
    const nodes = { 0: new LocationNode(0, 0, 0), 1: new LocationNode(1, 10, 0), 2: new LocationNode(2, 20, 0) };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 5)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);

    const routes = [new Route(1, [1, 2])];
    const solution = new VrpSolution(problem, routes);
    solution.calculateSchedule();

    const cloned = solution.clone();
    cloned.routes[0].addNode(999);

    expect(solution.routes[0].hasNode(999)).to.be.false;
    expect(cloned.routes[0].hasNode(999)).to.be.true;
  });

  it('calculateSchedule is idempotent', () => {
    const nodes = { 0: new LocationNode(0, 0, 0), 1: new LocationNode(1, 10, 0), 2: new LocationNode(2, 20, 0) };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 5)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);

    const routes = [new Route(1, [1, 2])];
    const solution = new VrpSolution(problem, routes);
    const m1 = solution.calculateSchedule();
    const m2 = solution.calculateSchedule();

    expect(m1).to.equal(m2);
  });

  it('isFeasible implies isComplete, checkCapacity, checkTimeWindows', () => {
    const nodes = { 0: new LocationNode(0, 0, 0), 1: new LocationNode(1, 10, 0), 2: new LocationNode(2, 20, 0) };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 5)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);

    const routes = [new Route(1, [1, 2])];
    const solution = new VrpSolution(problem, routes);
    solution.calculateSchedule();

    if (solution.isFeasible()) {
      expect(solution.isComplete()).to.be.true;
      expect(solution.checkCapacity()).to.be.true;
      expect(solution.checkTimeWindows()).to.be.true;
    }
  });
});