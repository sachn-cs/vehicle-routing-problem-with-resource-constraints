import { Problem, Node, Customer, Vehicle } from '../src/core/Problem.js';
import { GISExporter } from '../src/export/GISExporter.js';
import { Solution, Route } from '../src/core/Solution.js';
import { isWorkerData, validateWorkerData } from '../src/workerValidation.js';

describe('Security S1 - KML XML escaping', () => {
  test('escapeXml helper escapes all XML entities', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 10)];
    const problem = new Problem(nodes, customers, vehicles, 0);
    const solution = new Solution(problem, [new Route(1, [1, 2])]);
    solution.calculateSchedule();

    const exporter = new GISExporter(solution, problem);
    const escapeXml = (exporter as any).escapeXml.bind(exporter);

    expect(escapeXml('foo < bar')).toBe('foo &lt; bar');
    expect(escapeXml('foo > bar')).toBe('foo &gt; bar');
    expect(escapeXml('foo & bar')).toBe('foo &amp; bar');
    expect(escapeXml('foo " bar')).toBe('foo &quot; bar');
    expect(escapeXml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
  });

  test('KML output does not contain raw angle brackets inside text nodes', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 10)];
    const problem = new Problem(nodes, customers, vehicles, 0);
    const solution = new Solution(problem, [new Route(1, [1, 2])]);
    solution.calculateSchedule();

    const exporter = new GISExporter(solution, problem);
    const kml = exporter.toKML();

    // The content between <name> and </name> should not contain unescaped < or >
    const nameMatches = kml.match(/<name>(.*?)<\/name>/g);
    expect(nameMatches).toBeDefined();
    for (const match of nameMatches!) {
      const inner = match.replace(/<name>/, '').replace(/<\/name>/, '');
      expect(inner).not.toContain('<');
      expect(inner).not.toContain('>');
    }

    const descMatches = kml.match(/<description>(.*?)<\/description>/g);
    expect(descMatches).toBeDefined();
    for (const match of descMatches!) {
      const inner = match.replace(/<description>/, '').replace(/<\/description>/, '');
      expect(inner).not.toContain('<');
      expect(inner).not.toContain('>');
    }
  });
});

describe('Security S2 - CSV escaping', () => {
  test('escapeCsv wraps values containing commas in quotes', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
    };
    const problem = new Problem(nodes, [new Customer(1, 1, 2, 50)], [new Vehicle(1, 10)], 0);
    const solution = new Solution(problem, [new Route(1, [1, 2])]);
    solution.calculateSchedule();

    const exporter = new GISExporter(solution, problem);
    const escapeCsv = (exporter as any).escapeCsv.bind(exporter);

    expect(escapeCsv('hello, world')).toBe('"hello, world"');
  });

  test('escapeCsv doubles inner quotes', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
    };
    const problem = new Problem(nodes, [new Customer(1, 1, 2, 50)], [new Vehicle(1, 10)], 0);
    const solution = new Solution(problem, [new Route(1, [1, 2])]);
    solution.calculateSchedule();

    const exporter = new GISExporter(solution, problem);
    const escapeCsv = (exporter as any).escapeCsv.bind(exporter);

    expect(escapeCsv('say "hello"')).toBe('"say ""hello"""');
  });

  test('escapeCsv handles newlines', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
    };
    const problem = new Problem(nodes, [new Customer(1, 1, 2, 50)], [new Vehicle(1, 10)], 0);
    const solution = new Solution(problem, [new Route(1, [1, 2])]);
    solution.calculateSchedule();

    const exporter = new GISExporter(solution, problem);
    const escapeCsv = (exporter as any).escapeCsv.bind(exporter);

    expect(escapeCsv('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsv('line1\rline2')).toBe('"line1\rline2"');
  });

  test('CSV output remains parseable with special characters', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot, Main'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 10)];
    const problem = new Problem(nodes, customers, vehicles, 0);
    const solution = new Solution(problem, [new Route(1, [1, 2])]);
    solution.calculateSchedule();

    const exporter = new GISExporter(solution, problem);
    const csv = exporter.toCSV();

    const lines = csv.split('\n').filter(l => l.trim().length > 0);
    for (const line of lines) {
      const cols = line.split(',');
      // With proper escaping, the depot name should not inflate column count
      expect(cols.length).toBe(8);
    }
  });
});

