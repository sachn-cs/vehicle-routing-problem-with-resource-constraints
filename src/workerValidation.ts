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
  type: 'ALNS' | 'BRKGA';
  options: Record<string, number>;
}

export interface WorkerResult {
  makespan: number;
  routes: Array<{ vehicleId: number; nodes: number[] }>;
  type: string;
}

export function isWorkerData(value: unknown): value is WorkerData {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['nodes'] === 'object' &&
    Array.isArray(v['customers']) &&
    Array.isArray(v['vehicles']) &&
    typeof v['depotNodeId'] === 'number' &&
    (v['type'] === 'ALNS' || v['type'] === 'BRKGA') &&
    typeof v['options'] === 'object' &&
    v['options'] !== null
  );
}

export function validateWorkerData(data: WorkerData): string | null {
  const nodeIds = Object.keys(data.nodes).map(Number);
  if (nodeIds.length === 0) return 'nodes cannot be empty';

  for (const id of nodeIds) {
    const node = data.nodes[id];
    if (!node) return `node ${id} is missing`;
    if (typeof node.id !== 'number') return `node ${id}: id must be a number`;
    if (typeof node.x !== 'number' || !Number.isFinite(node.x)) return `node ${id}: x must be a finite number`;
    if (typeof node.y !== 'number' || !Number.isFinite(node.y)) return `node ${id}: y must be a finite number`;
  }

  if (data.customers.length === 0) return 'customers cannot be empty';
  const customerIds = new Set<number>();
  for (const c of data.customers) {
    if (customerIds.has(c.id)) return `duplicate customer ID: ${c.id}`;
    customerIds.add(c.id);
    if (!data.nodes[c.deliveryNodeId]) return `customer ${c.id}: deliveryNodeId ${c.deliveryNodeId} not found in nodes`;
    if (!data.nodes[c.pickupNodeId]) return `customer ${c.id}: pickupNodeId ${c.pickupNodeId} not found in nodes`;
    if (typeof c.processingTime !== 'number' || c.processingTime < 0) return `customer ${c.id}: processingTime must be >= 0`;
  }

  if (data.vehicles.length === 0) return 'vehicles cannot be empty';
  const vehicleIds = new Set<number>();
  for (const v of data.vehicles) {
    if (vehicleIds.has(v.id)) return `duplicate vehicle ID: ${v.id}`;
    vehicleIds.add(v.id);
    if (typeof v.capacity !== 'number' || v.capacity <= 0) return `vehicle ${v.id}: capacity must be > 0`;
  }

  if (!data.nodes[data.depotNodeId]) return `depotNodeId ${data.depotNodeId} not found in nodes`;

  return null;
}
