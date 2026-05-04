import { Vehicle } from './Problem.js';

/**
 * Types of resources a vehicle can handle.
 */
export type ResourceType = 'standard' | 'refrigerated' | 'hazmat' | 'fragile' | string;

/**
 * Extended vehicle with transfer capabilities and resource types.
 */
export class VehicleWithCapabilities extends Vehicle {
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
   * Checks if this vehicle can handle a specific resource type.
   */
  canHandleResource(type: ResourceType): boolean {
    return this.supportedResourceTypes.includes(type);
  }

  /**
   * Checks if this vehicle can transfer with another vehicle.
   */
  canTransferWith(other: VehicleWithCapabilities): boolean {
    // Check if both vehicles support at least one common resource type
    const commonTypes = this.supportedResourceTypes.filter(t =>
      other.supportedResourceTypes.includes(t),
    );
    if (commonTypes.length === 0) return false;

    // Check transfer capabilities
    if (!this.canReceiveFromVehicle || !other.canGiveToVehicle) return false;
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

  /**
   * Adds a vehicle to the fleet.
   */
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

  /**
   * Gets a vehicle by ID.
   */
  getVehicle(vehicleId: number): VehicleWithCapabilities | undefined {
    return this.vehicles.get(vehicleId);
  }

  /**
   * Gets the current state of a vehicle.
   */
  getVehicleState(vehicleId: number): VehicleState | undefined {
    return this.states.get(vehicleId);
  }

  /**
   * Updates vehicle state after visiting a node.
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
        `Vehicle ${vehicleId} capacity violation: load=${state.currentLoad}, capacity=${vehicle.capacity}`,
      );
    }

    this.states.set(vehicleId, state);
  }

  /**
   * Sets vehicle waiting state.
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
   * Gets all vehicles that can handle a specific resource type.
   */
  getVehiclesForResourceType(type: ResourceType): VehicleWithCapabilities[] {
    return Array.from(this.vehicles.values()).filter(v => v.canHandleResource(type));
  }

  /**
   * Gets available vehicles at a hub (not currently in transfer).
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
   * Gets the total fleet capacity for a resource type.
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
   * Gets utilization statistics for the fleet.
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

  /**
   * Resets all vehicle states.
   */
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
}
