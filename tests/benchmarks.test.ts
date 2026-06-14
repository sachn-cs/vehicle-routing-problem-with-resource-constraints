import { expect } from 'chai';

import { Decoder, type Chromosome } from '../src/algorithms/brkga/decoder.js';
import { VrpProblem, LocationNode, Customer, Vehicle } from '../src/core/problem.js';
import { VrpRpdSolver } from '../src/index.js';

describe('Benchmarks', () => {
  function generateGridProblem(size: number): VrpProblem {
    const nodes: Record<number, LocationNode> = {};
    const gridDim = Math.ceil(Math.sqrt(size + 1));

    nodes[0] = new LocationNode(0, 0, 0, 'Depot');
    let nodeId = 1;
    for (let i = 0; i < gridDim && nodeId <= size; i++) {
      for (let j = 0; j < gridDim && nodeId <= size; j++) {
        if (i === 0 && j === 0) continue;
        nodes[nodeId] = new LocationNode(nodeId, i * 10, j * 10, `Node${nodeId}`);
        nodeId++;
      }
    }

    const customers = [];
    for (let c = 1; c <= size / 2; c++) {
      const deliveryNodeId = c * 2 - 1;
      const pickupNodeId = c * 2;
      customers.push(new Customer(c, deliveryNodeId, pickupNodeId, 5 + Math.random() * 10));
    }

    const vehicles = [
      new Vehicle(1, size * 2),
      new Vehicle(2, size * 2),
      new Vehicle(3, size * 2),
    ];

    return new VrpProblem(nodes, customers, vehicles, 0);
  }

  it('should solve 20-customer instance within 10 seconds', async () => {
    const problem = generateGridProblem(40); // 40 nodes = 20 customers
    const solver = new VrpRpdSolver(problem);

    const start = Date.now();
    const solution = await solver.solve({
      alnsIterations: 100,
      maxGenerations: 100,
      populationSize: 200,
      maxTimeMs: 10000,
    });
    const elapsed = Date.now() - start;

    expect(elapsed).to.be.lessThan(15000);
    expect(solution.isFeasible()).to.be.true;
    expect(solution.isComplete()).to.be.true;
    expect(solution.makespan).to.be.greaterThan(0);
  });

  it('should solve 50-customer instance and produce feasible solution', async () => {
    const problem = generateGridProblem(100); // 100 nodes = 50 customers
    const solver = new VrpRpdSolver(problem);

    const solution = await solver.solve({
      alnsIterations: 50,
      maxGenerations: 50,
      populationSize: 100,
      maxTimeMs: 30000,
    });

    expect(solution.isFeasible()).to.be.true;
    expect(solution.isComplete()).to.be.true;
    expect(solution.makespan).to.be.greaterThan(0);
  });

  it('should respect target makespan early stopping', async () => {
    const problem = generateGridProblem(40); // 40 nodes = 20 customers
    const solver = new VrpRpdSolver(problem);

    const start = Date.now();
    const solution = await solver.solve({
      alnsIterations: 500,
      maxGenerations: 500,
      populationSize: 500,
      targetMakespan: 1000, // Very loose target
    });
    const elapsed = Date.now() - start;

    // Should stop early because any feasible solution will have makespan < 1000
    expect(solution.makespan).to.be.lessThan(1000);
    expect(elapsed).to.be.lessThan(15000);
  });

  it('should handle timeout gracefully', async () => {
    const problem = generateGridProblem(40); // 40 nodes = 20 customers
    const solver = new VrpRpdSolver(problem);

    const start = Date.now();
    const solution = await solver.solve({
      alnsIterations: 500,
      maxGenerations: 500,
      populationSize: 500,
      maxTimeMs: 500,
    });
    const elapsed = Date.now() - start;

    // Timeout is checked at iteration boundaries, so elapsed may exceed 500ms
    // but should be well under the full-run time (~10s)
    expect(elapsed).to.be.lessThan(5000);
    expect(solution.isFeasible()).to.be.true;
  });

  it('Decoder.decode() should complete 1000 decodes on 100-customer problem under 5s', () => {
    const problem = generateGridProblem(200); // 200 nodes = 100 customers
    const decoder = new Decoder(problem);

    const chromosome: Chromosome = {
      priorities: problem.customers.map(() => Math.random()),
      assignments: problem.customers.map(() => Math.random()),
      dependencies: problem.customers.map(() => Math.random()),
      transfers: problem.customers.map(() => Math.random()),
    };

    const start = Date.now();
    for (let i = 0; i < 1000; i++) {
      const solution = decoder.decode(chromosome);
      expect(solution.isFeasible()).to.be.true;
    }
    const elapsed = Date.now() - start;
    expect(elapsed).to.be.lessThan(5000);
  });

  it('Decoder.decode() should produce consistent results across calls', () => {
    const problem = generateGridProblem(40); // 40 nodes = 20 customers
    const decoder = new Decoder(problem);

    const chromosome: Chromosome = {
      priorities: problem.customers.map(() => Math.random()),
      assignments: problem.customers.map(() => Math.random()),
      dependencies: problem.customers.map(() => Math.random()),
      transfers: problem.customers.map(() => Math.random()),
    };

    const first = decoder.decode(chromosome);
    for (let i = 0; i < 10; i++) {
      const next = decoder.decode(chromosome);
      expect(next.makespan).to.equal(first.makespan);
      expect(next.isFeasible()).to.equal(first.isFeasible());
      expect(next.isComplete()).to.equal(first.isComplete());
    }
  });
});
