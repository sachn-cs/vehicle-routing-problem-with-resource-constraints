/**
 * Represents a transfer of resources between vehicles at a hub node.
 */
export interface ResourceTransfer {
  /** ID of the transfer event */
  id: string;
  /** Hub node where transfer occurs */
  hubNodeId: number;
  /** Time when transfer occurs */
  transferTime: number;
  /** Vehicle giving resources */
  fromVehicleId: number;
  /** Vehicle receiving resources */
  toVehicleId: number;
  /** Amount of resources transferred */
  amount: number;
  /** Resource type (optional, for multi-resource scenarios) */
  resourceType?: string;
}

/**
 * Hub node where vehicles can exchange resources.
 */
export class TransferHub {
  /**
   * @param id - Unique hub identifier
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param name - Optional display name
   * @param maxConcurrentTransfers - Maximum simultaneous transfers allowed
   * @param transferTimePerUnit - Time required to transfer one unit of resource
   */
  constructor(
    public readonly id: number,
    public readonly x: number,
    public readonly y: number,
    public readonly name: string = '',
    public readonly maxConcurrentTransfers: number = 1,
    public readonly transferTimePerUnit: number = 1,
  ) {}
}

/**
 * Manages resource transfers between vehicles.
 */
export class TransferManager {
  private readonly transfers: Map<string, ResourceTransfer> = new Map();
  private readonly hubs: Map<number, TransferHub> = new Map();
  private readonly vehicleSchedules: Map<
    number,
    Array<{ startTime: number; endTime: number; hubId: number }>
  > = new Map();

  registerHub(hub: TransferHub): void {
    this.hubs.set(hub.id, hub);
  }

  getHub(hubId: number): TransferHub | undefined {
    return this.hubs.get(hubId);
  }

  /**
   * @param transfer - Transfer event to schedule
   * @returns True if the transfer was successfully scheduled without conflicts
   */
  scheduleTransfer(transfer: ResourceTransfer): boolean {
    const hub = this.hubs.get(transfer.hubNodeId);
    if (!hub) return false;

    // Calculate transfer duration
    const transferDuration = transfer.amount * hub.transferTimePerUnit;

    // Check for scheduling conflicts
    const fromVehicleSchedule = this.vehicleSchedules.get(transfer.fromVehicleId) || [];
    const toVehicleSchedule = this.vehicleSchedules.get(transfer.toVehicleId) || [];

    const endTime = transfer.transferTime + transferDuration;

    // Check if either vehicle is busy
    const fromVehicleBusy = fromVehicleSchedule.some(
      s => transfer.transferTime < s.endTime && endTime > s.startTime,
    );
    const toVehicleBusy = toVehicleSchedule.some(
      s => transfer.transferTime < s.endTime && endTime > s.startTime,
    );

    if (fromVehicleBusy || toVehicleBusy) {
      return false; // Conflict detected
    }

    // Check hub concurrency limit
    const concurrentAtHub = Array.from(this.transfers.values()).filter(t => {
      if (t.hubNodeId !== transfer.hubNodeId) return false;
      const tDuration = t.amount * hub.transferTimePerUnit;
      const tEnd = t.transferTime + tDuration;
      return transfer.transferTime < tEnd && endTime > t.transferTime;
    }).length;
    if (concurrentAtHub >= hub.maxConcurrentTransfers) {
      return false;
    }

    // Schedule the transfer
    this.transfers.set(transfer.id, transfer);

    // Update vehicle schedules
    fromVehicleSchedule.push({
      startTime: transfer.transferTime,
      endTime,
      hubId: transfer.hubNodeId,
    });
    toVehicleSchedule.push({
      startTime: transfer.transferTime,
      endTime,
      hubId: transfer.hubNodeId,
    });

    this.vehicleSchedules.set(transfer.fromVehicleId, fromVehicleSchedule);
    this.vehicleSchedules.set(transfer.toVehicleId, toVehicleSchedule);

    return true;
  }

  getTransfersForHub(hubId: number): ResourceTransfer[] {
    return Array.from(this.transfers.values()).filter(t => t.hubNodeId === hubId);
  }

  getTransfersForVehicle(vehicleId: number): ResourceTransfer[] {
    return Array.from(this.transfers.values()).filter(
      t => t.fromVehicleId === vehicleId || t.toVehicleId === vehicleId,
    );
  }

  /**
   * @param vehicleId - Vehicle to calculate balance for
   * @param resourceType - Optional resource type filter
   * @returns Net resource balance; positive means received, negative means given
   */
  getVehicleNetBalance(vehicleId: number, resourceType?: string): number {
    let balance = 0;
    for (const transfer of this.transfers.values()) {
      if (resourceType && transfer.resourceType !== resourceType) continue;

      if (transfer.fromVehicleId === vehicleId) {
        balance -= transfer.amount;
      } else if (transfer.toVehicleId === vehicleId) {
        balance += transfer.amount;
      }
    }
    return balance;
  }

  isVehicleAtHub(vehicleId: number, hubId: number, time: number): boolean {
    const schedule = this.vehicleSchedules.get(vehicleId) || [];
    return schedule.some(s => s.hubId === hubId && s.startTime <= time && s.endTime >= time);
  }

  clearAll(): void {
    this.transfers.clear();
    this.vehicleSchedules.clear();
  }

  getAllTransfers(): readonly ResourceTransfer[] {
    return Array.from(this.transfers.values());
  }

  getAllHubs(): readonly TransferHub[] {
    return Array.from(this.hubs.values());
  }
}
