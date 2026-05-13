import { ValidationError } from '../errors.js';

/**
 * Represents a coordinate or location in the VRP problem.
 */
export class LocationNode {
  /**
   * @param id - Unique node identifier
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param name - Optional display name
   */
  constructor(
    public readonly id: number,
    public readonly x: number,
    public readonly y: number,
    public readonly name: string = '',
  ) {}
}

/**
 * Represents a customer with a delivery and a pickup requirement.
 * In VRP-RPD, the resource is delivered to D_c, processed for p_c, and then picked up at P_c.
 */
export class Customer {
  /**
   * @param id - Unique customer identifier
   * @param deliveryNodeId - Node where delivery occurs
   * @param pickupNodeId - Node where pickup occurs
   * @param processingTime - Time required to process the resource between delivery and pickup
   */
  constructor(
    public readonly id: number,
    public readonly deliveryNodeId: number,
    public readonly pickupNodeId: number,
    public readonly processingTime: number,
  ) {}
}

/**
 * Represents a customer with time window constraints (VRPTW extension).
 */
export class CustomerWithTimeWindows extends Customer {
  /**
   * @param id - Unique customer identifier
   * @param deliveryNodeId - Node where delivery occurs
   * @param pickupNodeId - Node where pickup occurs
   * @param processingTime - Time required to process the resource
   * @param earliestDeliveryTime - Earliest allowed delivery time
   * @param latestDeliveryTime - Latest allowed delivery time
   * @param earliestPickupTime - Earliest allowed pickup time
   * @param latestPickupTime - Latest allowed pickup time
   */
  constructor(
    id: number,
    deliveryNodeId: number,
    pickupNodeId: number,
    processingTime: number,
    public readonly earliestDeliveryTime: number,
    public readonly latestDeliveryTime: number,
    public readonly earliestPickupTime: number,
    public readonly latestPickupTime: number,
  ) {
    super(id, deliveryNodeId, pickupNodeId, processingTime);
  }
}

/**
 * Represents a vehicle with a specific capacity.
 */
export class Vehicle {
  /**
   * @param id - Unique vehicle identifier
   * @param capacity - Maximum load the vehicle can carry
   * @param startDepotId - Depot where the route begins
   * @param endDepotId - Depot where the route ends
   * @param costPerKm - Cost per unit distance
   * @param co2PerKm - CO2 emissions per unit distance
   */
  constructor(
    public readonly id: number,
    public readonly capacity: number,
    public readonly startDepotId: number = 0,
    public readonly endDepotId: number = 0,
    public readonly costPerKm: number = 1,
    public readonly co2PerKm: number = 1,
  ) {}
}

/**
 * Main problem instance.
 */
export class VrpProblem {
  public readonly distanceMatrix: Readonly<Record<number, Readonly<Record<number, number>>>>;

  constructor(
    public readonly nodes: Readonly<Record<number, LocationNode>>,
    public readonly customers: ReadonlyArray<Customer>,
    public readonly vehicles: ReadonlyArray<Vehicle>,
    public readonly depotNodeId: number = 0,
  ) {
    // Input validation
    const nodeEntries = Object.entries(nodes);
    if (nodeEntries.length === 0) {
      throw new ValidationError('Problem nodes cannot be empty');
    }
    if (customers.length === 0) {
      throw new ValidationError('Problem customers cannot be empty');
    }
    if (vehicles.length === 0) {
      throw new ValidationError('Problem vehicles cannot be empty');
    }

    for (const [, node] of nodeEntries) {
      if (!node) continue; // eslint-disable-line @typescript-eslint/no-unnecessary-condition
      if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
        throw new ValidationError(`Node ${node.id} has invalid coordinates: x=${node.x}, y=${node.y}`);
      }
      if (node.x < 0 || node.y < 0) {
        throw new ValidationError(`Node ${node.id} has negative coordinates: x=${node.x}, y=${node.y}`);
      }
    }

