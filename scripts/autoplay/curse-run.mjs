// Offline policy experiments only. A replay proves legal game actions, not
// account ownership of a difficulty; real progression must use the normal store.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadEngine } from './engine.mjs';
import { auditTeachingReplay } from './quality.mjs';

const roles = ['cursed-frail', 'special-fading-genius', 'special-finite-life', 'cursed-debt'];
const [role = 'cursed-frail', difficultyArg = '1', seedsArg = '317011', outputArg] = process.argv.slice(2);
const difficulty = Number(difficultyArg);
const seeds = seedsArg.split(',').map(Number);
if (!roles.includes(role)) throw new Error(`Role must be one of ${roles.join(', ')}`);
if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 4) throw new Error('Difficulty must be 1–4');
if (!seeds.length || seeds.some(seed => !Number.isInteger(seed) || seed < 1 || seed > 0xffffffff)) {
  throw new Error('Seeds must be comma-separated positive uint32 values');
}
if (new Set(seeds).size !== seeds.length) throw new Error('Duplicate seeds would overwrite attempt evidence');
const directory = resolve(outputArg ?? `artifacts/curse-experiment-${role}-d${difficulty}-${Date.now()}`);
// Refuse overwrites: even failed attempts are retained as evidence.
await mkdir(directory, { recursive: false });
const plannerUrl = process.env.AUTOPLAY_PLANNER
  ? pathToFileURL(resolve(process.env.AUTOPLAY_PLANNER)) : new URL('./planner.mjs', import.meta.url);
const { createPlanner } = await import(plannerUrl.href);
const config = JSON.parse(process.env.AUTOPLAY_CONFIG ?? '{}');
const policyNames = ['planner.mjs', 'estimates.mjs', 'pipeline.mjs', 'quality.mjs', 'relationships.mjs',
  'opportunities.mjs', 'surplus.mjs', 'engine.mjs', 'milestones.mjs'];
const sources = Object.fromEntries(await Promise.all(policyNames.map(async name =>
  [name, await readFile(new URL(name, plannerUrl), 'utf8')])));
sources['selected-entry.mjs'] = await readFile(plannerUrl, 'utf8');
sources['curse-run.mjs'] = await readFile(new URL('./curse-run.mjs', import.meta.url), 'utf8');
const policyDigest = createHash('sha256').update(JSON.stringify(sources)).digest('hex');
await writeFile(`${directory}/policy-snapshot.json`, JSON.stringify({ policyDigest, config, sources }, null, 2));

const { E, close } = await loadEngine();
try {
  for (const seed of seeds) {
    const id = `${role}-d${difficulty}-phd-0-${seed}`;
    const initial = { ...E.createInitialState(), randomState: { seed, cursor: 0 } };
    const payload = { roleId: role, curseDifficulty: difficulty, talentAllocation: {} };
    const start = { kind: 'action', actionId: 'start-game', payload };
    let state = E.executeReplayCommand(initial, start, E.REPLAY_RULESET);
    const started = structuredClone(state);
    const planner = createPlanner(E, { degreeGoal: 'phd', config });
    const commands = [start], decisions = [];
    let failure = null;
    for (let step = 0; step < 2000 && state.phase !== 'finished'; step++) {
      let decision;
      const began = performance.now();
      try { decision = planner.next(state); }
      catch (error) { failure = `Planner exception: ${error.stack ?? error.message}`; break; }
      if (!decision?.action || !decision.reason) { failure = decision?.reason ?? 'Missing decision or rationale'; break; }
      if (decision.action.startsWith('debug-') || ['force-next-month', 'start-game', 'reset-game'].includes(decision.action)) {
        failure = `Forbidden policy action: ${decision.action}`; break;
      }
      const command = { kind: 'action', actionId: decision.action, payload: decision.payload ?? {} };
      const before = state;
      let next;
      try { next = E.executeReplayCommand(before, command, E.REPLAY_RULESET); }
      catch (error) { failure = `Action exception: ${error.stack ?? error.message}`; break; }
      if (next === before || E.replayStateDigest(next) === E.replayStateDigest(before) || next.log[0]?.kind === 'noop') {
        failure = `No-op ${decision.action}: ${next.log[0]?.text ?? ''}`; break;
      }
      state = next;
      commands.push(command);
      decisions.push({ step: commands.length, month: before.totalMonths, action: decision.action,
        payload: command.payload, reason: decision.reason, detail: decision.detail,
        planningMs: Math.round(performance.now() - began), before: before.player, after: state.player,
        researchScore: state.totalResearchScore, curse: state.curseState });
      if (process.env.AUTOPLAY_PROGRESS === '1' && decision.action === 'next-month') {
        console.log(JSON.stringify({ id, month: state.totalMonths, score: state.totalResearchScore,
          player: state.player, curse: state.curseState }));
      }
    }
    if (state.phase !== 'finished' && !failure) failure = 'Action limit exceeded';
    const replay = E.createRunReplay(initial, started, payload);
    replay.commands = commands;
    replay.checkpoints = [{ index: commands.length, digest: E.replayStateDigest(state), totalMonths: state.totalMonths }];
    const recording = E.captureReplayRecording(replay, state, { id: `experiment-${id}` });
    let verified = false, verificationFailure = null, teachingAudit = null;
    try {
      await E.verifyReplayRecording(recording, { yieldControl: async () => {} });
      verified = true;
      teachingAudit = auditTeachingReplay(E, recording, { degreeGoal: 'phd' });
    } catch (error) { verificationFailure = error.stack ?? error.message; }
    const summary = { id, kind: 'offline-policy-experiment', accountProgressionVerified: false,
      role, difficulty, seed, ruleset: E.REPLAY_RULESET, policyDigest,
      ending: state.ending, months: state.totalMonths, score: state.totalResearchScore,
      player: state.player, curse: state.curseState, steps: commands.length, failure, verified, verificationFailure,
      teachingPassed: teachingAudit?.passed ?? false };
    await writeFile(`${directory}/${id}.json`, JSON.stringify({ summary, config, decisions, teachingAudit, state }, null, 2));
    await writeFile(`${directory}/${id}.phdreplay.json`, E.serializeReplayRecording(recording));
    console.log(JSON.stringify(summary));
  }
} finally { await close(); }
