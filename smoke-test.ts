import { Problem, Node, Customer, Vehicle } from './src/core/Problem.js';
import { Solution, Route } from './src/core/Solution.js';
import { ALNS } from './src/algorithms/alns/ALNS.js';
import { BRKGA } from './src/algorithms/brkga/BRKGA.js';

// Test 1: Basic Problem
console.log('Test 1: Creating problem instance...');
const nodes: Record<number, Node> = {
  0: new Node(0, 0, 0, 'Depot'),
  1: new Node(1, 10, 0, 'D1'),
  2: new Node(2, 20, 0, 'P1'),
};
const customers = [new Customer(1, 1, 2, 50)];
const vehicles = [new Vehicle(1, 5)];
const problem = new Problem(nodes, customers, vehicles, 0);
console.log('✓ Problem created successfully');

// Test 2: Solution with schedule calculation
console.log('Test 2: Calculating schedule...');
const routes = [new Route(1, [1, 2])];
const solution = new Solution(problem, routes);
const makespan = solution.calculateSchedule();
if (makespan <= 0) throw new Error('Makespan should be positive');
console.log(`✓ Schedule calculated, makespan: ${makespan}`);

// Test 3: ALNS with validation
console.log('Test 3: ALNS solve...');
const alns = new ALNS(problem, { maxIterations: 10 });
const alnsSolution = alns.solve();
if (!alnsSolution.isComplete()) throw new Error('ALNS solution incomplete');
console.log(`✓ ALNS completed, makespan: ${alnsSolution.makespan}`);

// Test 4: BRKGA with validation
console.log('Test 4: BRKGA solve...');
const brkga = new BRKGA(problem, { populationSize: 10, maxGenerations: 10 });
const brkgaSolution = brkga.solve();
if (!brkgaSolution.isComplete()) throw new Error('BRKGA solution incomplete');
console.log(`✓ BRKGA completed, makespan: ${brkgaSolution.makespan}`);

// Test 5: Input validation
console.log('Test 5: Input validation...');
try {
  new ALNS(problem, { coolingRate: 1.5 });
  throw new Error('Should have thrown for invalid cooling rate');
} catch (e) {
  if ((e as Error).message.includes('Cooling rate')) {
    console.log('✓ ALNS validation works');
  } else {
    throw e;
  }
}

try {
  new BRKGA(problem, { populationSize: -1 });
  throw new Error('Should have thrown for invalid population size');
} catch (e) {
  if ((e as Error).message.includes('Population size')) {
    console.log('✓ BRKGA validation works');
  } else {
    throw e;
  }
}

console.log('\n✅ All smoke tests passed!');