    const customerIds = new Set<number>();
    for (const customer of customers) {
      if (customerIds.has(customer.id)) {
        throw new ValidationError(`Duplicate customer ID: ${customer.id}`);
      }
      customerIds.add(customer.id);
      if (!nodes[customer.deliveryNodeId]) {
        throw new ValidationError(
          `Customer ${customer.id} references non-existent delivery node ${customer.deliveryNodeId}`,
        );
      }
      if (!nodes[customer.pickupNodeId]) {
        throw new ValidationError(
          `Customer ${customer.id} references non-existent pickup node ${customer.pickupNodeId}`,
        );
      }
      if (customer.processingTime < 0) {
        throw new ValidationError(`Customer ${customer.id} has negative processingTime: ${customer.processingTime}`);
      }
    }

    const vehicleIds = new Set<number>();
    for (const vehicle of vehicles) {
      if (vehicleIds.has(vehicle.id)) {
        throw new ValidationError(`Duplicate vehicle ID: ${vehicle.id}`);
      }
      vehicleIds.add(vehicle.id);
      if (vehicle.capacity <= 0) {
        throw new ValidationError(`Vehicle ${vehicle.id} must have positive capacity, got ${vehicle.capacity}`);
      }
    }

    if (!nodes[depotNodeId]) {
      throw new ValidationError(`Depot node ${depotNodeId} does not exist in nodes`);
    }

    // Build O(1) lookup indexes
    const deliveryNodeMap = new Map<number, Customer>();
    const pickupNodeMap = new Map<number, Customer>();
    const nodeToCustomerIndex = new Map<number, number>();
    for (let i = 0; i < customers.length; i++) {
      const c = customers[i]!;
      deliveryNodeMap.set(c.deliveryNodeId, c);
      pickupNodeMap.set(c.pickupNodeId, c);
      nodeToCustomerIndex.set(c.deliveryNodeId, i);
      nodeToCustomerIndex.set(c.pickupNodeId, i);
    }
    this.deliveryNodeMap = deliveryNodeMap;
    this.pickupNodeMap = pickupNodeMap;
    this.nodeToCustomerIndex = nodeToCustomerIndex;

    const vehicleMap = new Map<number, Vehicle>();
    for (const v of vehicles) {
      vehicleMap.set(v.id, v);
    }
    this.vehicleMap = vehicleMap;

    this.distanceMatrix = this.calculateDistanceMatrix();
  }

  public readonly deliveryNodeMap: ReadonlyMap<number, Customer>;
  public readonly pickupNodeMap: ReadonlyMap<number, Customer>;
  public readonly vehicleMap: ReadonlyMap<number, Vehicle>;
  public readonly nodeToCustomerIndex: ReadonlyMap<number, number>;

  private calculateDistanceMatrix(): Record<number, Record<number, number>> {
    const matrix: Record<number, Record<number, number>> = {};
    const nodeIds = Object.keys(this.nodes).map(Number);

    for (const i of nodeIds) {
      matrix[i] = {};
      for (const j of nodeIds) {
        const n1 = this.nodes[i];
        const n2 = this.nodes[j];
        if (n1 && n2) {
          matrix[i][j] = Math.sqrt(Math.pow(n1.x - n2.x, 2) + Math.pow(n1.y - n2.y, 2));
        } else {
          matrix[i][j] = 0;
        }
      }
    }

    return matrix;
  }

  /**
   * @param fromId - Origin node ID
   * @param toId - Destination node ID
   * @returns Euclidean distance between the two nodes
   */
  getDistance(fromId: number, toId: number): number {
    const distance = this.distanceMatrix[fromId]?.[toId];
    return distance ?? 0;
  }

  /**
   * @param fromId - Origin node ID
   * @param toId - Destination node ID
   * @param speed - Vehicle speed (default 1)
   * @returns Travel time between the two nodes
   */
  getTravelTime(fromId: number, toId: number, speed: number = 1): number {
    return this.getDistance(fromId, toId) / speed;
  }
}

/** @deprecated Use {@link LocationNode} instead. */
export const Node = LocationNode;
/** @deprecated Use {@link LocationNode} instead. */
export type Node = LocationNode;

/** @deprecated Use {@link VrpProblem} instead. */
export const Problem = VrpProblem;
/** @deprecated Use {@link VrpProblem} instead. */
export type Problem = VrpProblem;
