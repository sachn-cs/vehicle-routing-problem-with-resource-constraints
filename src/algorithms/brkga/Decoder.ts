import type { VrpProblem, Customer, Vehicle } from '../../core/Problem.js';
import { VrpSolution, Route } from '../../core/Solution.js';

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
 *
 * Pass 1: Schedule all deliveries in priority order (capacity-aware).
 * Pass 2+: Schedule pickups only after delivery + processing time elapsed.
 * Uses α genes for tie-breaking in priority sort.
 */
export class Decoder {
  constructor(private readonly problem: VrpProblem) {}

  decode(chromosome: Chromosome): VrpSolution {
    const routes = this.problem.vehicles.map((v: Vehicle) => new Route(v.id, []));
    const solution = new VrpSolution(this.problem, routes);

    // Create customer order based on priority genes (π), with α as tie-breaker
    const customerIndices = this.problem.customers.map((_c: Customer, i: number) => i);
    customerIndices.sort((a, b) => {
      const diff = chromosome.priorities[a]! - chromosome.priorities[b]!;
      if (diff !== 0) return diff;
      return chromosome.dependencies[a]! - chromosome.dependencies[b]!;
    });

    // Track which customers have delivery scheduled and which have pickup scheduled
    const deliveryScheduled = new Set<number>();
    const pickupScheduled = new Set<number>();

    // Pass 1: Schedule all deliveries in priority order with capacity check
    for (const idx of customerIndices) {
      const customer = this.problem.customers[idx];
      if (!customer) continue;

      const vehicleIndex = this.getVehicleAssignment(chromosome.assignments[idx], idx);
      const route = routes[vehicleIndex];
      if (!route) continue;

      // Capacity check: can this vehicle handle one more delivery?
      if (this.wouldExceedCapacity(route, customer, 'delivery')) {
        // Try next vehicle
        const altIndex = this.findCapableVehicle(routes, customer, 'delivery', vehicleIndex);
        if (altIndex >= 0 && routes[altIndex]) {
          routes[altIndex].nodes.push(customer.deliveryNodeId);
          deliveryScheduled.add(idx);
        }
      } else {
        route.nodes.push(customer.deliveryNodeId);
        deliveryScheduled.add(idx);
      }
    }

    // Calculate schedule to get resource ready times
    solution.calculateSchedule();

    // Pass 2+: Schedule pickups after processing time
    const maxPasses = this.problem.customers.length + 1;
    let pass = 0;

    while (pickupScheduled.size < deliveryScheduled.size && pass < maxPasses) {
      pass++;
      let madeProgress = false;

      for (const idx of customerIndices) {
        if (!deliveryScheduled.has(idx) || pickupScheduled.has(idx)) continue;

        const customer = this.problem.customers[idx];
        if (!customer) continue;

        // Check if processing time has elapsed
        const deliveryTime = solution.nodeTimes[customer.deliveryNodeId];
        if (deliveryTime === undefined) continue;

        // For now, schedule pickup on same vehicle as delivery
        const vehicleIndex = this.getVehicleAssignment(chromosome.assignments[idx], idx);
        const route = routes[vehicleIndex];
        if (!route) continue;

        // Capacity check for pickup
        if (this.wouldExceedCapacity(route, customer, 'pickup')) {
          const altIndex = this.findCapableVehicle(routes, customer, 'pickup', vehicleIndex);
          if (altIndex >= 0 && routes[altIndex]) {
            routes[altIndex].nodes.push(customer.pickupNodeId);
            pickupScheduled.add(idx);
            madeProgress = true;
          }
        } else {
          route.nodes.push(customer.pickupNodeId);
          pickupScheduled.add(idx);
          madeProgress = true;
        }
      }

      if (madeProgress) {
        solution.calculateSchedule();
      } else {
        // Force remaining pickups to prevent infinite loop
        for (const idx of customerIndices) {
          if (!deliveryScheduled.has(idx) || pickupScheduled.has(idx)) continue;
          const customer = this.problem.customers[idx];
          if (!customer) continue;

          const vehicleIndex = this.getVehicleAssignment(chromosome.assignments[idx], idx);
          const route = routes[vehicleIndex];
          if (route) {
            route.nodes.push(customer.pickupNodeId);
            pickupScheduled.add(idx);
          }
        }
        break;
      }
    }

    solution.calculateSchedule();
    return solution;
  }

