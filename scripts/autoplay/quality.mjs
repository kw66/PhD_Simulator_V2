import { FIELDS, paperReliability, sum } from './estimates.mjs';

/** Independent replay audit: derives evidence from engine actions, not policy claims. */
export function auditTeachingReplay(E, recording) {
  let state = structuredClone(recording.replay.initial);
  const actions = [], purchases = [], submissions = [], issues = [], drafts = new Map();
  let draftDecay = 0, reviewDecay = 0, produced = 0, transferMonth = null;
  for (const [index, command] of recording.replay.commands.entries()) {
    const before = state;
    state = E.executeReplayCommand(before, command, recording.replay.ruleset);
    const action = command.actionId, payload = command.payload ?? {};
    const entry = { index, month: before.totalMonths, action, payload };
    actions.push(entry);
    if (before.degree !== 'phd' && state.degree === 'phd') transferMonth = state.totalMonths;
    if (action === 'buy-ai-month') {
      purchases.push({ ...entry, slot: payload.aiSlotId, money: before.player.money - state.player.money,
        funding: before.advisorProgressState.funding - state.advisorProgressState.funding,
        automaticReads: state.readingState.readCount - before.readingState.readCount,
        polishedScore: state.papers.reduce((n,p)=>n+sum(p)-(before.papers.find(q=>q.id===p.id)?sum(before.papers.find(q=>q.id===p.id)):sum(p)),0),
        // Greed's spending talents can make a purchase productive independently of AI.
        talentBenefit: ['san', 'research', 'social', 'favor'].some(k => state.player[k] > before.player[k]) });
    }
    if (action === 'buy-coffee' && state.player.san <= before.player.san)
      issues.push({ code: 'coffee-without-recovery', ...entry });
    for (const p of state.papers) {
      const old = before.papers.find(q => q.id === p.id);
      if (!old) drafts.set(p.id, { month: state.totalMonths, lowGain: 0 });
      if (!old) continue;
      const delta = sum(p) - sum(old);
      if (action === 'next-month' && delta < 0) {
        if (old.status === 'draft') draftDecay -= delta;
        else if (old.status === 'reviewing') reviewDecay -= delta;
      }
      if (action === 'research-paper' && payload.paperId === p.id) {
        produced += Math.max(0, delta);
        // A mandatory first operation may unlock collaboration; repeated +1 is different.
        if (delta <= 1 && old[payload.paperActionType] > 0) {
          const d = drafts.get(p.id) ?? { month: before.totalMonths, lowGain: 0 };
          d.lowGain++; drafts.set(p.id, d);
          if (d.lowGain === 3) issues.push({ code: 'repeated-low-gain-research', paperId: p.id, ...entry });
        }
      }
    }
    if (action === 'submit-paper') {
      const p = before.papers.find(q => q.id === payload.paperId);
      if (!p) continue;
      const probability = paperReliability(E, before, p, payload.paperTarget);
      const age = before.totalMonths - (drafts.get(p.id)?.month ?? before.totalMonths);
      submissions.push({ ...entry, probability, age, scores: FIELDS.map(f => p[f]) });
      if (probability < .65) issues.push({ code: 'low-probability-submission', probability, ...entry });
      if (age > 6 && !p.lastReview) issues.push({ code: 'long-first-draft', age, ...entry });
    }
    if (action === 'next-month' && before.phase === 'playing') {
      const forecast = E.previewNextMonthEffects(before);
      if (forecast.player.san < 0 || forecast.player.money < 0)
        issues.push({ code: 'known-unsafe-month', forecast: forecast.player, ...entry });
    }
  }
  for (const p of purchases) {
    if (p.money <= 0 && p.funding <= 0 || p.talentBenefit) continue;
    const later = actions.filter(a => a.month === p.month && a.index > p.index);
    if (['gpt', 'deepseek', 'gemini', 'doubao'].includes(p.slot)
      && !later.some(a => a.action === 'research-paper' || p.slot === 'gemini' && a.action === 'relationship-task'))
      issues.push({ code: 'paid-ai-unused', ...p });
    if (p.slot === 'kimi' && p.automaticReads === 0 && !later.some(a=>a.action==='read-paper'))
      issues.push({ code: 'paid-reading-ai-unused', ...p });
    if (p.slot === 'claude' && p.polishedScore <= 0 && !later.some(a=>a.action==='research-paper'))
      issues.push({ code: 'paid-polish-unused', ...p });
  }
  // Passing these checks is necessary, not proof that the build or every choice
  // is optimal. Role-specific economy and manual teaching review remain required.
  if (!['phd', 'master'].includes(state.ending)) issues.push({ code: 'route-not-completed', ending: state.ending });
  return { passed: issues.length === 0, issues, submissions, purchases, draftDecay, reviewDecay,
    produced, transferMonth, ending: state.ending, finalDigest: E.replayStateDigest(state) };
}
