import { ALNS } from '../src/algorithms/alns/ALNS.js';
import { VrpProblem, LocationNode, Customer, Vehicle } from '../src/core/Problem.js';
import type { Logger } from '../src/logger.js';

describe('Logger Injection', () => {
  it('ALNS accepts custom logger without throwing', () => {
    const logs: string[] = [];
    const logger: Logger = {
      log: (msg: string) => logs.push(msg),
    };

    const nodes = { 0: new LocationNode(0, 0, 0), 1: new LocationNode(1, 10, 0), 2: new LocationNode(2, 20, 0) };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 5)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);

    const alns = new ALNS(problem, { maxIterations: 1, logger });
    expect(() => alns.solve()).to.not.throw();
  });

  it('default logger is silent', () => {
    const nodes = { 0: new LocationNode(0, 0, 0), 1: new LocationNode(1, 10, 0), 2: new LocationNode(2, 20, 0) };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 5)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);

    // Should not throw or log anything
    const alns = new ALNS(problem, { maxIterations: 1 });
    expect(() => alns.solve()).to.not.throw();
  });
});