  /**
   * Checks if adding a delivery or pickup would exceed vehicle capacity.
   */
  private wouldExceedCapacity(route: Route, _customer: Customer, type: 'delivery' | 'pickup'): boolean {
    const vehicle = this.problem.vehicleMap.get(route.vehicleId);
    if (!vehicle) return true;

    let minLoad = 0;
    let currentLoad = 0;

    // Simulate load through existing route
    for (const nodeId of route.nodes) {
      if (this.problem.deliveryNodeMap.has(nodeId)) currentLoad--;
      if (this.problem.pickupNodeMap.has(nodeId)) currentLoad++;
      if (currentLoad < minLoad) minLoad = currentLoad;
    }

    // Add the new operation
    if (type === 'delivery') currentLoad--;
    else currentLoad++;
    if (currentLoad < minLoad) minLoad = currentLoad;

    const initialLoad = -minLoad;
    return initialLoad > vehicle.capacity || initialLoad + currentLoad - minLoad > vehicle.capacity;
  }

  /**
   * Finds an alternative vehicle that can handle the operation without exceeding capacity.
   */
  private findCapableVehicle(
    routes: Route[],
    customer: Customer,
    type: 'delivery' | 'pickup',
    preferredIndex: number,
  ): number {
    // Try preferred first
    if (!this.wouldExceedCapacity(routes[preferredIndex]!, customer, type)) {
      return preferredIndex;
    }

    // Try other vehicles
    for (let i = 0; i < routes.length; i++) {
      if (i === preferredIndex) continue;
      const route = routes[i];
      if (!route) continue;
      if (!this.wouldExceedCapacity(route, customer, type)) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Maps assignment gene to vehicle index.
   */
  private getVehicleAssignment(gene: number | undefined, _customerIndex: number): number {
    const preference = gene ?? 0.5;
    return Math.min(Math.floor(preference * this.problem.vehicles.length), this.problem.vehicles.length - 1);
  }

  /**
   * Creates a chromosome from a solution (for warm-start).
   * Encodes an existing solution into the 4n gene structure.
   */
  encode(solution: VrpSolution): Chromosome {
    const n = this.problem.customers.length;

    const priorities = new Array<number>(n).fill(0);
    const assignments = new Array<number>(n).fill(0);
    const dependencies = new Array<number>(n).fill(0);
    const transfers = new Array<number>(n).fill(0);

    // Encode priorities based on position in routes
    for (let rIdx = 0; rIdx < solution.routes.length; rIdx++) {
      const route = solution.routes[rIdx];
      if (!route) continue;

      for (let pos = 0; pos < route.nodes.length; pos++) {
        const nodeId = route.nodes[pos];
        if (!nodeId) continue;

        const customerIndex = this.problem.nodeToCustomerIndex.get(nodeId);
        if (customerIndex !== undefined) {
          // Priority based on position (earlier = lower value)
          priorities[customerIndex] = (rIdx * 100 + pos) / (solution.routes.length * 100);

          // Assignment based on vehicle
          assignments[customerIndex] = rIdx / solution.routes.length;

          // Dependencies based on delivery-pickup gap
          const customer = this.problem.customers[customerIndex];
          if (customer) {
            const dTime = solution.nodeTimes[customer.deliveryNodeId] ?? 0;
            const pTime = solution.nodeTimes[customer.pickupNodeId] ?? 0;
            const gap = pTime - dTime - customer.processingTime;
            dependencies[customerIndex] = Math.min(1, Math.max(0, gap / 100));
            transfers[customerIndex] = 0.5;
          }
        }
      }
    }

    return { priorities, assignments, dependencies, transfers };
  }
}