describe('Security S3 - Problem constructor validation', () => {
  test('rejects empty nodes', () => {
    expect(() => new Problem({}, [new Customer(1, 1, 2, 50)], [new Vehicle(1, 10)], 0)).toThrow('nodes cannot be empty');
  });

  test('rejects empty customers', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
    };
    expect(() => new Problem(nodes, [], [new Vehicle(1, 10)], 0)).toThrow('customers cannot be empty');
  });

  test('rejects empty vehicles', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
    };
    expect(() => new Problem(nodes, [new Customer(1, 1, 2, 50)], [], 0)).toThrow('vehicles cannot be empty');
  });

  test('rejects NaN coordinates', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, NaN, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
    };
    expect(() => new Problem(nodes, [new Customer(1, 1, 2, 50)], [new Vehicle(1, 10)], 0)).toThrow('invalid coordinates');
  });

  test('rejects Infinity coordinates', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, Infinity, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
    };
    expect(() => new Problem(nodes, [new Customer(1, 1, 2, 50)], [new Vehicle(1, 10)], 0)).toThrow('invalid coordinates');
  });

  test('rejects negative coordinates', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, -10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
    };
    expect(() => new Problem(nodes, [new Customer(1, 1, 2, 50)], [new Vehicle(1, 10)], 0)).toThrow('negative coordinates');
  });

  test('rejects duplicate customer IDs', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
    };
    expect(() =>
      new Problem(
        nodes,
        [new Customer(1, 1, 2, 50), new Customer(1, 1, 2, 50)],
        [new Vehicle(1, 10)],
        0,
      ),
    ).toThrow('Duplicate customer ID');
  });

  test('rejects duplicate vehicle IDs', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
    };
    expect(() =>
      new Problem(
        nodes,
        [new Customer(1, 1, 2, 50)],
        [new Vehicle(1, 10), new Vehicle(1, 10)],
        0,
      ),
    ).toThrow('Duplicate vehicle ID');
  });

  test('rejects customer referencing non-existent delivery node', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
    };
    expect(() =>
      new Problem(nodes, [new Customer(1, 999, 2, 50)], [new Vehicle(1, 10)], 0),
    ).toThrow('non-existent delivery node');
  });

  test('rejects customer referencing non-existent pickup node', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
    };
    expect(() =>
      new Problem(nodes, [new Customer(1, 1, 999, 50)], [new Vehicle(1, 10)], 0),
    ).toThrow('non-existent pickup node');
  });

  test('rejects depot node ID not present in nodes', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
    };
    expect(() =>
      new Problem(nodes, [new Customer(1, 1, 2, 50)], [new Vehicle(1, 10)], 999),
    ).toThrow('Depot node 999 does not exist');
  });

  test('rejects negative processing time', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
    };
    expect(() =>
      new Problem(nodes, [new Customer(1, 1, 2, -1)], [new Vehicle(1, 10)], 0),
    ).toThrow('negative processingTime');
  });

  test('rejects zero or negative capacity', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
    };
    expect(() =>
      new Problem(nodes, [new Customer(1, 1, 2, 50)], [new Vehicle(1, 0)], 0),
    ).toThrow('positive capacity');
    expect(() =>
      new Problem(nodes, [new Customer(1, 1, 2, 50)], [new Vehicle(1, -5)], 0),
    ).toThrow('positive capacity');
  });
});

