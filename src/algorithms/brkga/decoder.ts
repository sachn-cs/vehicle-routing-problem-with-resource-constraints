import type { VrpProblem, Customer, Vehicle } from '../../core/problem.js';
import { VrpSolution, Route } from '../../core/solution.js';

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

interface RouteLoad {
  currentLoad: number;
  minDelta: number;
  maxDelta: number;
}

function canAddOperation(
  load: RouteLoad,
  capacity: number,
  type: 'delivery' | 'pickup',
): boolean {
  const delta = type === 'delivery' ? -1 : 1;
  const newCurrent = load.currentLoad + delta;
  const newMin = Math.min(load.minDelta, newCurrent);
  const newMax = Math.max(load.maxDelta, newCurrent);
  const initialLoadNeeded = -newMin;
  const peakLoad = initialLoadNeeded + newMax;
  return initialLoadNeeded <= capacity && peakLoad <= capacity;
}

function updateLoad(
  load: RouteLoad,
  type: 'delivery' | 'pickup',
): void {
  const delta = type === 'delivery' ? -1 : 1;
  load.currentLoad += delta;
  load.minDelta = Math.min(load.minDelta, load.currentLoad);
  load.maxDelta = Math.max(load.maxDelta, load.currentLoad);
}

/**
 * Single-pass decoder for BRKGA.
 *
 * Schedules all deliveries in priority order (capacity-aware, O(1) per check),
 * then schedules pickups in a single follow-up pass.
 * Uses α genes for tie-breaking in priority sort.
 */
export class Decoder {
  constructor(private readonly problem: VrpProblem) {}

  decode(chromosome: Chromosome): VrpSolution {
    const numCustomers = this.problem.customers.length;
    const numVehicles = this.problem.vehicles.length;

    const routes = this.problem.vehicles.map((v: Vehicle) => new Route(v.id, []));
    const solution = new VrpSolution(this.problem, routes);

    // Precompute vehicle assignments and route load trackers
    const assignedVehicle: number[] = [];
    assignedVehicle.length = numCustomers;
    const routeLoads: RouteLoad[] = routes.map(() => ({
      currentLoad: 0, minDelta: 0, maxDelta: 0,
    }));

    // Customer order based on priority genes (π), with α as tie-breaker
    const customerOrder = this.problem.customers.map((_c: Customer, i: number) => i);
    customerOrder.sort((a, b) => {
      const pa = chromosome.priorities[a] ?? 0;
      const pb = chromosome.priorities[b] ?? 0;
      if (pa !== pb) return pa - pb;
      return (chromosome.dependencies[a] ?? 0) - (chromosome.dependencies[b] ?? 0);
    });

    // Precompute vehicle index for every customer
    for (const idx of customerOrder) {
      const gene = chromosome.assignments[idx] ?? 0.5;
      assignedVehicle[idx] = Math.min(
        Math.floor(gene * numVehicles),
        numVehicles - 1,
      );
    }

    const deliveryScheduled = new Set<number>();
    const pickupScheduled = new Set<number>();

    // Pass 1: Schedule all deliveries with O(1) capacity checks
    for (const idx of customerOrder) {
      const customer = this.problem.customers[idx];
      if (!customer) continue;

      const targetV = assignedVehicle[idx];
      if (targetV === undefined) continue;
      const route = routes[targetV];
      if (!route) continue;
      const load = routeLoads[targetV];
      if (!load) continue;

      if (canAddOperation(load, this.vehicleCapacity(targetV), 'delivery')) {
        route.nodes.push(customer.deliveryNodeId);
        updateLoad(load, 'delivery');
        deliveryScheduled.add(idx);
      } else {
        const alt = this.findCapableVehicleFast(routeLoads, routes, customer, 'delivery', targetV);
        if (alt >= 0) {
          const altRoute = routes[alt];
          const altLoad = routeLoads[alt];
          if (altRoute && altLoad) {
            altRoute.nodes.push(customer.deliveryNodeId);
            updateLoad(altLoad, 'delivery');
            deliveryScheduled.add(idx);
          }
        }
      }
    }

    // Single schedule calculation gives all delivery nodeTimes
    solution.calculateSchedule();

    // Pass 2: Schedule pickups in a single pass
    for (const idx of customerOrder) {
      if (!deliveryScheduled.has(idx)) continue;
      if (pickupScheduled.has(idx)) continue;

      const customer = this.problem.customers[idx];
      if (!customer) continue;
      if (solution.nodeTimes[customer.deliveryNodeId] === undefined) continue;

      const targetV = assignedVehicle[idx];
      if (targetV === undefined) continue;
      const route = routes[targetV];
      if (!route) continue;
      const load = routeLoads[targetV];
      if (!load) continue;

      if (canAddOperation(load, this.vehicleCapacity(targetV), 'pickup')) {
        route.nodes.push(customer.pickupNodeId);
        updateLoad(load, 'pickup');
        pickupScheduled.add(idx);
      } else {
        const alt = this.findCapableVehicleFast(routeLoads, routes, customer, 'pickup', targetV);
        if (alt >= 0) {
          const altRoute = routes[alt];
          const altLoad = routeLoads[alt];
          if (altRoute && altLoad) {
            altRoute.nodes.push(customer.pickupNodeId);
            updateLoad(altLoad, 'pickup');
            pickupScheduled.add(idx);
          }
        }
      }
    }

    // Force any remaining unscheduled pickups
    for (const idx of customerOrder) {
      if (!deliveryScheduled.has(idx) || pickupScheduled.has(idx)) continue;
      const customer = this.problem.customers[idx];
      if (!customer) continue;
      const targetV = assignedVehicle[idx];
      if (targetV === undefined) continue;
      const route = routes[targetV];
      if (route) {
        route.nodes.push(customer.pickupNodeId);
        pickupScheduled.add(idx);
      }
    }

    solution.calculateSchedule();
    return solution;
  }

