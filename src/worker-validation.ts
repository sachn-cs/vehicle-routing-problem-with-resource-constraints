export interface WorkerData {
  nodes: Record<number, { id: number; x: number; y: number; name: string }>;
  customers: Array<{
    id: number;
    deliveryNodeId: number;
    pickupNodeId: number;
    processingTime: number;
  }>;
  vehicles: Array<{ id: number; capacity: number }>;
  depotNodeId: number;
  type: 'ALNS' | 'BRKGA' | 'island-brkga';
  options: Record<string, unknown>;
  islandId?: number;
}

export interface WorkerResult {
  makespan: number;
  routes: Array<{ vehicleId: number; nodes: number[] }>;
  type: string;
}

export function isWorkerData(value: unknown): value is WorkerData {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'nodes' in value && typeof value.nodes === 'object' && value.nodes !== null &&
    'customers' in value && Array.isArray(value.customers) &&
    'vehicles' in value && Array.isArray(value.vehicles) &&
    'depotNodeId' in value && typeof value.depotNodeId === 'number' &&
    'type' in value && typeof value.type === 'string' &&
    (value.type === 'ALNS' || value.type === 'BRKGA' || value.type === 'island-brkga') &&
    'options' in value && typeof value.options === 'object' && value.options !== null
  );
}

export function validateWorkerData(data: WorkerData): string | null {
  const nodeIds = Object.keys(data.nodes).map(Number);
  if (nodeIds.length === 0) return 'nodes cannot be empty';

  for (const id of nodeIds) {
    const node = data.nodes[id];
    if (!node) return `node ${id} is missing`;
    if (typeof node.id !== 'number') return `node ${id}: id must be a number`;
    if (typeof node.x !== 'number' || !Number.isFinite(node.x)) {
      return `node ${id}: x must be a finite number`;
    }
    if (typeof node.y !== 'number' || !Number.isFinite(node.y)) {
      return `node ${id}: y must be a finite number`;
    }
  }

  if (data.customers.length === 0) return 'customers cannot be empty';
  const customerIds = new Set<number>();
  for (const c of data.customers) {
    if (customerIds.has(c.id)) return `duplicate customer ID: ${c.id}`;
    customerIds.add(c.id);
    if (!data.nodes[c.deliveryNodeId]) {
      return `customer ${c.id}: deliveryNodeId ${c.deliveryNodeId} not found in nodes`;
    }
    if (!data.nodes[c.pickupNodeId]) {
      return `customer ${c.id}: pickupNodeId ${c.pickupNodeId} not found in nodes`;
    }
    if (typeof c.processingTime !== 'number' || c.processingTime < 0) {
      return `customer ${c.id}: processingTime must be >= 0`;
    }
  }

  if (data.vehicles.length === 0) return 'vehicles cannot be empty';
  const vehicleIds = new Set<number>();
  for (const v of data.vehicles) {
    if (vehicleIds.has(v.id)) return `duplicate vehicle ID: ${v.id}`;
    vehicleIds.add(v.id);
    if (typeof v.capacity !== 'number' || v.capacity <= 0) {
      return `vehicle ${v.id}: capacity must be > 0`;
    }
  }

  if (!data.nodes[data.depotNodeId]) return `depotNodeId ${data.depotNodeId} not found in nodes`;

  if (data.type === 'island-brkga') {
    if (
      typeof data.islandId !== 'number' || data.islandId < 0 ||
      !Number.isInteger(data.islandId)
    ) {
      return 'islandId must be a non-negative integer';
    }
    const islandPopulationSize = data.options['islandPopulationSize'];
    if (
      typeof islandPopulationSize !== 'number' || islandPopulationSize < 1 ||
      !Number.isInteger(islandPopulationSize)
    ) {
      return 'islandPopulationSize must be a positive integer';
    }
    const islandMaxGenerations = data.options['islandMaxGenerations'];
    if (
      typeof islandMaxGenerations !== 'number' || islandMaxGenerations < 1 ||
      !Number.isInteger(islandMaxGenerations)
    ) {
      return 'islandMaxGenerations must be a positive integer';
    }
    const migrationInterval = data.options['migrationInterval'];
    if (
      typeof migrationInterval !== 'number' || migrationInterval < 1 ||
      !Number.isInteger(migrationInterval)
    ) {
      return 'migrationInterval must be a positive integer';
    }
  }

  return null;
}
