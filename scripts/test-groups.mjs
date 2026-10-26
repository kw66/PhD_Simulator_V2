import fs from 'node:fs';

// Every test belongs to exactly one group. Browser tests must stay serialized
// within a runner; CI distributes them across independent shards instead.
const longTests = new Set(['v2-release-lifecycle.test.ts', 'v2-official-replays.test.ts']);
export function discoverTestGroups() {
  const groups = { unit: [], browser: [], long: [] };
  for (const name of fs.readdirSync(new URL('../tests/', import.meta.url)).sort()) {
    if (!/^v2-.*\.test\.ts$/.test(name)) continue;
    const source = fs.readFileSync(new URL(`../tests/${name}`, import.meta.url), 'utf8');
    const group = longTests.has(name) ? 'long' : /(?:from\s*|import\s*\()\s*['"](?:@playwright\/test|playwright(?:\/[^'"]*)?)['"]/.test(source) ? 'browser' : 'unit';
    groups[group].push(`tests/${name}`);
  }
  return groups;
}
