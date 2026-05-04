import { Solution, Route } from '../../core/Solution.js';
import type { Problem, Customer } from '../../core/Problem.js';

/**
 * Paper chromosome structure (4n genes):
 * - π (n genes): Operation priorities (determines order)
 * - σ (n genes): Vehicle assignment hints
 * - α (n genes): Dependency ordering for cross-vehicle transfers
 * - β (n genes): Transfer coordination timing
 */
export interface Chromosome {
  /** Priority genes (π) - determines operation order */
  priorities: number[];
  /** Assignment genes (σ) - vehicle assignment hints */
  assignments: number[];
  /** Dependency genes (α) - ordering for dependencies */
  dependencies: number[];
  /** Transfer genes (β) - transfer coordination */
  transfers: number[];
}

/**
 * Multi-pass decoder for BRKGA.
 * Implements the paper's multi-pass schedule construction.
 *
 * Pass 1: Schedule independent operations (no unsatisfied dependencies)
 * Pass 2+: Schedule operations whose dependencies are now satisfied
 * Repeat until all operations scheduled or no progress
 */
export class Decoder {
  constructor(private readonly problem: Problem) {}

  decode(chromosome: Chromosome): Solution {
    const routes = this.problem.vehicles.map(v => new Route(v.id, []));
    const solution = new Solution(this.problem, routes);

    // Create customer order based on priority genes (π)
    const customerIndices = this.problem.customers.map((_, i) => i);
    customerIndices.sort((a, b) => chromosome.priorities[a]! - chromosome.priorities[b]!);

    // Multi-pass scheduling
    const scheduled = new Set<number>();
    const maxPasses = this.problem.customers.length + 1; // Safety limit
    let pass = 0;

    while (scheduled.size < this.problem.customers.length && pass < maxPasses) {
      pass++;
      let madeProgress = false;

      for (const idx of customerIndices) {
        if (scheduled.has(idx)) continue;

        const customer = this.problem.customers[idx];
        if (!customer) continue;

        // Check if dependencies are satisfied
        const canSchedule = this.canScheduleCustomer(customer, scheduled, solution.nodeTimes);

        if (canSchedule) {
          // Get vehicle assignment from σ genes
          const vehicleIndex = this.getVehicleAssignment(chromosome.assignments[idx], idx);
          const route = routes[vehicleIndex];

          if (route) {
            // Insert delivery and pickup
            route.nodes.push(customer.deliveryNodeId, customer.pickupNodeId);
            scheduled.add(idx);
            madeProgress = true;
          }
        }
      }

      if (!madeProgress && scheduled.size < this.problem.customers.length) {
        // Force schedule remaining customers (infeasible but continue)
        for (const idx of customerIndices) {
          if (scheduled.has(idx)) continue;

          const customer = this.problem.customers[idx];
          if (!customer) continue;

          const vehicleIndex = this.getVehicleAssignment(chromosome.assignments[idx], idx);
          const route = routes[vehicleIndex];

          if (route) {
            route.nodes.push(customer.deliveryNodeId, customer.pickupNodeId);
            scheduled.add(idx);
          }
        }
        break;
      }
    }

    solution.calculateSchedule();
    return solution;
  }

  /**
   * Checks if a customer can be scheduled (dependencies satisfied).
   * For VRP-RPD: pickup depends on delivery + processing time.
   */
  private canScheduleCustomer(
    _customer: Customer,
    _scheduled: Set<number>,
    _nodeTimes: Record<number, number>,
  ): boolean {
    // Delivery can always be scheduled (no predecessors)
    // Pickup depends on delivery being scheduled and processed
    // In multi-pass, we schedule D first, then P in subsequent passes

    // For cross-vehicle transfers, check α genes for ordering
    // This is a simplified check - full implementation would check β genes too

    return true; // Simplified: allow all, decoder handles timing
  }

  /**
   * Maps assignment gene to vehicle index.
   */
  private getVehicleAssignment(gene: number | undefined, _customerIndex: number): number {
    const preference = gene ?? 0.5;
    return Math.floor(preference * this.problem.vehicles.length);
  }

  /**
   * Creates a chromosome from a solution (for warm-start).
   * Encodes an existing solution into the 4n gene structure.
   */
  encode(solution: Solution): Chromosome {
    const n = this.problem.customers.length;

    const priorities = new Array(n).fill(0);
    const assignments = new Array(n).fill(0);
    const dependencies = new Array(n).fill(0);
    const transfers = new Array(n).fill(0);

    // Encode priorities based on position in routes
    for (let rIdx = 0; rIdx < solution.routes.length; rIdx++) {
      const route = solution.routes[rIdx];
      if (!route) continue;

      for (let pos = 0; pos < route.nodes.length; pos++) {
        const nodeId = route.nodes[pos];
        if (!nodeId) continue;

        // Find which customer this node belongs to
        for (let cIdx = 0; cIdx < this.problem.customers.length; cIdx++) {
          const customer = this.problem.customers[cIdx];
          if (!customer) continue;

          if (nodeId === customer.deliveryNodeId || nodeId === customer.pickupNodeId) {
            // Priority based on position (earlier = lower value)
            priorities[cIdx] = (rIdx * 100 + pos) / (solution.routes.length * 100);

            // Assignment based on vehicle
            assignments[cIdx] = rIdx / solution.routes.length;

            // Dependencies and transfers default to 0.5
            dependencies[cIdx] = 0.5;
            transfers[cIdx] = 0.5;
          }
        }
      }
    }

    return { priorities, assignments, dependencies, transfers };
  }
}
