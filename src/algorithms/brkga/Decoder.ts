import { VrpSolution, Route } from '../../core/Solution.js';
import type { VrpProblem, Customer, Vehicle } from '../../core/Problem.js';

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
 * Single-pass decoder for BRKGA.
 *
 * Currently assigns all customers in priority order without dependency checks.
 * The multi-pass schedule construction from the paper (scheduling delivery first,
 * then pickup after processing time) is not yet implemented.
 */
export class Decoder {
  constructor(private readonly problem: VrpProblem) {}

  decode(chromosome: Chromosome): VrpSolution {
    const routes = this.problem.vehicles.map((v: Vehicle) => new Route(v.id, []));
    const solution = new VrpSolution(this.problem, routes);

    // Create customer order based on priority genes (π)
    const customerIndices = this.problem.customers.map((_c: Customer, i: number) => i);
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
    customer: Customer,
    scheduled: ReadonlySet<number>,
    nodeTimes: Readonly<Record<number | string, number>>,
  ): boolean {
    const customerIndex = this.problem.customers.indexOf(customer);
    if (customerIndex < 0) return false;

    // Prevent duplicate scheduling
    if (scheduled.has(customerIndex)) {
      return false;
    }

    // If delivery has already been scheduled (cross-route), verify processing elapsed
    const deliveryTime = nodeTimes[customer.deliveryNodeId];
    if (deliveryTime !== undefined) {
      const pickupTime = nodeTimes[customer.pickupNodeId];
      if (pickupTime !== undefined && pickupTime < deliveryTime + customer.processingTime) {
        return false;
      }
    }

    return true;
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
  encode(solution: VrpSolution): Chromosome {
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

        // Find which customer this node belongs to via O(1) Map lookup
        const customerIndex = this.problem.nodeToCustomerIndex.get(nodeId);
        if (customerIndex !== undefined) {
          // Priority based on position (earlier = lower value)
          priorities[customerIndex] = (rIdx * 100 + pos) / (solution.routes.length * 100);

          // Assignment based on vehicle
          assignments[customerIndex] = rIdx / solution.routes.length;

          // Dependencies and transfers default to 0.5
          dependencies[customerIndex] = 0.5;
          transfers[customerIndex] = 0.5;
        }
      }
    }

    return { priorities, assignments, dependencies, transfers };
  }
}
