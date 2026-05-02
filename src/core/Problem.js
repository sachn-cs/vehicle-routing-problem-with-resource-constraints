/**
 * Represents a coordinate or location in the VRP problem.
 */
export class Node {
  constructor(id, x, y, name = '') {
    this.id = id;
    this.x = x;
    this.y = y;
    this.name = name;
  }
}

/**
 * Represents a customer with a delivery and a pickup requirement.
 * In VRP-RPD, the resource is delivered to D_c, processed for p_c, and then picked up at P_c.
 */
export class Customer {
  constructor(id, deliveryNodeId, pickupNodeId, processingTime) {
    this.id = id;
    this.deliveryNodeId = deliveryNodeId;
    this.pickupNodeId = pickupNodeId;
    this.processingTime = processingTime;
  }
}

/**
 * Represents a vehicle with a specific capacity.
 */
export class Vehicle {
  constructor(id, capacity) {
    this.id = id;
    this.capacity = capacity;
  }
}

/**
 * Main problem instance.
 */
export class Problem {
  constructor(nodes, customers, vehicles, depotNodeId) {
    this.nodes = nodes; // Map: id -> Node
    this.customers = customers; // Array of Customer
    this.vehicles = vehicles; // Array of Vehicle
    this.depotNodeId = depotNodeId;
    this.distanceMatrix = this.calculateDistanceMatrix();
  }

  calculateDistanceMatrix() {
    const matrix = {};
    const nodeIds = Object.keys(this.nodes);
    for (const i of nodeIds) {
      matrix[i] = {};
      for (const j of nodeIds) {
        const n1 = this.nodes[i];
        const n2 = this.nodes[j];
        matrix[i][j] = Math.sqrt(Math.pow(n1.x - n2.x, 2) + Math.pow(n1.y - n2.y, 2));
      }
    }
    return matrix;
  }

  getDistance(fromId, toId) {
    return this.distanceMatrix[fromId][toId];
  }
}