  private vehicleCapacity(vehicleIndex: number): number {
    const vehicle = this.problem.vehicles[vehicleIndex];
    return vehicle?.capacity ?? 0;
  }

  private findCapableVehicleFast(
    loads: RouteLoad[],
    routes: Route[],
    customer: Customer,
    type: 'delivery' | 'pickup',
    preferredIndex: number,
  ): number {
    const preferredLoad = loads[preferredIndex];
    if (
      preferredLoad &&
      canAddOperation(preferredLoad, this.vehicleCapacity(preferredIndex), type)
    ) {
      return preferredIndex;
    }

    for (let i = 0; i < routes.length; i++) {
      if (i === preferredIndex) continue;
      const load = loads[i];
      const route = routes[i];
      if (!route || !load) continue;
      if (canAddOperation(load, this.vehicleCapacity(i), type)) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Creates a chromosome from a solution (for warm-start).
   */
  encode(solution: VrpSolution): Chromosome {
    const n = this.problem.customers.length;

    const priorities: number[] = Array.from<number>({ length: n }).fill(0);
    const assignments: number[] = Array.from<number>({ length: n }).fill(0);
    const dependencies: number[] = Array.from<number>({ length: n }).fill(0);
    const transfers: number[] = Array.from<number>({ length: n }).fill(0);

    for (let rIdx = 0; rIdx < solution.routes.length; rIdx++) {
      const route = solution.routes[rIdx];
      if (!route) continue;

      for (let pos = 0; pos < route.nodes.length; pos++) {
        const nodeId = route.nodes[pos];
        if (!nodeId) continue;

        const customerIndex = this.problem.nodeToCustomerIndex.get(nodeId);
        if (customerIndex === undefined) continue;

        priorities[customerIndex] = (rIdx * 100 + pos) / (solution.routes.length * 100);
        assignments[customerIndex] = rIdx / this.problem.vehicles.length;

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

    return { priorities, assignments, dependencies, transfers };
  }
}
