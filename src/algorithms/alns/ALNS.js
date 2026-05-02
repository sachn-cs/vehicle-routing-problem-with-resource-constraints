import { Solution, Route } from '../../core/Solution.js';
import { RemovalOperators, InsertionOperators } from './operators.js';

export class ALNS {
  constructor(problem, options = {}) {
    this.problem = problem;
    this.maxIterations = options.maxIterations || 100;
    this.temp = options.initialTemp || 100;
    this.coolingRate = options.coolingRate || 0.95;
    
    this.removalOps = Object.keys(RemovalOperators);
    this.insertionOps = Object.keys(InsertionOperators);
    
    this.removalWeights = new Array(this.removalOps.length).fill(1);
    this.insertionWeights = new Array(this.insertionOps.length).fill(1);
    
    this.segmentSize = options.segmentSize || 20;
    this.scores = { removal: new Array(this.removalOps.length).fill(0), insertion: new Array(this.insertionOps.length).fill(0) };
    this.usage = { removal: new Array(this.removalOps.length).fill(0), insertion: new Array(this.insertionOps.length).fill(0) };
    this.lambda = 0.1; // Adaptation parameter
  }

  generateInitialSolution() {
    const routes = this.problem.vehicles.map(v => new Route(v.id, []));
    const emptySolution = new Solution(this.problem, routes);
    return InsertionOperators.greedyInsertion(emptySolution, this.problem.customers);
  }

  solve() {
    let currentSolution = this.generateInitialSolution();
    let bestSolution = currentSolution;
    let currentCost = currentSolution.calculateSchedule();
    let bestCost = currentCost;

    for (let i = 0; i < this.maxIterations; i++) {
      const rIdx = this.selectOperator(this.removalWeights);
      const iIdx = this.selectOperator(this.insertionWeights);

      const removalOp = RemovalOperators[this.removalOps[rIdx]];
      const insertionOp = InsertionOperators[this.insertionOps[iIdx]];

      this.usage.removal[rIdx]++;
      this.usage.insertion[iIdx]++;

      const k = Math.max(1, Math.floor(this.problem.customers.length * (0.1 + Math.random() * 0.2)));
      const { solution: removedSolution, removed } = removalOp(currentSolution, k);
      const newSolution = insertionOp(removedSolution, removed);
      
      const newCost = newSolution.calculateSchedule();

      let score = 0;
      if (newCost < bestCost) {
        bestSolution = newSolution;
        bestCost = newCost;
        score = 10;
      } else if (newCost < currentCost) {
        score = 5;
      } else if (this.accept(currentCost, newCost)) {
        score = 2;
      }

      this.scores.removal[rIdx] += score;
      this.scores.insertion[iIdx] += score;

      if (score > 0) {
        currentSolution = newSolution;
        currentCost = newCost;
      }

      // Update weights every segment
      if (i > 0 && i % this.segmentSize === 0) {
        this.updateWeights();
      }

      this.temp *= this.coolingRate;
    }

    return bestSolution;
  }

  updateWeights() {
    for (let i = 0; i < this.removalWeights.length; i++) {
      if (this.usage.removal[i] > 0) {
        const avgScore = this.scores.removal[i] / this.usage.removal[i];
        this.removalWeights[i] = (1 - this.lambda) * this.removalWeights[i] + this.lambda * avgScore;
        this.scores.removal[i] = 0;
        this.usage.removal[i] = 0;
      }
    }
    for (let i = 0; i < this.insertionWeights.length; i++) {
      if (this.usage.insertion[i] > 0) {
        const avgScore = this.scores.insertion[i] / this.usage.insertion[i];
        this.insertionWeights[i] = (1 - this.lambda) * this.insertionWeights[i] + this.lambda * avgScore;
        this.scores.insertion[i] = 0;
        this.usage.insertion[i] = 0;
      }
    }
  }

  selectOperator(weights) {
    const sum = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * sum;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return weights.length - 1;
  }

  accept(currentCost, newCost) {
    if (newCost < currentCost) return true;
    const p = Math.exp((currentCost - newCost) / this.temp);
    return Math.random() < p;
  }
}
