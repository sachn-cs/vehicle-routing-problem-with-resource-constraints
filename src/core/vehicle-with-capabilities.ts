import { Vehicle } from './problem.js';

/**
 * Types of resources a vehicle can handle.
 */
export type ResourceType = 'standard' | 'refrigerated' | 'hazmat' | 'fragile';

/**
 * Extended vehicle with transfer capabilities and resource types.
 */
export class VehicleWithCapabilities extends Vehicle {
  /**
   * @param id - Unique vehicle identifier
   * @param capacity - Maximum load the vehicle can carry
   * @param supportedResourceTypes - Resource types this vehicle can transport
   * @param canReceiveFromVehicle - Whether this vehicle can receive transfers
   * @param canGiveToVehicle - Whether this vehicle can give transfers
   * @param maxTransferAmount - Maximum amount transferable in one operation
   * @param transferSpeedMultiplier - Speed factor for transfer operations
   * @param startDepotId - Depot where the route begins
   * @param endDepotId - Depot where the route ends
   * @param costPerKm - Cost per unit distance
   * @param co2PerKm - CO2 emissions per unit distance
   */
  constructor(
    id: number,
    capacity: number,
    public readonly supportedResourceTypes: ResourceType[] = ['standard'],
    public readonly canReceiveFromVehicle: boolean = true,
    public readonly canGiveToVehicle: boolean = true,
    public readonly maxTransferAmount: number = Infinity,
    public readonly transferSpeedMultiplier: number = 1,
    startDepotId: number = 0,
    endDepotId: number = 0,
    costPerKm: number = 1,
    co2PerKm: number = 1,
  ) {
    super(id, capacity, startDepotId, endDepotId, costPerKm, co2PerKm);
  }

  /**
   * @param type - Resource type to check
   * @returns True if this vehicle can transport the given resource type
   */
  canHandleResource(type: ResourceType): boolean {
    return this.supportedResourceTypes.includes(type);
  }

  /**
   * @param other - Vehicle to check compatibility with
   * @returns True if this vehicle can transfer resources to the other vehicle
   */
  canTransferWith(other: VehicleWithCapabilities): boolean {
    // Check if both vehicles support at least one common resource type
    const commonTypes = this.supportedResourceTypes.filter(t =>
      other.supportedResourceTypes.includes(t),
    );
    if (commonTypes.length === 0) return false;

    // Directed transfer: this vehicle gives, other vehicle receives
    if (!this.canGiveToVehicle || !other.canReceiveFromVehicle) return false;

    return true;
  }
}

/**
 * Vehicle state during route execution.
 */
export interface VehicleState {
  vehicleId: number;
  currentLocation: number | null;
  currentNodeType: 'depot' | 'delivery' | 'pickup' | 'hub' | null;
  currentLoad: number;
  loadByType: Map<ResourceType, number>;
  arrivedAtTime: number;
  isWaiting: boolean;
  waitReason: 'resource' | 'transfer' | 'timeWindow' | 'none';
}

/**
 * Manages a fleet of vehicles with different capabilities.
 */
export class VehicleFleetManager {
  private readonly vehicles: Map<number, VehicleWithCapabilities> = new Map();
  private readonly states: Map<number, VehicleState> = new Map();

  constructor(vehicles: VehicleWithCapabilities[] = []) {
    for (const vehicle of vehicles) {
      this.addVehicle(vehicle);
    }
  }

  addVehicle(vehicle: VehicleWithCapabilities): void {
    this.vehicles.set(vehicle.id, vehicle);
    this.states.set(vehicle.id, {
      vehicleId: vehicle.id,
      currentLocation: null,
      currentNodeType: null,
      currentLoad: 0,
      loadByType: new Map(),
      arrivedAtTime: 0,
      isWaiting: false,
      waitReason: 'none',
    });
  }

  getVehicle(vehicleId: number): VehicleWithCapabilities | undefined {
    return this.vehicles.get(vehicleId);
  }

  getVehicleState(vehicleId: number): VehicleState | undefined {
    return this.states.get(vehicleId);
  }

