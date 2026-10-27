// Publish complete, reproducible runs played with the current game rules.
// Input is a JSON array of paths to captured .phdreplay.json recordings.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { createServer } from 'vite';
import { auditTeachingReplay } from './autoplay/quality.mjs';

const paths = JSON.parse(await readFile(process.argv[2], 'utf8'));
const server = await createServer({ configFile: false, logLevel: 'error', server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
try {
  const E = Object.assign({}, ...await Promise.all(['v2-local-replay', 'v2-run-replay', 'v2-role-talent-definitions', 'v2-rule-context', 'v2-engine', 'v2-paper-rules', 'v2-conference-catalog', 'v2-review-config', 'v2-monthly-effects', 'v2-role-talent-state'].map(name => server.ssrLoadModule('/src/core/' + name + '.ts'))));
  const { deriveReplayResults } = await server.ssrLoadModule('/src/app/v2-replay-results.ts');
  const published = [];
  const ids = new Set();
  for (const path of paths) {
    const source = E.parseReplayRecording(await readFile(path, 'utf8'));
    const final = await E.verifyReplayRecording(source, { yieldControl: async () => {} });
    assert.equal(source.replay.ruleset, E.CURRENT_GAMEPLAY_RULESET, path);
    assert.equal(final.phase, 'finished', path);
    assert.ok(['master', 'phd'].includes(final.ending), path);
    assert.equal(final.degree, final.ending);
    const teachingAudit = auditTeachingReplay(E, source);
    assert.equal(teachingAudit.finalDigest, source.finalDigest, path);
    assert.ok(teachingAudit.passed, `${path}: teaching quality rejected: ${JSON.stringify(teachingAudit.issues)}`);
    assert.deepEqual(source.replay.initial, { ...E.createInitialState(), randomState: source.replay.initial.randomState }, path);
    const start = source.replay.commands[0];
    const role = start.payload.roleId;
    const talents = start.payload.talentAllocation ?? {};
    assert.equal(start.payload.bonusTalentPoints ?? 0, 0, path);
    const spent = E.getDesignedTalentNodes(role).reduce((n, node) => n + node.cost * (talents[node.id] ?? 0), 0);
    assert.ok([0, 10].includes(spent), path);
    assert.deepEqual(E.sanitizeRoleTalentAllocation(role, spent === 20 ? 10 : 0, talents, 0), talents, path);
    assert.ok(spent === 10 || final.degree === 'phd', path);
    const route = final.degree + '-' + spent;
    const id = 'official-' + role + '-' + route;
    assert.ok(!ids.has(id), id); ids.add(id);
    // Remove policy attempts that had no effect, preserving every real action.
    let state = structuredClone(source.replay.initial);
    const commands = [];
    for (const command of source.replay.commands) {
      assert.equal(command.ruleset ?? source.replay.ruleset, E.CURRENT_GAMEPLAY_RULESET);
      assert.ok(command.kind === 'action' && !command.actionId.startsWith('debug-'));
      const next = E.executeReplayCommand(state, command, source.replay.ruleset);
      if (JSON.stringify(state) !== JSON.stringify(next)) commands.push(command);
      state = next;
    }
    assert.equal(E.replayStateDigest(state), source.finalDigest);
    const recording = { ...source, id, replay: { ...source.replay, commands, checkpoints: [{ index: commands.length, digest: source.finalDigest, totalMonths: final.totalMonths }] } };
    await E.verifyReplayRecording(recording, { yieldControl: async () => {} });
    const { researchScore: score, ...metrics } = deriveReplayResults(final);
    const file = role + '-' + route + '.json';
    published.push({ recording, definition: { id, file, roleId: role, route, note: '', totalMonths: final.totalMonths, degree: final.degree, score, commands: commands.length, ruleset: source.replay.ruleset, finalDigest: source.finalDigest, metrics } });
    console.log(JSON.stringify({ id, score, commands: commands.length, removedNoOps: source.replay.commands.length - commands.length }));
  }
  // Verify all inputs before replacing the public library.
  const directory = 'public/official-replays';
  await mkdir(directory, { recursive: true });
  for (const name of await readdir(directory)) if (name.endsWith('.json') && !published.some(x => x.definition.file === name)) await unlink(directory + '/' + name);
  for (const { recording, definition } of published) await writeFile(directory + '/' + definition.file, E.serializeReplayRecording(recording));
  await writeFile('src/app/v2-official-replay-manifest.json', JSON.stringify(published.map(x => x.definition), null, 2));
} finally { await server.close(); }
