import type { LocationNode, Customer, Vehicle } from './problem.js';
import { VrpProblem } from './problem.js';

/**
 * Traffic data for a road segment between two nodes.
 */
export interface TrafficSegment {
  fromId: number;
  toId: number;
  baseTravelTime: number;
  currentTravelTime: number;
  congestionLevel: 'low' | 'medium' | 'high' | 'severe';
}

/**
 * Time-dependent traffic model.
 * Allows travel times to vary based on departure time.
 */
export class TrafficModel {
  private readonly segments: Map<string, TrafficSegment> = new Map();
  private readonly timeFactors: Map<string, Array<{ startTime: number; factor: number }>> =
    new Map();

  setSegment(segment: TrafficSegment): void {
    const key = this.makeKey(segment.fromId, segment.toId);
    this.segments.set(key, segment);
  }

  setTimeFactors(
    fromId: number,
    toId: number,
    factors: Array<{ startTime: number; factor: number }>,
  ): void {
    const key = this.makeKey(fromId, toId);
    this.timeFactors.set(key, factors);
  }

  private makeKey(fromId: number, toId: number): string {
    return `${fromId}-${toId}`;
  }

  /**
   * @param fromId - Origin node ID
   * @param toId - Destination node ID
   * @param departureTime - Time of departure
   * @returns Travel time adjusted for traffic conditions
   */
  getTravelTime(fromId: number, toId: number, departureTime: number = 0): number {
    const key = this.makeKey(fromId, toId);
    const segment = this.segments.get(key);

    if (!segment) {
      // Fall back to Euclidean distance if no traffic data
      return 0;
    }

    // Apply time-dependent factor if available
    const factors = this.timeFactors.get(key);
    if (factors) {
      for (let i = factors.length - 1; i >= 0; i--) {
        const factor = factors[i];
        if (factor && departureTime >= factor.startTime) {
          return segment.baseTravelTime * factor.factor;
        }
      }
    }

    return segment.currentTravelTime;
  }

  getCongestionLevel(
    fromId: number,
    toId: number,
  ): 'low' | 'medium' | 'high' | 'severe' | undefined {
    const key = this.makeKey(fromId, toId);
    const segment = this.segments.get(key);
    return segment?.congestionLevel;
  }

  /**
   * @param fromId - Origin node ID
   * @param toId - Destination node ID
   * @param newTravelTime - Updated travel time for the segment
   */
  updateTraffic(fromId: number, toId: number, newTravelTime: number): void {
    const key = this.makeKey(fromId, toId);
    const segment = this.segments.get(key);
    if (segment) {
      segment.currentTravelTime = newTravelTime;
      // Update congestion level based on ratio
      const ratio = newTravelTime / segment.baseTravelTime;
      if (ratio < 1.2) segment.congestionLevel = 'low';
      else if (ratio < 1.5) segment.congestionLevel = 'medium';
      else if (ratio < 2.0) segment.congestionLevel = 'high';
      else segment.congestionLevel = 'severe';
    }
  }
}

/**
 * Traffic-aware problem instance.
 * Extends base Problem with real-time traffic data.
 */
export class TrafficAwareProblem extends VrpProblem {
  /**
   * @param nodes - Available nodes by ID
   * @param customers - Customers to serve
   * @param vehicles - Fleet vehicles
   * @param depotNodeId - Default depot node
   * @param trafficModel - Traffic conditions model
   * @param defaultSpeed - Baseline vehicle speed
   */
  constructor(
    nodes: Readonly<Record<number, LocationNode>>,
    customers: ReadonlyArray<Customer>,
    vehicles: ReadonlyArray<Vehicle>,
    depotNodeId: number = 0,
    public readonly trafficModel: TrafficModel = new TrafficModel(),
    public readonly defaultSpeed: number = 1,
  ) {
    super(nodes, customers, vehicles, depotNodeId);
  }

  override getTravelTime(fromId: number, toId: number, departureTime: number = 0): number {
    return this.trafficModel.getTravelTime(fromId, toId, departureTime);
  }

  initializeTrafficFromDistances(): void {
    const nodeIds = Object.keys(this.nodes).map(Number);
    for (const fromId of nodeIds) {
      for (const toId of nodeIds) {
        if (fromId !== toId) {
          const baseTime = this.distanceMatrix[fromId]?.[toId] ?? 0;
          this.trafficModel.setSegment({
            fromId,
            toId,
            baseTravelTime: baseTime / this.defaultSpeed,
            currentTravelTime: baseTime / this.defaultSpeed,
            congestionLevel: 'low',
          });
        }
      }
    }
  }

  /**
   * @param fromId - Origin node ID
   * @param toId - Destination node ID
   * @param multiplier - Factor to apply to base travel time
   */
  applyTrafficMultiplier(fromId: number, toId: number, multiplier: number): void {
    const baseTime = this.distanceMatrix[fromId]?.[toId] ?? 0;
    this.trafficModel.updateTraffic(fromId, toId, (baseTime / this.defaultSpeed) * multiplier);
  }
}
