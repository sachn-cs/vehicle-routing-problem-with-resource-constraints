import { Node, Customer, Vehicle, Problem } from '../src/core/Problem.js';
import { Solution, Route } from '../src/core/Solution.js';
import { VRP_RPD_Solver } from '../src/index.js';

describe('VRP-RPD Core Logic', () => {
  test('Makespan calculation respects processing time', () => {
    const nodes = {
      0: new Node(0, 0, 0), // Depot
      1: new Node(1, 10, 0), // D1
      2: new Node(2, 20, 0)  // P1
    };
    const customers = [new Customer(1, 1, 2, 100)];
    const vehicles = [new Vehicle(1, 5)];
    const problem = new Problem(nodes, customers, vehicles, 0);

    const route = new Route(1, [1, 2]);
    const solution = new Solution(problem, [route]);
    
    const makespan = solution.calculateSchedule();
    
    // t_D1 = 10 (dist 0->10)
    // ready_time = 10 + 100 = 110
    // arrival_P1 (no wait) = 10 + 10 = 20
    // actual_P1 = max(20, 110) = 110
    // return_depot = 110 + 20 = 130
    
    expect(makespan).toBe(130);
  });

  test('Solver returns a feasible solution', async () => {
    const nodes = {
      0: new Node(0, 0, 0),
      1: new Node(1, 10, 10),
      2: new Node(2, -10, -10),
      3: new Node(3, 20, 20),
      4: new Node(4, -20, -20)
    };
    const customers = [
      new Customer(1, 1, 2, 10),
      new Customer(2, 3, 4, 10)
    ];
    const vehicles = [new Vehicle(1, 2)];
    const problem = new Problem(nodes, customers, vehicles, 0);
    
    const solver = new VRP_RPD_Solver(problem);
    const solution = await solver.solve({ alnsIterations: 10, populationSize: 10, maxGenerations: 5 });
    
    expect(solution.isFeasible()).toBe(true);
    expect(solution.makespan).toBeLessThan(Infinity);
  });
});