describe('Security S4 - Worker data validation', () => {
  test('isWorkerData rejects non-object input', () => {
    expect(isWorkerData(null)).toBe(false);
    expect(isWorkerData(undefined)).toBe(false);
    expect(isWorkerData('string')).toBe(false);
    expect(isWorkerData(42)).toBe(false);
    expect(isWorkerData([])).toBe(false);
  });

  test('isWorkerData rejects missing fields', () => {
    expect(isWorkerData({})).toBe(false);
    expect(isWorkerData({ nodes: {}, customers: [] })).toBe(false);
    expect(isWorkerData({ nodes: {}, customers: [], vehicles: [], depotNodeId: 0 })).toBe(false);
  });

  test('isWorkerData rejects invalid algorithm type', () => {
    expect(
      isWorkerData({
        nodes: { 0: { id: 0, x: 0, y: 0, name: 'Depot' } },
        customers: [],
        vehicles: [],
        depotNodeId: 0,
        type: 'INVALID',
        options: {},
      }),
    ).toBe(false);
  });

  test('isWorkerData accepts valid ALNS data', () => {
    expect(
      isWorkerData({
        nodes: { 0: { id: 0, x: 0, y: 0, name: 'Depot' } },
        customers: [{ id: 1, deliveryNodeId: 0, pickupNodeId: 0, processingTime: 0 }],
        vehicles: [{ id: 1, capacity: 10 }],
        depotNodeId: 0,
        type: 'ALNS',
        options: {},
      }),
    ).toBe(true);
  });

  test('validateWorkerData rejects empty nodes', () => {
    const error = validateWorkerData({
      nodes: {},
      customers: [{ id: 1, deliveryNodeId: 0, pickupNodeId: 0, processingTime: 0 }],
      vehicles: [{ id: 1, capacity: 10 }],
      depotNodeId: 0,
      type: 'ALNS',
      options: {},
    });
    expect(error).toBe('nodes cannot be empty');
  });

  test('validateWorkerData rejects empty customers', () => {
    const error = validateWorkerData({
      nodes: { 0: { id: 0, x: 0, y: 0, name: 'Depot' } },
      customers: [],
      vehicles: [{ id: 1, capacity: 10 }],
      depotNodeId: 0,
      type: 'ALNS',
      options: {},
    });
    expect(error).toBe('customers cannot be empty');
  });

  test('validateWorkerData rejects empty vehicles', () => {
    const error = validateWorkerData({
      nodes: { 0: { id: 0, x: 0, y: 0, name: 'Depot' } },
      customers: [{ id: 1, deliveryNodeId: 0, pickupNodeId: 0, processingTime: 0 }],
      vehicles: [],
      depotNodeId: 0,
      type: 'ALNS',
      options: {},
    });
    expect(error).toBe('vehicles cannot be empty');
  });

  test('validateWorkerData rejects missing node reference in customer', () => {
    const error = validateWorkerData({
      nodes: { 0: { id: 0, x: 0, y: 0, name: 'Depot' } },
      customers: [{ id: 1, deliveryNodeId: 999, pickupNodeId: 0, processingTime: 0 }],
      vehicles: [{ id: 1, capacity: 10 }],
      depotNodeId: 0,
      type: 'ALNS',
      options: {},
    });
    expect(error).toContain('deliveryNodeId 999 not found');
  });

  test('validateWorkerData rejects non-finite node coordinates', () => {
    const error = validateWorkerData({
      nodes: { 0: { id: 0, x: NaN, y: 0, name: 'Depot' } },
      customers: [{ id: 1, deliveryNodeId: 0, pickupNodeId: 0, processingTime: 0 }],
      vehicles: [{ id: 1, capacity: 10 }],
      depotNodeId: 0,
      type: 'ALNS',
      options: {},
    });
    expect(error).toContain('x must be a finite number');
  });

  test('validateWorkerData rejects duplicate customer IDs', () => {
    const error = validateWorkerData({
      nodes: { 0: { id: 0, x: 0, y: 0, name: 'Depot' } },
      customers: [
        { id: 1, deliveryNodeId: 0, pickupNodeId: 0, processingTime: 0 },
        { id: 1, deliveryNodeId: 0, pickupNodeId: 0, processingTime: 0 },
      ],
      vehicles: [{ id: 1, capacity: 10 }],
      depotNodeId: 0,
      type: 'ALNS',
      options: {},
    });
    expect(error).toContain('duplicate customer ID');
  });

  test('validateWorkerData rejects duplicate vehicle IDs', () => {
    const error = validateWorkerData({
      nodes: { 0: { id: 0, x: 0, y: 0, name: 'Depot' } },
      customers: [{ id: 1, deliveryNodeId: 0, pickupNodeId: 0, processingTime: 0 }],
      vehicles: [{ id: 1, capacity: 10 }, { id: 1, capacity: 10 }],
      depotNodeId: 0,
      type: 'ALNS',
      options: {},
    });
    expect(error).toContain('duplicate vehicle ID');
  });

  test('validateWorkerData rejects invalid vehicle capacity', () => {
    const error = validateWorkerData({
      nodes: { 0: { id: 0, x: 0, y: 0, name: 'Depot' } },
      customers: [{ id: 1, deliveryNodeId: 0, pickupNodeId: 0, processingTime: 0 }],
      vehicles: [{ id: 1, capacity: 0 }],
      depotNodeId: 0,
      type: 'ALNS',
      options: {},
    });
    expect(error).toContain('capacity must be > 0');
  });

  test('validateWorkerData rejects missing depot node', () => {
    const error = validateWorkerData({
      nodes: { 0: { id: 0, x: 0, y: 0, name: 'Depot' } },
      customers: [{ id: 1, deliveryNodeId: 0, pickupNodeId: 0, processingTime: 0 }],
      vehicles: [{ id: 1, capacity: 10 }],
      depotNodeId: 999,
      type: 'ALNS',
      options: {},
    });
    expect(error).toContain('depotNodeId 999 not found');
  });

  test('validateWorkerData accepts valid data', () => {
    const error = validateWorkerData({
      nodes: { 0: { id: 0, x: 0, y: 0, name: 'Depot' } },
      customers: [{ id: 1, deliveryNodeId: 0, pickupNodeId: 0, processingTime: 0 }],
      vehicles: [{ id: 1, capacity: 10 }],
      depotNodeId: 0,
      type: 'ALNS',
      options: {},
    });
    expect(error).toBeNull();
  });
});
