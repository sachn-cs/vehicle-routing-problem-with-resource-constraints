import type { Problem, Customer, CustomerWithTimeWindows } from './Problem.js';

/**
 * Type guard to check if a customer has time windows.
 */
function isCustomerWithTimeWindows(customer: Customer): customer is CustomerWithTimeWindows {
  return 'earliestDeliveryTime' in customer;
}

/**
 * Represents a single vehicle's route.
 * Contains a sequence of operations (delivery or pickup).
 */
export class Route {
  public readonly nodes: number[];

  constructor(
    public readonly vehicleId: number,
    nodes: number[] = [],
  ) {
    this.nodes = [...nodes];
  }

  addNode(nodeId: number): void {
    this.nodes.push(nodeId);
  }

  removeNode(nodeId: number): void {
    const index = this.nodes.indexOf(nodeId);
    if (index !== -1) {
      this.nodes.splice(index, 1);
    }
  }

  hasNode(nodeId: number): boolean {
    return this.nodes.includes(nodeId);
  }

  clone(): Route {
    return new Route(this.vehicleId, [...this.nodes]);
  }
}

/**
 * Represents a full solution to the VRP-RPD problem.
 */
export class Solution {
  public routes: Route[];
  public makespan: number;
  public nodeTimes: Record<number | string, number>;
  public resourceReadyTimes: Record<number, number>;
  public totalDistance: number;
  public totalCost: number;
  public totalCO2: number;

  constructor(
    public readonly problem: Problem,
    routes: Route[] = [],
  ) {
    this.routes = routes.length > 0 ? routes : problem.vehicles.map(v => new Route(v.id, []));
    this.makespan = Infinity;
    this.nodeTimes = {};
    this.resourceReadyTimes = {};
    this.totalDistance = 0;
    this.totalCost = 0;
    this.totalCO2 = 0;
  }

  /**
   * Calculates the arrival times for all nodes and the total makespan.
   * Handles the resource constraints between delivery and pickup.
   */
  calculateSchedule(): number {
    const nodeTimes: Record<number | string, number> = {};
    const resourceReadyTimes: Record<number, number> = {};
    const vehicleLastTimes = this.routes.map(() => 0);

    let changed = true;
    let iterations = 0;
    const maxIterations = 1000;

    while (changed && iterations < maxIterations) {
      changed = false;
      iterations++;

      for (let vIdx = 0; vIdx < this.routes.length; vIdx++) {
        const route = this.routes[vIdx];
        if (!route) continue;
        let currentTime = 0;
        let prevNode = this.problem.depotNodeId;

        for (const nodeId of route.nodes) {
          const travelTime = this.problem.getDistance(prevNode, nodeId);
          let arrivalTime = currentTime + travelTime;

          // Check if this node is a pickup
          const pickupCustomer = this.problem.customers.find(c => c.pickupNodeId === nodeId);
          if (pickupCustomer) {
            const readyTime = resourceReadyTimes[pickupCustomer.id] ?? 0;
            if (readyTime > arrivalTime) {
              arrivalTime = readyTime;
            }

            // Time window check for VRPTW
            if (isCustomerWithTimeWindows(pickupCustomer)) {
              if (arrivalTime < pickupCustomer.earliestPickupTime) {
                arrivalTime = pickupCustomer.earliestPickupTime;
              }
            }
          }

          if (nodeTimes[nodeId] !== arrivalTime) {
            nodeTimes[nodeId] = arrivalTime;
            changed = true;

            // If this node is a delivery, update resource ready time
            const deliveryCustomer = this.problem.customers.find(c => c.deliveryNodeId === nodeId);
            if (deliveryCustomer) {
              resourceReadyTimes[deliveryCustomer.id] = arrivalTime + deliveryCustomer.processingTime;

              // Time window check for VRPTW
              if (isCustomerWithTimeWindows(deliveryCustomer)) {
                if (arrivalTime < deliveryCustomer.earliestDeliveryTime) {
                  resourceReadyTimes[deliveryCustomer.id] =
                    deliveryCustomer.earliestDeliveryTime + deliveryCustomer.processingTime;
                }
              }
            }
          }

          currentTime = arrivalTime;
          prevNode = nodeId;
        }

        // Return to depot
        const returnTime =
          currentTime + this.problem.getDistance(prevNode, this.problem.depotNodeId);
        const routeKey = `depot_return_${vIdx}`;
        if (nodeTimes[routeKey] !== returnTime) {
          nodeTimes[routeKey] = returnTime;
          changed = true;
        }

        vehicleLastTimes[vIdx] = returnTime;
      }
    }

    this.nodeTimes = nodeTimes;
    this.resourceReadyTimes = resourceReadyTimes;

    // Makespan is the max return time to depot
    const depotReturns = this.routes.map((_, vIdx) =>
      nodeTimes[`depot_return_${vIdx}`] ?? 0,
    );
    this.makespan = Math.max(...depotReturns);

    // Calculate total distance
    this.totalDistance = this.calculateTotalDistance();

    // Calculate total cost and CO2
    this.totalCost = 0;
    this.totalCO2 = 0;
    for (const route of this.routes) {
      const vehicle = this.problem.vehicles.find(v => v.id === route.vehicleId);
      if (vehicle) {
        this.totalCost += this.totalDistance * vehicle.costPerKm;
        this.totalCO2 += this.totalDistance * vehicle.co2PerKm;
      }
    }

    return this.makespan;
  }

