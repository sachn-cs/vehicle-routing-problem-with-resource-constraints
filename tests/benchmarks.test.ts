import { VrpProblem, LocationNode, Customer, Vehicle } from '../src/core/Problem.js';
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

  test('should solve 20-customer instance within 10 seconds', async () => {
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

    expect(elapsed).toBeLessThan(15000);
    expect(solution.isFeasible()).toBe(true);
    expect(solution.isComplete()).toBe(true);
    expect(solution.makespan).toBeGreaterThan(0);
  });

  test('should solve 50-customer instance and produce feasible solution', async () => {
    const problem = generateGridProblem(100); // 100 nodes = 50 customers
    const solver = new VrpRpdSolver(problem);

    const solution = await solver.solve({
      alnsIterations: 50,
      maxGenerations: 50,
      populationSize: 100,
      maxTimeMs: 30000,
    });

    expect(solution.isFeasible()).toBe(true);
    expect(solution.isComplete()).toBe(true);
    expect(solution.makespan).toBeGreaterThan(0);
  });

  test('should respect target makespan early stopping', async () => {
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
    expect(solution.makespan).toBeLessThan(1000);
    expect(elapsed).toBeLessThan(15000);
  });

  test('should handle timeout gracefully', async () => {
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
    expect(elapsed).toBeLessThan(5000);
    expect(solution.isFeasible()).toBe(true);
  });
});
