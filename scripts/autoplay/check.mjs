import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadEngine } from './engine.mjs';
import { expectedResearch, paperReliability, stageGoal } from './estimates.mjs';
import { auditTeachingReplay } from './quality.mjs';
const { E, close } = await loadEngine();
try {
  const recording = E.parseReplayRecording(await readFile('public/official-replays/normal-phd-10.json', 'utf8'));
  let s = structuredClone(recording.replay.initial);
  for (const command of recording.replay.commands) {
    s = E.executeReplayCommand(s, command, recording.replay.ruleset);
    if (s.totalMonths >= 1) break;
  }
  const before = JSON.stringify(s), paper = { idea: 0, experiment: 0, writing: 0 };
  const estimate = expectedResearch(E, s, paper, 'idea');
  assert.ok(estimate.expected > 0);
  assert.equal(JSON.stringify(s), before, 'estimating must not mutate or advance RNG');
  const balanced = { idea: 20, experiment: 20, writing: 20 };
  assert.ok(paperReliability(E,s,balanced,'C') > paperReliability(E,s,{idea:2,experiment:2,writing:2},'C'));
  assert.ok(paperReliability(E,s,balanced,'C') >= paperReliability(E,s,balanced,'A'));
  assert.equal(stageGoal(E,s,'phd').submissionDeadline,18);
  assert.equal(stageGoal(E,{...s,totalMonths:22},'phd').submissionDeadline,30);
  const report = auditTeachingReplay(E,recording);
  assert.equal(report.finalDigest,recording.finalDigest);
  // A small synthetic audit fixture keeps this regression independent of which
  // tutorial is currently published. Publication legality is checked separately.
  const initial={...E.createInitialState(),player:{...E.createInitialState().player,money:20}};
  const start={kind:'action',actionId:'start-game',payload:{roleId:'rich',talentAllocation:{heiress:4}}};
  const commands=[start];let fixture=E.executeReplayCommand(initial,start,E.REPLAY_RULESET);
  for(const id of ['before-grad-school-open-advisor-info','before-grad-school-confirm','before-grad-school-finish']){
    const event=fixture.eventQueue[0];const c={kind:'action',actionId:'resolve-event',payload:{eventId:event.id,eventChoiceId:id}};
    fixture=E.executeReplayCommand(fixture,c,E.REPLAY_RULESET);commands.push(c);
  }
  commands.push({kind:'action',actionId:'next-month',payload:{}});
  commands.push({kind:'action',actionId:'buy-ai-month',payload:{aiSlotId:'gpt'}});
  const waste=auditTeachingReplay(E,{replay:{initial,commands,ruleset:E.REPLAY_RULESET}});
  assert.ok(waste.issues.some(x=>x.code==='paid-ai-unused'),'paid model without a research operation must fail');
  console.log('Autoplay estimation and teaching quality checks passed.');
} finally { await close(); }
