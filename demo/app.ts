import { VrpRpdSolver, Node, Customer, Vehicle, Problem } from '../src/index.js';

const canvas = document.getElementById('mapCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const solveBtn = document.getElementById('solveBtn') as HTMLButtonElement;
const customerCountInput = document.getElementById('customerCount') as HTMLInputElement;
const vehicleCountInput = document.getElementById('vehicleCount') as HTMLInputElement;
const alnsIterInput = document.getElementById('alnsIter') as HTMLInputElement;
const parallelModeCheckbox = document.getElementById('parallelMode') as HTMLInputElement;
const statusEl = document.getElementById('status')!;
const makespanEl = document.getElementById('makespan')!;
const execTimeEl = document.getElementById('execTime')!;

let currentProblem: Problem | null = null;
let currentSolution: Solution | null = null;

// Resize canvas
function resize(): void {
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  if (currentProblem) draw();
}
window.onresize = resize;
resize();

function generateProblem(): void {
  const cCount = parseInt(customerCountInput.value);
  const vCount = parseInt(vehicleCountInput.value);

  const nodes: Record<number, Node> = {};
  const margin = 100;
  const w = canvas.width - margin * 2;
  const h = canvas.height - margin * 2;

  // Depot
  nodes[0] = new Node(0, margin + w / 2, margin + h / 2, 'Depot');

  const customers: Customer[] = [];
  for (let i = 1; i <= cCount; i++) {
    const dId = i * 2 - 1;
    const pId = i * 2;

    nodes[dId] = new Node(dId, margin + Math.random() * w, margin + Math.random() * h, `D${i}`);
    nodes[pId] = new Node(pId, margin + Math.random() * w, margin + Math.random() * h, `P${i}`);

    const procTime = 50 + Math.random() * 150;
    customers.push(new Customer(i, dId, pId, procTime));
  }

  const vehicles = Array.from({ length: vCount }, (_, i) => new Vehicle(i, 5));

  currentProblem = new Problem(nodes, customers, vehicles, 0);
  currentSolution = null;
  draw();
}

function draw(): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i < canvas.width; i += 50) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, canvas.height);
    ctx.stroke();
  }
  for (let i = 0; i < canvas.height; i += 50) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(canvas.width, i);
    ctx.stroke();
  }

  if (!currentProblem) return;

  // Draw dependency lines (D -> P)
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  for (const c of currentProblem.customers) {
    const d = currentProblem.nodes[c.deliveryNodeId];
    const p = currentProblem.nodes[c.pickupNodeId];
    ctx.beginPath();
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Draw routes if solved
  if (currentSolution) {
    const colors = ['#38bdf8', '#818cf8', '#f472b6', '#fbbf24', '#34d399'];
    currentSolution.routes.forEach((route, i) => {
      const color = colors[i % colors.length];
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();

      let prev = currentProblem.nodes[currentProblem.depotNodeId];
      ctx.moveTo(prev.x, prev.y);

      for (const nodeId of route.nodes) {
        const node = currentProblem.nodes[nodeId];
        ctx.lineTo(node.x, node.y);
        prev = node;
      }

      // Return to depot
      const depot = currentProblem.nodes[currentProblem.depotNodeId];
      ctx.lineTo(depot.x, depot.y);
      ctx.stroke();
    });
  }

  // Draw nodes
  for (const node of Object.values(currentProblem.nodes)) {
    const isDepot = node.id === 0;
    const isDelivery = node.id > 0 && node.id % 2 !== 0;

    ctx.fillStyle = isDepot ? '#fff' : isDelivery ? '#38bdf8' : '#818cf8';
    ctx.beginPath();
    ctx.arc(node.x, node.y, isDepot ? 8 : 5, 0, Math.PI * 2);
    ctx.fill();

    // Glow effect
    ctx.shadowBlur = 15;
    ctx.shadowColor = ctx.fillStyle;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

solveBtn.onclick = async (): Promise<void> => {
  if (!currentProblem) generateProblem();

  statusEl.innerText = 'Solving...';
  solveBtn.disabled = true;

  const startTime = performance.now();
  const solver = new VrpRpdSolver(currentProblem);
  const parallel = parallelModeCheckbox.checked;

  const solution = await solver.solve({
    alnsIterations: parseInt(alnsIterInput.value),
    parallel,
  });
  const endTime = performance.now();

  currentSolution = solution;
  statusEl.innerText = 'Finished';
  makespanEl.innerText = solution.makespan.toFixed(2);
  execTimeEl.innerText = `${Math.round(endTime - startTime)}ms`;
  solveBtn.disabled = false;

  draw();
};

customerCountInput.oninput = (): void => {
  document.getElementById('customerCountVal')!.innerText = customerCountInput.value;
  generateProblem();
};
vehicleCountInput.oninput = (): void => {
  document.getElementById('vehicleCountVal')!.innerText = vehicleCountInput.value;
  generateProblem();
};

// Initial problem
generateProblem();
