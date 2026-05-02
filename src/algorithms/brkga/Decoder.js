import { Solution, Route } from '../../core/Solution.js';

export class Decoder {
  constructor(problem) {
    this.problem = problem;
    this.operations = []; // List of { type: 'D'|'P', customerId, nodeId }
    
    this.problem.customers.forEach(c => {
      this.operations.push({ type: 'D', customerId: c.id, nodeId: c.deliveryNodeId });
      this.operations.push({ type: 'P', customerId: c.id, nodeId: c.pickupNodeId });
    });
  }

  /**
   * Decodes a chromosome into a Solution.
   * chromosome: { priorities: float[], preferences: float[] }
   */
  decode(chromosome) {
    const { priorities, preferences } = chromosome;
    
    // Sort operations by priority
    const sortedOps = this.operations.map((op, i) => ({ ...op, priority: priorities[i], pref: preferences[i] }));
    
    const routes = this.problem.vehicles.map(v => new Route(v.id, []));
    const vehicleTimes = new Array(this.problem.vehicles.length).fill(0);
    const vehicleLoads = new Array(this.problem.vehicles.length).fill(0);
    const vehicleLastNodes = new Array(this.problem.vehicles.length).fill(this.problem.depotNodeId);
    
    const scheduled = new Set();
    const deliveryTimes = {}; // customerId -> time
    
    let unscheduledCount = sortedOps.length;
    
    while (unscheduledCount > 0) {
      let bestOp = null;
      let bestPriority = -1;
      
      // Multi-pass: find the highest priority READY operation
      for (const op of sortedOps) {
        if (scheduled.has(`${op.type}_${op.customerId}`)) continue;
        
        let isReady = false;
        if (op.type === 'D') {
          isReady = true;
        } else {
          // Pickup is ready if delivery is scheduled
          if (scheduled.has(`D_${op.customerId}`)) {
            // Check if processing time has passed
            // In a simple decoder, we can just say it's ready, 
            // and the vehicle will wait if needed.
            isReady = true;
          }
        }
        
        if (isReady && op.priority > bestPriority) {
          bestPriority = op.priority;
          bestOp = op;
        }
      }
      
      if (!bestOp) break; // Should not happen if logic is correct
      
      // Assign to vehicle based on preference
      // Map preference [0, 1] to vehicle index
      let vIdx = Math.min(Math.floor(bestOp.pref * this.problem.vehicles.length), this.problem.vehicles.length - 1);
      
      // Check capacity for delivery
      if (bestOp.type === 'D' && vehicleLoads[vIdx] >= this.problem.vehicles[vIdx].capacity) {
        // Find the closest vehicle with capacity
        let found = false;
        for (let i = 0; i < this.problem.vehicles.length; i++) {
          const v = (vIdx + i) % this.problem.vehicles.length;
          if (vehicleLoads[v] < this.problem.vehicles[v].capacity) {
            vIdx = v;
            found = true;
            break;
          }
        }
        if (!found) {
          // This should ideally be handled by the chromosome learning to wait or use other routes
          // For now, we skip or break, but in BRKGA, we want to maintain feasibility.
        }
      }

      const travelTime = this.problem.getDistance(vehicleLastNodes[vIdx], bestOp.nodeId);
      let arrivalTime = vehicleTimes[vIdx] + travelTime;
      
      if (bestOp.type === 'P') {
        const readyTime = deliveryTimes[bestOp.customerId] + this.problem.customers.find(c => c.id === bestOp.customerId).processingTime;
        if (readyTime > arrivalTime) {
          arrivalTime = readyTime;
        }
        vehicleLoads[vIdx]--;
      } else {
        deliveryTimes[bestOp.customerId] = arrivalTime;
        vehicleLoads[vIdx]++;
      }
      
      routes[vIdx].addNode(bestOp.nodeId);
      vehicleTimes[vIdx] = arrivalTime;
      vehicleLastNodes[vIdx] = bestOp.nodeId;
      scheduled.add(`${bestOp.type}_${bestOp.customerId}`);
      unscheduledCount--;
    }
    
    const solution = new Solution(this.problem, routes);
    solution.calculateSchedule();
    return solution;
  }
}
