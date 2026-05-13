import { Solution, Route } from './Solution.js';
import { Problem } from './Problem.js';
import type { Customer, Node } from './Problem.js';
import { TransferManager, TransferHub } from './ResourceTransfer.js';
import type { ResourceTransfer } from './ResourceTransfer.js';
import { VehicleWithCapabilities, VehicleFleetManager } from './VehicleWithCapabilities.js';

/**
 * Extended solution with inter-vehicle resource transfers.
 */
export class SolutionWithTransfers extends Solution {
  public readonly transferManager: TransferManager;
  public readonly fleetManager: VehicleFleetManager;
  public transfers: ResourceTransfer[] = [];

  /**
   * @param problem - Base problem instance
   * @param routes - Initial vehicle routes
   * @param transferHubs - Hubs where vehicles can exchange resources
   * @param vehicles - Fleet vehicles with transfer capabilities
   */
  constructor(
    problem: Problem,
    routes: Route[] = [],
    transferHubs: TransferHub[] = [],
    vehicles: VehicleWithCapabilities[] = [],
  ) {
    super(problem, routes);

    this.transferManager = new TransferManager();
    this.fleetManager = new VehicleFleetManager(
      vehicles.length > 0 ? vehicles : problem.vehicles as VehicleWithCapabilities[],
    );

    // Register transfer hubs
    for (const hub of transferHubs) {
      this.transferManager.registerHub(hub);
    }
  }

  /**
   * @param hubNodeId - Hub where the transfer occurs
   * @param fromVehicleId - Vehicle giving resources
   * @param toVehicleId - Vehicle receiving resources
   * @param amount - Quantity to transfer
   * @param transferTime - Scheduled start time
   * @param resourceType - Optional resource category
   * @returns True if the transfer was successfully scheduled
   */
  scheduleTransfer(
    hubNodeId: number,
    fromVehicleId: number,
    toVehicleId: number,
    amount: number,
    transferTime: number,
    resourceType?: string,
  ): boolean {
    const transfer: ResourceTransfer = {
      id: `transfer-${fromVehicleId}-${toVehicleId}-${hubNodeId}-${transferTime}`,
      hubNodeId,
      transferTime,
      fromVehicleId,
      toVehicleId,
      amount,
      resourceType,
    };

    const success = this.transferManager.scheduleTransfer(transfer);
    if (success) {
      this.transfers.push(transfer);
    }
    return success;
  }

