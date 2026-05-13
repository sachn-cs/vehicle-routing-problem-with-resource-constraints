import type { VrpProblem, Customer, CustomerWithTimeWindows } from './Problem.js';

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

  /**
   * @param vehicleId - ID of the vehicle assigned to this route
   * @param nodes - Ordered list of node IDs to visit
   */
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
export class VrpSolution {
  public routes: Route[];
  public makespan: number;
  public nodeTimes: Record<number | string, number>;
  public resourceReadyTimes: Record<number, number>;
  public totalDistance: number;
  public totalCost: number;
  public totalCO2: number;

  /**
   * @param problem - VrpProblem instance this solution solves
   * @param routes - Vehicle routes; empty routes are created if not provided
   */
  constructor(
    public readonly problem: VrpProblem,
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
          const pickupCustomer = this.problem.pickupNodeMap.get(nodeId);
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

          // If this node is a delivery, enforce earliest delivery time before committing
          const deliveryCustomer = this.problem.deliveryNodeMap.get(nodeId);
          if (deliveryCustomer) {
            if (isCustomerWithTimeWindows(deliveryCustomer)) {
              if (arrivalTime < deliveryCustomer.earliestDeliveryTime) {
                arrivalTime = deliveryCustomer.earliestDeliveryTime;
              }
            }
          }

          if (nodeTimes[nodeId] !== arrivalTime) {
            nodeTimes[nodeId] = arrivalTime;
            changed = true;

            if (deliveryCustomer) {
              resourceReadyTimes[deliveryCustomer.id] = arrivalTime + deliveryCustomer.processingTime;
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

    // Calculate total cost and CO2 (per-route, per-vehicle)
    this.totalCost = 0;
    this.totalCO2 = 0;
    for (const route of this.routes) {
      const vehicle = this.problem.vehicleMap.get(route.vehicleId);
      if (!vehicle) continue;

      const routeDistance = this.calculateRouteDistance(route);
      this.totalCost += routeDistance * vehicle.costPerKm;
      this.totalCO2 += routeDistance * vehicle.co2PerKm;
    }

    return this.makespan;
  }

  /**
   * @param route - Route to measure
   * @returns Total distance for the route including return to depot
   */
  calculateRouteDistance(route: Route): number {
    let distance = 0;
    let prevNode = this.problem.depotNodeId;
    for (const nodeId of route.nodes) {
      distance += this.problem.getDistance(prevNode, nodeId);
      prevNode = nodeId;
    }
    distance += this.problem.getDistance(prevNode, this.problem.depotNodeId);
    return distance;
  }

  /**
   * Evaluates a single route's depot return time given existing resource ready times.
   * Single-pass: no while(changed) loop, no cross-route propagation.
   */
  evaluateRouteReturnTime(
    route: Route,
    baseResourceReadyTimes: Record<number, number>,
    nodeReadyTimes?: Record<number, number>,
  ): { returnTime: number; updatedReadyTimes: Record<number, number>; nodeArrivalTimes: Record<number, number> } {
    let currentTime = 0;
    let prevNode = this.problem.depotNodeId;
    const updatedReadyTimes: Record<number, number> = { ...baseResourceReadyTimes };
    const nodeArrivalTimes: Record<number, number> = {};

    for (const nodeId of route.nodes) {
      const travelTime = this.problem.getDistance(prevNode, nodeId);
      let arrivalTime = currentTime + travelTime;

      // Apply node-specific ready time (e.g. hub arrival from another route)
      const nodeReady = nodeReadyTimes?.[nodeId];
      if (nodeReady !== undefined && nodeReady > arrivalTime) {
        arrivalTime = nodeReady;
      }

      const pickupCustomer = this.problem.pickupNodeMap.get(nodeId);
      if (pickupCustomer) {
        const readyTime = updatedReadyTimes[pickupCustomer.id] ?? 0;
        if (readyTime > arrivalTime) arrivalTime = readyTime;
        if (isCustomerWithTimeWindows(pickupCustomer)) {
          if (arrivalTime < pickupCustomer.earliestPickupTime) {
            arrivalTime = pickupCustomer.earliestPickupTime;
          }
        }
      }

      const deliveryCustomer = this.problem.deliveryNodeMap.get(nodeId);
      if (deliveryCustomer) {
        if (isCustomerWithTimeWindows(deliveryCustomer)) {
          if (arrivalTime < deliveryCustomer.earliestDeliveryTime) {
            arrivalTime = deliveryCustomer.earliestDeliveryTime;
          }
        }
        updatedReadyTimes[deliveryCustomer.id] = arrivalTime + deliveryCustomer.processingTime;
      }

      nodeArrivalTimes[nodeId] = arrivalTime;
      currentTime = arrivalTime;
      prevNode = nodeId;
    }

    const returnTime = currentTime + this.problem.getDistance(prevNode, this.problem.depotNodeId);
    return { returnTime, updatedReadyTimes, nodeArrivalTimes };
  }

  /**
   * Computes makespan if `routeIndex` is replaced with `newRoute`.
   * Uses current route return times for all other routes.
   */
  evaluateMakespanWithRoute(routeIndex: number, newRoute: Route): number {
    const { returnTime } = this.evaluateRouteReturnTime(newRoute, this.resourceReadyTimes);
    let maxReturn = returnTime;
    for (let i = 0; i < this.routes.length; i++) {
      if (i === routeIndex) continue;
      const key = `depot_return_${i}`;
      const rt = this.nodeTimes[key] ?? 0;
      if (rt > maxReturn) maxReturn = rt;
    }
    return maxReturn;
  }

  /**
   * Computes makespan when two routes are replaced (for transfer scenarios).
   */
  evaluateMakespanWithTwoRoutes(
    routeIndexA: number,
    newRouteA: Route,
    routeIndexB: number,
    newRouteB: Route,
    hubNodeId: number,
  ): { makespan: number; hubReadyTime: number } {
    const { returnTime: returnA, nodeArrivalTimes } = this.evaluateRouteReturnTime(
      newRouteA,
      this.resourceReadyTimes,
    );

    const hubReadyTime = nodeArrivalTimes[hubNodeId] ?? 0;

    const { returnTime: returnB } = this.evaluateRouteReturnTime(
      newRouteB,
      this.resourceReadyTimes,
      { [hubNodeId]: hubReadyTime },
    );

    let maxReturn = Math.max(returnA, returnB);
    for (let i = 0; i < this.routes.length; i++) {
      if (i === routeIndexA || i === routeIndexB) continue;
      const key = `depot_return_${i}`;
      const rt = this.nodeTimes[key] ?? 0;
      if (rt > maxReturn) maxReturn = rt;
    }
    return { makespan: maxReturn, hubReadyTime };
  }

  private calculateTotalDistance(): number {
    let totalDistance = 0;
    for (const route of this.routes) {
      totalDistance += this.calculateRouteDistance(route);
    }
    return totalDistance;
  }

  /**
   * @returns True if the solution satisfies capacity, completeness, and time window constraints
   */
  isFeasible(): boolean {
    return this.checkCapacity() && this.isComplete() && this.checkTimeWindows();
  }

  /**
   * @returns True if no vehicle exceeds its capacity at any point
   */
  checkCapacity(): boolean {
    for (const route of this.routes) {
      const vehicle = this.problem.vehicleMap.get(route.vehicleId);
      const k = vehicle?.capacity ?? Infinity;

      // Calculate minimum initial load needed to satisfy all deliveries before pickups
      let minLoadNeeded = 0;
      let currentLoad = 0;
      for (const nodeId of route.nodes) {
        const isDelivery = this.problem.deliveryNodeMap.has(nodeId);
        const isPickup = this.problem.pickupNodeMap.has(nodeId);
        if (isDelivery) currentLoad--;
        if (isPickup) currentLoad++;
        if (currentLoad < minLoadNeeded) minLoadNeeded = currentLoad;
      }

      // Initial load must be at least -minLoadNeeded to stay >= 0
      let load = -minLoadNeeded;
      if (load > k) return false;

      for (const nodeId of route.nodes) {
        const isDelivery = this.problem.deliveryNodeMap.has(nodeId);
        const isPickup = this.problem.pickupNodeMap.has(nodeId);
        if (isDelivery) load--;
        if (isPickup) load++;
        if (load < 0 || load > k) return false;
      }
    }
    return true;
  }

  /**
   * @returns True if every customer's delivery and pickup nodes are visited
   */
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

  /**
   * @returns True if all time window constraints are respected
   */
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

  /**
   * @returns Deep copy of this solution
   */
  clone(): VrpSolution {
    const cloned = new VrpSolution(this.problem, this.routes.map(r => r.clone()));
    cloned.makespan = this.makespan;
    cloned.nodeTimes = { ...this.nodeTimes };
    cloned.resourceReadyTimes = { ...this.resourceReadyTimes };
    cloned.totalDistance = this.totalDistance;
    cloned.totalCost = this.totalCost;
    cloned.totalCO2 = this.totalCO2;
    return cloned;
  }

  /**
   * @returns Pareto objective vector for multi-objective optimization
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

/** @deprecated Use {@link VrpSolution} instead. */
export const Solution = VrpSolution;
