import type { LocationNode, Customer, Vehicle } from './problem.js';

/**
 * Represents a depot where vehicles can start and end their routes.
 */
export class Depot {
  /**
   * @param id - Unique depot identifier
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
 * Multi-depot VRP-RPD problem instance.
 * Vehicles can start and end at different depots.
 */
export class MultiDepotProblem {
  readonly distanceMatrix: Readonly<Record<number, Readonly<Record<number, number>>>>;

  /**
   * @param nodes - Available nodes by ID
   * @param customers - Customers to serve
   * @param vehicles - Fleet vehicles
   * @param depots - Depot locations
   * @param vehicleDepotAssignments - Map of vehicleId -> depotId
   */
  constructor(
    public readonly nodes: Readonly<Record<number, LocationNode>>,
    public readonly customers: ReadonlyArray<Customer>,
    public readonly vehicles: ReadonlyArray<Vehicle>,
    public readonly depots: ReadonlyArray<Depot>,
    public readonly vehicleDepotAssignments: ReadonlyMap<number, number>,
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
   * @param vehicleId - Vehicle to look up
   * @returns Assigned depot for the vehicle
   */
  getDepotForVehicle(vehicleId: number): Depot | undefined {
    const depotId = this.vehicleDepotAssignments.get(vehicleId);
    if (depotId === undefined) return undefined;
    return this.depots.find(d => d.id === depotId);
  }

  /**
   * @param depotId - Depot to look up
   * @returns Depot with the given ID
   */
  getDepotById(depotId: number): Depot | undefined {
    return this.depots.find(d => d.id === depotId);
  }
}
