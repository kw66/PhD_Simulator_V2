import { readFile, writeFile } from 'node:fs/promises';
import { loadEngine } from './engine.mjs';
import { auditTeachingReplay } from './quality.mjs';
const paths = process.argv.slice(2);
if (!paths.length) throw Error('Usage: node scripts/autoplay/audit.mjs replay.json [...]');
const { E, close } = await loadEngine();
try {
  for (const path of paths) {
    const recording = E.parseReplayRecording(await readFile(path, 'utf8'));
    const report = auditTeachingReplay(E, recording);
    await writeFile(path + '.audit.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ path, passed: report.passed, issues: report.issues,
      draftDecay: report.draftDecay, reviewDecay: report.reviewDecay, transferMonth: report.transferMonth }));
  }
} finally { await close(); }
