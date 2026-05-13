const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '..', 'tests');
const files = fs.readdirSync(TEST_DIR).filter(f => f.endsWith('.test.ts'));

for (const file of files) {
  const filepath = path.join(TEST_DIR, file);
  let content = fs.readFileSync(filepath, 'utf-8');

  // Replace test() with it() (Mocha uses it(), not test())
  content = content.replace(/^(\s*)test\(/gm, '$1it(');

  // Deep equality (must come before toBe)
  content = content.replace(/\.toEqual\(/g, '.to.deep.equal(');

  // Property matchers (no arguments)
  content = content.replace(/\.toBeDefined\(\)/g, '.to.exist');
  content = content.replace(/\.toBeNull\(\)/g, '.to.be.null');
  content = content.replace(/\.toBeNaN\(\)/g, '.to.be.NaN');

  // Boolean literals
  content = content.replace(/\.toBe\(true\)/g, '.to.be.true');
  content = content.replace(/\.toBe\(false\)/g, '.to.be.false');

  // Strict equality (remaining .toBe(...))
  content = content.replace(/\.toBe\(/g, '.to.equal(');

  // Instance checks
  content = content.replace(/\.toBeInstanceOf\(/g, '.to.be.an.instanceOf(');

  // Length checks
  content = content.replace(/\.toHaveLength\(/g, '.to.have.lengthOf(');

  // Inclusion checks
  content = content.replace(/\.toContain\(/g, '.to.include(');

  // Regex match
  content = content.replace(/\.toMatch\(/g, '.to.match(');

  // Exception checks
  content = content.replace(/\.toThrow\(/g, '.to.throw(');

  // Comparison matchers
  content = content.replace(/\.toBeGreaterThanOrEqual\(/g, '.to.be.at.least(');
  content = content.replace(/\.toBeLessThanOrEqual\(/g, '.to.be.at.most(');
  content = content.replace(/\.toBeGreaterThan\(/g, '.to.be.greaterThan(');
  content = content.replace(/\.toBeLessThan\(/g, '.to.be.lessThan(');

  // Negation patterns
  content = content.replace(/\.not\.toContain\(/g, '.to.not.include(');
  content = content.replace(/\.not\.toThrow\(/g, '.to.not.throw(');
  content = content.replace(/\.not\.toBe\(/g, '.to.not.equal(');

  fs.writeFileSync(filepath, content, 'utf-8');
  console.log(`Migrated ${file}`);
}

console.log('Done. Manual review required for toBeCloseTo and any remaining edge cases.');
