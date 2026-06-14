import type { VrpProblem } from '../core/problem.js';
import type { VrpSolution } from '../core/solution.js';

import { RouteAnalytics } from './route-analytics.js';

export interface SolutionMetrics {
  makespan: number;
  totalDistance: number;
  totalCost: number;
  totalCO2: number;
  avgVehicleUtilization: number;
  totalWaitTime: number;
  feasibilityScore: number;
}

export interface ComparisonResult {
  metric: string;
  values: Array<{ solutionIndex: number; value: number; rank: number }>;
  best: number;
  worst: number;
  improvement: number;
}

export interface ParetoFront {
  solutions: number[];
  objectives: Array<{ makespan: number; distance: number; cost: number; co2: number }>;
}

/**
 * Compares multiple solutions side-by-side.
 * Useful for comparing different solver configurations or algorithms.
 */
export class SolutionComparator {
  /**
   * @param solutions - Solutions to compare
   * @param problem - Problem instance the solutions solve
   */
  constructor(
    private readonly solutions: VrpSolution[],
    private readonly problem: VrpProblem,
  ) {}

  /**
   * @param solutionIndex - Index of the solution to evaluate
   * @returns Comprehensive metrics for the requested solution
   */
  getMetrics(solutionIndex: number): SolutionMetrics | undefined {
    const solution = this.solutions[solutionIndex];
    if (!solution) return undefined;

    const analytics = new RouteAnalytics(solution, this.problem);
    const summary = analytics.getSummary();

    return {
      makespan: solution.makespan,
      totalDistance: solution.totalDistance,
      totalCost: solution.totalCost,
      totalCO2: solution.totalCO2,
      avgVehicleUtilization: summary.avgUtilization,
      totalWaitTime: summary.totalWaitTime,
      feasibilityScore: solution.isFeasible() ? 1 : 0,
    };
  }

  /**
   * @param metric - Metric to compare across solutions
   * @returns Comparison result with best, worst, and improvement
   */
  compareMetric(metric: keyof SolutionMetrics): ComparisonResult | undefined {
    const metrics = this.solutions
      .map((_, i) => this.getMetrics(i))
      .filter((m): m is SolutionMetrics => m !== undefined);

    if (metrics.length === 0) return undefined;

    const values = metrics.map((m, i) => ({
      solutionIndex: i,
      value: m[metric],
      rank: 0,
    }));

    // Sort and assign ranks (lower is better for all metrics)
    const sorted = [...values].sort((a, b) => a.value - b.value);
    for (let i = 0; i < sorted.length; i++) {
      const entry = sorted[i];
      if (entry) entry.rank = i + 1;
    }

    // Map ranks back to original order
    for (const v of values) {
      v.rank = sorted.find(s => s.solutionIndex === v.solutionIndex)?.rank ?? 0;
    }

    const best = Math.min(...values.map(v => v.value));
    const worst = Math.max(...values.map(v => v.value));
    const improvement = worst > 0 ? ((worst - best) / worst) * 100 : 0;

    return {
      metric,
      values,
      best,
      worst,
      improvement,
    };
  }

  /**
   * @returns Comparison results for all tracked metrics
   */
  getAllComparisons(): Record<string, ComparisonResult> {
    const results: Record<string, ComparisonResult> = {};
    const metrics: (keyof SolutionMetrics)[] = [
      'makespan',
      'totalDistance',
      'totalCost',
      'totalCO2',
      'avgVehicleUtilization',
      'totalWaitTime',
    ];

    for (const m of metrics) {
      const result = this.compareMetric(m);
      if (result) {
        results[m] = result;
      }
    }

    return results;
  }

  /**
   * A solution is Pareto-optimal if no other solution dominates it in all objectives.
   * @returns Indices and objective vectors of Pareto-optimal solutions
   */
  findParetoFront(): ParetoFront {
    const metrics = this.solutions
      .map((_, i) => this.getMetrics(i))
      .filter((m): m is SolutionMetrics => m !== undefined);

    const paretoIndices: number[] = [];
    const paretoObjectives: ParetoFront['objectives'] = [];

    for (let i = 0; i < metrics.length; i++) {
      const current = metrics[i];
      if (!current) continue;
      let dominated = false;

      for (let j = 0; j < metrics.length; j++) {
        if (i === j) continue;
        const other = metrics[j];
        if (!other) continue;

        // Check if other dominates current
        const dominates =
          other.makespan <= current.makespan &&
          other.totalDistance <= current.totalDistance &&
          other.totalCost <= current.totalCost &&
          other.totalCO2 <= current.totalCO2 &&
          (other.makespan < current.makespan ||
            other.totalDistance < current.totalDistance ||
            other.totalCost < current.totalCost ||
            other.totalCO2 < current.totalCO2);

        if (dominates) {
          dominated = true;
          break;
        }
      }

      if (!dominated) {
        paretoIndices.push(i);
        paretoObjectives.push({
          makespan: current.makespan,
          distance: current.totalDistance,
          cost: current.totalCost,
          co2: current.totalCO2,
        });
      }
    }

    return {
      solutions: paretoIndices,
      objectives: paretoObjectives,
    };
  }

  /**
   * @returns Human-readable report comparing all solutions
   */
  generateReport(): string {
    const comparisons = this.getAllComparisons();
    const pareto = this.findParetoFront();

    let report = '=== Solution Comparison Report ===\n\n';
    report += `Total solutions compared: ${this.solutions.length}\n`;
    report += `Pareto-optimal solutions: ${pareto.solutions.length}\n\n`;

    report += '--- Metric Comparisons ---\n\n';

    for (const [metric, result] of Object.entries(comparisons)) {
      report += `${metric}:\n`;
      const bestIdx = result.values.find(v => v.value === result.best)?.solutionIndex;
      report += `  Best: ${result.best.toFixed(2)} (Solution ${bestIdx})\n`;
      report += `  Worst: ${result.worst.toFixed(2)}\n`;
      report += `  Improvement: ${result.improvement.toFixed(1)}%\n\n`;
    }

    report += '--- Pareto Front ---\n';
    if (pareto.solutions.length > 0) {
      report += 'Pareto-optimal solution indices: ' + pareto.solutions.join(', ') + '\n';
      for (let i = 0; i < pareto.objectives.length; i++) {
        const obj = pareto.objectives[i];
        const solIdx = pareto.solutions[i];
        if (!obj || solIdx === undefined) continue;
        report += `  Solution ${solIdx}: ` +
          `makespan=${obj.makespan.toFixed(2)}, ` +
          `distance=${obj.distance.toFixed(2)}, ` +
          `cost=${obj.cost.toFixed(2)}, co2=${obj.co2.toFixed(2)}\n`;
      }
    } else {
      report += 'No Pareto-optimal solutions found (one solution dominates all others)\n';
    }

    return report;
  }
}
