import type { Solution } from '../core/Solution.js';
import type { Problem, CustomerWithTimeWindows } from '../core/Problem.js';

export interface VehicleUtilization {
  vehicleId: number;
  capacity: number;
  maxLoad: number;
  utilizationRate: number;
  totalDistance: number;
  totalTime: number;
  customerCount: number;
}

export interface WaitTimeAnalysis {
  nodeId: number;
  arrivalTime: number;
  waitTime: number;
  reason: 'resource' | 'timeWindow' | 'none';
}

export interface LoadOverTime {
  time: number;
  load: number;
}

export interface RouteComparison {
  routeId: number;
  vehicleId: number;
  makespan: number;
  totalDistance: number;
  totalCost: number;
  totalCO2: number;
  efficiency: number;
}

/**
 * Analytics engine for VRP-RPD solutions.
 * Provides insights into vehicle utilization, wait times, and route efficiency.
 */
export class RouteAnalytics {
  constructor(private readonly solution: Solution, private readonly problem: Problem) {}

  /**
   * Calculates vehicle utilization metrics for all routes.
   */
  getVehicleUtilization(): VehicleUtilization[] {
    const results: VehicleUtilization[] = [];

    for (const route of this.solution.routes) {
      const vehicle = this.problem.vehicles.find(v => v.id === route.vehicleId);
      if (!vehicle) continue;

      let maxLoadNeeded = 0;
      let currentLoad = 0;
      let customerCount = 0;

      for (const nodeId of route.nodes) {
        const isDelivery = this.problem.customers.some(c => c.deliveryNodeId === nodeId);
        const isPickup = this.problem.customers.some(c => c.pickupNodeId === nodeId);

        if (isDelivery) {
          currentLoad--;
          customerCount++;
        }
        if (isPickup) {
          currentLoad++;
        }
        if (currentLoad < maxLoadNeeded) {
          maxLoadNeeded = currentLoad;
        }
      }

      const initialLoad = -maxLoadNeeded;
      const utilizationRate = vehicle.capacity > 0 ? initialLoad / vehicle.capacity : 0;

      // Calculate total distance for this route
      let routeDistance = 0;
      let prevNode = this.problem.depotNodeId;
      for (const nodeId of route.nodes) {
        routeDistance += this.problem.getDistance(prevNode, nodeId);
        prevNode = nodeId;
      }
      routeDistance += this.problem.getDistance(prevNode, this.problem.depotNodeId);

      // Calculate total time (makespan contribution)
      const routeReturnKey = `depot_return_${this.solution.routes.indexOf(route)}`;
      const totalTime =
        this.solution.nodeTimes[routeReturnKey as unknown as number] ?? 0;

      results.push({
        vehicleId: route.vehicleId,
        capacity: vehicle.capacity,
        maxLoad: initialLoad,
        utilizationRate: Math.min(1, Math.max(0, utilizationRate)),
        totalDistance: routeDistance,
        totalTime,
        customerCount: customerCount / 2, // Divide by 2 because we count both D and P
      });
    }

    return results;
  }

  /**
   * Analyzes wait times at each node.
   */
  getWaitTimes(): WaitTimeAnalysis[] {
    const results: WaitTimeAnalysis[] = [];

    for (const [nodeIdStr, arrivalTime] of Object.entries(this.solution.nodeTimes)) {
      const nodeId = Number(nodeIdStr);
      if (Number.isNaN(nodeId)) continue;

      const customer = this.problem.customers.find(
        c => c.deliveryNodeId === nodeId || c.pickupNodeId === nodeId,
      );

      if (!customer) continue;

      let waitTime = 0;
      let reason: 'resource' | 'timeWindow' | 'none' = 'none';

      // Check if waiting for resource
      if (customer.pickupNodeId === nodeId) {
        const resourceReadyTime = this.solution.resourceReadyTimes[customer.id] ?? 0;
        if (resourceReadyTime > arrivalTime - customer.processingTime) {
          waitTime = resourceReadyTime - (arrivalTime - customer.processingTime);
          reason = 'resource';
        }
      }

      // Check time window constraints
      if ('earliestDeliveryTime' in customer) {
        const twCustomer = customer as CustomerWithTimeWindows;
        if (customer.deliveryNodeId === nodeId && arrivalTime < twCustomer.earliestDeliveryTime) {
          waitTime = twCustomer.earliestDeliveryTime - arrivalTime;
          reason = 'timeWindow';
        }
      }

      if (waitTime > 0 || reason !== 'none') {
        results.push({ nodeId, arrivalTime, waitTime, reason });
      }
    }

    return results;
  }

