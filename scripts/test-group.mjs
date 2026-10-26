import { spawnSync } from 'node:child_process';
import { discoverTestGroups } from './test-groups.mjs';

const [group, ...args] = process.argv.slice(2);
const groups = discoverTestGroups();
if (group === 'list') {
  console.log(JSON.stringify(Object.fromEntries(Object.entries(groups).map(([key, files]) => [key, { count: files.length, files }])), null, 2));
} else if (!Object.hasOwn(groups, group)) {
  console.error('Usage: node scripts/test-group.mjs unit|browser|long|list [vitest options]');
  process.exitCode = 1;
} else {
  const env = { ...process.env, V2_TEST_GROUP: group };
  const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...args], { stdio: 'inherit', env });
  if (result.error) console.error(result.error);
  process.exitCode = result.status ?? 1;
}