  private calculateTotalDistance(): number {
    let totalDistance = 0;

    for (const route of this.routes) {
      let prevNode = this.problem.depotNodeId;
      for (const nodeId of route.nodes) {
        totalDistance += this.problem.getDistance(prevNode, nodeId);
        prevNode = nodeId;
      }
      // Return to depot
      totalDistance += this.problem.getDistance(prevNode, this.problem.depotNodeId);
    }

    return totalDistance;
  }

  isFeasible(): boolean {
    return this.checkCapacity() && this.isComplete() && this.checkTimeWindows();
  }

  checkCapacity(): boolean {
    for (const route of this.routes) {
      const vehicle = this.problem.vehicles.find(v => v.id === route.vehicleId);
      const k = vehicle?.capacity ?? Infinity;

      // Calculate minimum initial load needed to satisfy all deliveries before pickups
      let minLoadNeeded = 0;
      let currentLoad = 0;
      for (const nodeId of route.nodes) {
        const isDelivery = this.problem.customers.some(c => c.deliveryNodeId === nodeId);
        const isPickup = this.problem.customers.some(c => c.pickupNodeId === nodeId);
        if (isDelivery) currentLoad--;
        if (isPickup) currentLoad++;
        if (currentLoad < minLoadNeeded) minLoadNeeded = currentLoad;
      }

      // Initial load must be at least -minLoadNeeded to stay >= 0
      let load = -minLoadNeeded;
      if (load > k) return false;

      for (const nodeId of route.nodes) {
        const isDelivery = this.problem.customers.some(c => c.deliveryNodeId === nodeId);
        const isPickup = this.problem.customers.some(c => c.pickupNodeId === nodeId);
        if (isDelivery) load--;
        if (isPickup) load++;
        if (load < 0 || load > k) return false;
      }
    }
    return true;
  }

  isComplete(): boolean {
    const visitedNodes = new Set<number>();
    for (const route of this.routes) {
      for (const nodeId of route.nodes) {
        visitedNodes.add(nodeId);
      }
    }

    for (const customer of this.problem.customers) {
      if (!visitedNodes.has(customer.deliveryNodeId)) return false;
      if (!visitedNodes.has(customer.pickupNodeId)) return false;
    }
    return true;
  }

  checkTimeWindows(): boolean {
    for (const customer of this.problem.customers) {
      if (isCustomerWithTimeWindows(customer)) {
        const deliveryTime = this.nodeTimes[customer.deliveryNodeId];
        if (deliveryTime !== undefined && deliveryTime > customer.latestDeliveryTime) {
          return false;
        }
        const pickupTime = this.nodeTimes[customer.pickupNodeId];
        if (pickupTime !== undefined && pickupTime > customer.latestPickupTime) {
          return false;
        }
      }
    }
    return true;
  }

  clone(): Solution {
    const cloned = new Solution(this.problem, this.routes.map(r => r.clone()));
    cloned.makespan = this.makespan;
    cloned.nodeTimes = { ...this.nodeTimes };
    cloned.resourceReadyTimes = { ...this.resourceReadyTimes };
    cloned.totalDistance = this.totalDistance;
    cloned.totalCost = this.totalCost;
    cloned.totalCO2 = this.totalCO2;
    return cloned;
  }

  /**
   * Returns Pareto objective vector for multi-objective optimization.
   */
  getObjectives(): Readonly<{
    makespan: number;
    totalDistance: number;
    totalCost: number;
    totalCO2: number;
  }> {
    return {
      makespan: this.makespan,
      totalDistance: this.totalDistance,
      totalCost: this.totalCost,
      totalCO2: this.totalCO2,
    };
  }
}