  /**
   * Generates load-over-time data for a specific route.
   */
  getLoadOverTime(routeIndex: number): LoadOverTime[] {
    const route = this.solution.routes[routeIndex];
    if (!route) return [];

    const result: LoadOverTime[] = [];
    let currentLoad = 0;
    let currentTime = 0;

    // Calculate initial load needed
    let minLoadNeeded = 0;
    for (const nodeId of route.nodes) {
      const isDelivery = this.problem.customers.some(c => c.deliveryNodeId === nodeId);
      const isPickup = this.problem.customers.some(c => c.pickupNodeId === nodeId);
      if (isDelivery) currentLoad--;
      if (isPickup) currentLoad++;
      if (currentLoad < minLoadNeeded) minLoadNeeded = currentLoad;
    }

    currentLoad = -minLoadNeeded;
    result.push({ time: 0, load: currentLoad });

    let prevNode = this.problem.depotNodeId;
    for (const nodeId of route.nodes) {
      const travelTime = this.problem.getDistance(prevNode, nodeId);
      currentTime += travelTime;

      const isDelivery = this.problem.customers.some(c => c.deliveryNodeId === nodeId);
      const isPickup = this.problem.customers.some(c => c.pickupNodeId === nodeId);

      if (isDelivery) currentLoad--;
      if (isPickup) currentLoad++;

      result.push({ time: currentTime, load: currentLoad });
      prevNode = nodeId;
    }

    // Return to depot
    const returnTime = this.problem.getDistance(prevNode, this.problem.depotNodeId);
    currentTime += returnTime;
    result.push({ time: currentTime, load: 0 });

    return result;
  }

  /**
   * Compares all routes side-by-side.
   */
  compareRoutes(): RouteComparison[] {
    const results: RouteComparison[] = [];

    for (let i = 0; i < this.solution.routes.length; i++) {
      const route = this.solution.routes[i];
      if (!route) continue;

      const vehicle = this.problem.vehicles.find(v => v.id === route.vehicleId);
      if (!vehicle) continue;

      // Calculate route-specific metrics
      let routeDistance = 0;
      let prevNode = this.problem.depotNodeId;
      for (const nodeId of route.nodes) {
        routeDistance += this.problem.getDistance(prevNode, nodeId);
        prevNode = nodeId;
      }
      routeDistance += this.problem.getDistance(prevNode, this.problem.depotNodeId);

      const routeCost = routeDistance * vehicle.costPerKm;
      const routeCO2 = routeDistance * vehicle.co2PerKm;

      const routeReturnKey = `depot_return_${i}`;
      const routeMakespan = this.solution.nodeTimes[routeReturnKey as unknown as number] ?? 0;

      // Efficiency: customers served per unit distance
      const customerCount = route.nodes.length / 2;
      const efficiency = routeDistance > 0 ? customerCount / routeDistance : 0;

      results.push({
        routeId: i,
        vehicleId: route.vehicleId,
        makespan: routeMakespan,
        totalDistance: routeDistance,
        totalCost: routeCost,
        totalCO2: routeCO2,
        efficiency,
      });
    }

    return results;
  }

  /**
   * Generates summary statistics for the entire solution.
   */
  getSummary(): {
    totalCustomers: number;
    totalVehicles: number;
    avgUtilization: number;
    totalDistance: number;
    totalCost: number;
    totalCO2: number;
    makespan: number;
    totalWaitTime: number;
  } {
    const utilization = this.getVehicleUtilization();
    const waitTimes = this.getWaitTimes();

    return {
      totalCustomers: this.problem.customers.length,
      totalVehicles: this.solution.routes.length,
      avgUtilization:
        utilization.length > 0
          ? utilization.reduce((sum, u) => sum + u.utilizationRate, 0) / utilization.length
          : 0,
      totalDistance: this.solution.totalDistance,
      totalCost: this.solution.totalCost,
      totalCO2: this.solution.totalCO2,
      makespan: this.solution.makespan,
      totalWaitTime: waitTimes.reduce((sum, w) => sum + w.waitTime, 0),
    };
  }
}