  /**
   * @param vehicleId - Vehicle to update
   * @param nodeId - Node the vehicle just visited
   * @param nodeType - Type of node visited
   * @param arrivalTime - Time of arrival at the node
   * @param loadChange - Change in load (+ for pickup, - for delivery)
   * @param resourceType - Type of resource being loaded or unloaded
   */
  updateVehicleState(
    vehicleId: number,
    nodeId: number,
    nodeType: 'depot' | 'delivery' | 'pickup' | 'hub',
    arrivalTime: number,
    loadChange: number,
    resourceType: ResourceType = 'standard',
  ): void {
    const state = this.states.get(vehicleId);
    if (!state) return;

    const vehicle = this.vehicles.get(vehicleId);
    if (!vehicle) return;

    state.currentLocation = nodeId;
    state.currentNodeType = nodeType;
    state.arrivedAtTime = arrivalTime;
    state.currentLoad += loadChange;

    // Update load by type
    const currentTypeLoad = state.loadByType.get(resourceType) || 0;
    state.loadByType.set(resourceType, currentTypeLoad + loadChange);

    // Validate capacity
    if (state.currentLoad < 0 || state.currentLoad > vehicle.capacity) {
      throw new Error(
        `Vehicle ${vehicleId} capacity violation: ` +
        `load=${state.currentLoad}, capacity=${vehicle.capacity}`,
      );
    }

    this.states.set(vehicleId, state);
  }

  /**
   * @param vehicleId - Vehicle to update
   * @param isWaiting - Whether the vehicle is currently waiting
   * @param reason - Reason for waiting
   */
  setVehicleWaiting(
    vehicleId: number,
    isWaiting: boolean,
    reason: 'resource' | 'transfer' | 'timeWindow' | 'none' = 'none',
  ): void {
    const state = this.states.get(vehicleId);
    if (!state) return;

    state.isWaiting = isWaiting;
    state.waitReason = reason;
    this.states.set(vehicleId, state);
  }

  /**
   * @param type - Resource type to filter by
   * @returns Vehicles capable of transporting the given resource type
   */
  getVehiclesForResourceType(type: ResourceType): VehicleWithCapabilities[] {
    return Array.from(this.vehicles.values()).filter(v => v.canHandleResource(type));
  }

  /**
   * @param hubId - Hub node ID to check
   * @param time - Current time
   * @returns Vehicles present at the hub that are not busy
   */
  getAvailableVehiclesAtHub(hubId: number, time: number): VehicleWithCapabilities[] {
    const available: VehicleWithCapabilities[] = [];
    for (const [id, state] of this.states.entries()) {
      if (
        state.currentLocation === hubId &&
        !state.isWaiting &&
        state.arrivedAtTime <= time
      ) {
        const vehicle = this.vehicles.get(id);
        if (vehicle) available.push(vehicle);
      }
    }
    return available;
  }

  /**
   * @param type - Optional resource type to filter by
   * @returns Sum of capacities across all (matching) vehicles
   */
  getTotalCapacity(type?: ResourceType): number {
    let total = 0;
    for (const vehicle of this.vehicles.values()) {
      if (type && !vehicle.canHandleResource(type)) continue;
      total += vehicle.capacity;
    }
    return total;
  }

  /**
   * @returns Per-vehicle utilization statistics
   */
  getFleetUtilization(): Array<{
    vehicleId: number;
    capacity: number;
    currentLoad: number;
    utilizationRate: number;
    isWaiting: boolean;
  }> {
    const stats: Array<{
      vehicleId: number;
      capacity: number;
      currentLoad: number;
      utilizationRate: number;
      isWaiting: boolean;
    }> = [];

    for (const [id, state] of this.states.entries()) {
      const vehicle = this.vehicles.get(id);
      if (!vehicle) continue;

      stats.push({
        vehicleId: id,
        capacity: vehicle.capacity,
        currentLoad: state.currentLoad,
        utilizationRate: vehicle.capacity > 0 ? state.currentLoad / vehicle.capacity : 0,
        isWaiting: state.isWaiting,
      });
    }

    return stats;
  }

  resetAllStates(): void {
    for (const [id] of this.vehicles.entries()) {
      this.states.set(id, {
        vehicleId: id,
        currentLocation: null,
        currentNodeType: null,
        currentLoad: 0,
        loadByType: new Map(),
        arrivedAtTime: 0,
        isWaiting: false,
        waitReason: 'none',
      });
    }
  }

  getAllVehicles(): readonly VehicleWithCapabilities[] {
    return Array.from(this.vehicles.values());
  }
}