  /**
   * @returns Validation result with any feasibility errors
   */
  validateTransfers(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const transfer of this.transfers) {
      // Check if hub exists
      const hub = this.transferManager.getHub(transfer.hubNodeId);
      if (!hub) {
        errors.push(`Transfer ${transfer.id}: Hub ${transfer.hubNodeId} not found`);
        continue;
      }

      // Check if vehicles exist
      const fromVehicle = this.fleetManager.getVehicle(transfer.fromVehicleId);
      const toVehicle = this.fleetManager.getVehicle(transfer.toVehicleId);

      if (!fromVehicle) {
        errors.push(`Transfer ${transfer.id}: From vehicle ${transfer.fromVehicleId} not found`);
        continue;
      }

      if (!toVehicle) {
        errors.push(`Transfer ${transfer.id}: To vehicle ${transfer.toVehicleId} not found`);
        continue;
      }

      // Check vehicle compatibility
      if (fromVehicle instanceof VehicleWithCapabilities && toVehicle instanceof VehicleWithCapabilities) {
        if (!fromVehicle.canTransferWith(toVehicle)) {
          errors.push(
            `Transfer ${transfer.id}: Vehicles ${transfer.fromVehicleId} and ${transfer.toVehicleId} cannot transfer`,
          );
        }
      }

      // Check transfer amount
      if (fromVehicle instanceof VehicleWithCapabilities && transfer.amount > fromVehicle.maxTransferAmount) {
        errors.push(
          `Transfer ${transfer.id}: Amount ${transfer.amount} exceeds max transfer ${fromVehicle.maxTransferAmount}`,
        );
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * @returns Total schedule duration including transfer delays
   */
  calculateTotalTimeWithTransfers(): number {
    let maxTime = this.makespan;

    for (const transfer of this.transfers) {
      const hub = this.transferManager.getHub(transfer.hubNodeId);
      if (hub) {
        const transferDuration = transfer.amount * hub.transferTimePerUnit;
        const endTime = transfer.transferTime + transferDuration;
        if (endTime > maxTime) {
          maxTime = endTime;
        }
      }
    }

    return maxTime;
  }

  /**
   * @returns Net resource balance per vehicle from all transfers
   */
  getVehicleResourceBalances(): Array<{
    vehicleId: number;
    netBalance: number;
    receivedFrom: number[];
    givenTo: number[];
  }> {
    const balances: Array<{
      vehicleId: number;
      netBalance: number;
      receivedFrom: number[];
      givenTo: number[];
    }> = [];

    const vehicleIds = new Set<number>();
    for (const transfer of this.transfers) {
      vehicleIds.add(transfer.fromVehicleId);
      vehicleIds.add(transfer.toVehicleId);
    }

    for (const vehicleId of vehicleIds) {
      const receivedFrom: number[] = [];
      const givenTo: number[] = [];
      let netBalance = 0;

      for (const transfer of this.transfers) {
        if (transfer.fromVehicleId === vehicleId) {
          netBalance -= transfer.amount;
          givenTo.push(transfer.toVehicleId);
        } else if (transfer.toVehicleId === vehicleId) {
          netBalance += transfer.amount;
          receivedFrom.push(transfer.fromVehicleId);
        }
      }

      balances.push({
        vehicleId,
        netBalance,
        receivedFrom: [...new Set(receivedFrom)],
        givenTo: [...new Set(givenTo)],
      });
    }

    return balances;
  }

  /**
   * Checks whether a transfer can be scheduled without mutating this solution.
   * Creates a temporary TransferManager with existing transfers and tests the new one.
   */
  canScheduleTransfer(
    hubNodeId: number,
    fromVehicleId: number,
    toVehicleId: number,
    amount: number,
    transferTime: number,
    resourceType?: string,
  ): boolean {
    const tempManager = new TransferManager();
    const hub = this.transferManager.getHub(hubNodeId);
    if (hub) tempManager.registerHub(hub);

    for (const t of this.transfers) {
      tempManager.scheduleTransfer(t);
    }

    const transfer: ResourceTransfer = {
      id: `transfer-${fromVehicleId}-${toVehicleId}-${hubNodeId}-${transferTime}`,
      hubNodeId,
      transferTime,
      fromVehicleId,
      toVehicleId,
      amount,
      resourceType,
    };
    return tempManager.scheduleTransfer(transfer);
  }

  override isFeasible(): boolean {
    const baseFeasible = super.isFeasible();
    const transfersValid = this.validateTransfers();
    return baseFeasible && transfersValid.valid;
  }

  /**
   * @returns Aggregated statistics for all scheduled transfers
   */
  getTransferSummary(): {
    totalTransfers: number;
    totalAmountTransferred: number;
    uniqueHubsUsed: number;
    uniqueVehiclePairs: number;
    totalTransferTime: number;
  } {
    const hubsUsed = new Set<number>();
    const vehiclePairs = new Set<string>();
    let totalAmount = 0;
    let totalTransferTime = 0;

    for (const transfer of this.transfers) {
      hubsUsed.add(transfer.hubNodeId);
      vehiclePairs.add(`${transfer.fromVehicleId}-${transfer.toVehicleId}`);
      totalAmount += transfer.amount;

      const hub = this.transferManager.getHub(transfer.hubNodeId);
      if (hub) {
        totalTransferTime += transfer.amount * hub.transferTimePerUnit;
      }
    }

    return {
      totalTransfers: this.transfers.length,
      totalAmountTransferred: totalAmount,
      uniqueHubsUsed: hubsUsed.size,
      uniqueVehiclePairs: vehiclePairs.size,
      totalTransferTime,
    };
  }

  override clone(): SolutionWithTransfers {
    const cloned = new SolutionWithTransfers(
      this.problem,
      this.routes.map(r => r.clone()),
      [...this.transferManager.getAllHubs()],
      [...this.fleetManager.getAllVehicles()],
    );

    cloned.makespan = this.makespan;
    cloned.nodeTimes = { ...this.nodeTimes };
    cloned.resourceReadyTimes = { ...this.resourceReadyTimes };
    cloned.totalDistance = this.totalDistance;
    cloned.totalCost = this.totalCost;
    cloned.totalCO2 = this.totalCO2;
    cloned.transfers = [...this.transfers];

    return cloned;
  }
}

/**
 * Problem instance with transfer hub support.
 */
export class ProblemWithTransfers extends Problem {
  /**
   * @param nodes - Available nodes by ID
   * @param customers - Customers to serve
   * @param vehicles - Fleet with transfer capabilities
   * @param depotNodeId - Default depot node
   * @param transferHubs - Hubs where vehicles exchange resources
   */
  constructor(
    nodes: Readonly<Record<number, Node>>,
    customers: ReadonlyArray<Customer>,
    vehicles: ReadonlyArray<VehicleWithCapabilities>,
    depotNodeId: number = 0,
    public readonly transferHubs: ReadonlyArray<TransferHub> = [],
  ) {
    super(nodes, customers, vehicles, depotNodeId);
  }

  isTransferHub(nodeId: number): boolean {
    return this.transferHubs.some(h => h.id === nodeId);
  }

  getTransferHub(nodeId: number): TransferHub | undefined {
    return this.transferHubs.find(h => h.id === nodeId);
  }
}
