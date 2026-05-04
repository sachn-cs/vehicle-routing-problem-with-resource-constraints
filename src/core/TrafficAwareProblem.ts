import { Node, Customer, Vehicle, Problem } from './Problem.js';

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

  /**
   * Sets base traffic data for a segment.
   */
  setSegment(segment: TrafficSegment): void {
    const key = this.makeKey(segment.fromId, segment.toId);
    this.segments.set(key, segment);
  }

  /**
   * Sets time-dependent factors for a segment.
   */
  setTimeFactors(fromId: number, toId: number, factors: Array<{ startTime: number; factor: number }>): void {
    const key = this.makeKey(fromId, toId);
    this.timeFactors.set(key, factors);
  }

  private makeKey(fromId: number, toId: number): string {
    return `${fromId}-${toId}`;
  }

  /**
   * Gets travel time between two nodes at a specific departure time.
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

  /**
   * Gets congestion level for a segment.
   */
  getCongestionLevel(fromId: number, toId: number): 'low' | 'medium' | 'high' | 'severe' | undefined {
    const key = this.makeKey(fromId, toId);
    const segment = this.segments.get(key);
    return segment?.congestionLevel;
  }

  /**
   * Updates traffic conditions in real-time.
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
export class TrafficAwareProblem extends Problem {
  constructor(
    nodes: Readonly<Record<number, Node>>,
    customers: ReadonlyArray<Customer>,
    vehicles: ReadonlyArray<Vehicle>,
    depotNodeId: number = 0,
    public readonly trafficModel: TrafficModel = new TrafficModel(),
    public readonly defaultSpeed: number = 1,
  ) {
    super(nodes, customers, vehicles, depotNodeId);
  }

  override getDistance(fromId: number, toId: number): number {
    // Return travel time instead of pure distance
    return this.trafficModel.getTravelTime(fromId, toId, 0);
  }

  override getTravelTime(fromId: number, toId: number, departureTime: number = 0): number {
    return this.trafficModel.getTravelTime(fromId, toId, departureTime);
  }

  /**
   * Initializes traffic model from base distance matrix.
   */
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
   * Applies traffic multiplier to simulate congestion.
   */
  applyTrafficMultiplier(fromId: number, toId: number, multiplier: number): void {
    const baseTime = this.distanceMatrix[fromId]?.[toId] ?? 0;
    this.trafficModel.updateTraffic(fromId, toId, (baseTime / this.defaultSpeed) * multiplier);
  }
}
