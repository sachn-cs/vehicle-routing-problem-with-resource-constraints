/**
 * Represents a coordinate or location in the VRP problem.
 */
export class Node {
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
export class Problem {
  public readonly distanceMatrix: Readonly<Record<number, Readonly<Record<number, number>>>>;

  constructor(
    public readonly nodes: Readonly<Record<number, Node>>,
    public readonly customers: ReadonlyArray<Customer>,
    public readonly vehicles: ReadonlyArray<Vehicle>,
    public readonly depotNodeId: number = 0,
  ) {
    this.distanceMatrix = this.calculateDistanceMatrix();
  }

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

  getDistance(fromId: number, toId: number): number {
    const distance = this.distanceMatrix[fromId]?.[toId];
    return distance ?? 0;
  }

  getTravelTime(fromId: number, toId: number, speed: number = 1): number {
    return this.getDistance(fromId, toId) / speed;
  }
}
