import { FIELDS, paperReliability, sum } from './estimates.mjs';

/** Independent replay audit: derives evidence from engine actions, not policy claims. */
export function auditTeachingReplay(E, recording, { degreeGoal } = {}) {
  let state = structuredClone(recording.replay.initial);
  const actions = [], purchases = [], submissions = [], issues = [], drafts = new Map(), monthly = new Map();
  const attendedTrips = new Set(), bookedTrips = new Set(), conferenceActivities = {};
  const budgets=new Map();
  let draftDecay = 0, reviewDecay = 0, produced = 0, transferMonth = null;
  for (const [index, command] of recording.replay.commands.entries()) {
    const before = state;
    state = E.executeReplayCommand(before, command, recording.replay.ruleset);
    const action = command.actionId, payload = command.payload ?? {};
    const entry = { index, month: before.totalMonths, action, payload };
    actions.push(entry);
    // A paid reservation is not evidence of reaching the venue or its reward.
    for (const plan of state.conferenceAttendancePlans ?? []) {
      if (plan.mode !== 'proxy') bookedTrips.add(E.getConferenceTripId(plan.context));
    }
    for (const event of state.eventQueue) {
      if (event.conferenceActivityPreview && event.stage === 'act1') attendedTrips.add(event.chainId);
    }
    const resolved = action === 'resolve-event' && before.eventQueue.find(e=>e.id===payload.eventId);
    if (resolved?.conferenceActivityPreview && resolved.stage === 'result' && state !== before) {
      const option = resolved.conferenceActivityPreview.selectedOptionId;
      if (option) conferenceActivities[option] = (conferenceActivities[option] ?? 0) + 1;
    }
    if(before.totalMonths>0&&before.phase==='playing'){
      const stage=before.degree==='master'?(degreeGoal==='phd'?'pre-transfer':'master')
        :before.year>=6?'phd-thesis':'phd-production';
      const budget=budgets.get(stage)??{stage,months:new Set(),actions:{},regularActions:0,
        researchBonusActions:0,reads:0,cashIn:0,cashOut:0,equipment:0,researchAI:0,readingAI:0,coffee:0,sanSpent:0,sanRecovered:0};
      budget.months.add(before.totalMonths);
      budget.actions[action]=(budget.actions[action]??0)+1;
      if(action!=='next-month'){
        budget.regularActions+=Math.max(0,state.actionState.used-before.actionState.used);
        if(!before.actionState.aiResearchBonusUsed&&state.actionState.aiResearchBonusUsed)budget.researchBonusActions++;
      }
      budget.reads+=Math.max(0,state.readingState.readCount-before.readingState.readCount);
      const spent=Math.max(0,before.player.money-state.player.money);
      budget.cashOut+=spent;budget.cashIn+=Math.max(0,state.player.money-before.player.money);
      budget.sanSpent+=Math.max(0,before.player.san-state.player.san);
      budget.sanRecovered+=Math.max(0,state.player.san-before.player.san);
      if(['buy-shop-item','upgrade-shop-item','buy-support-item'].includes(action))budget.equipment+=spent;
      if(action==='buy-ai-month')budget[payload.aiSlotId==='kimi'?'readingAI':'researchAI']+=spent;
      if(action==='buy-coffee')budget.coffee+=spent;
      budgets.set(stage,budget);
    }
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
      monthly.set(before.totalMonths, { month: before.totalMonths, year: before.year,
        degree: before.degree, player: { ...before.player }, researchScore: before.totalResearchScore,
        caps:Object.fromEntries(['research','social','favor'].map(stat=>[stat,E.getPlayerAttributeCap(before,stat)])),
        unusedActions: Math.max(0, before.actionState.limit - before.actionState.used),
        readingBonus: E.getPendingReadingIdeaBonus(before),
        draftCount: before.papers.filter(p=>p.status==='draft').length,
        reviewingCount: before.papers.filter(p=>p.status==='reviewing').length,
        helpedPlayer: before.fellowProgressState.reduce((n,f)=>n+(f.helpedPlayerCount??0),0),
        thesisPass: E.getThesisForecast(before)?.currentPass ?? false });
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
  if (degreeGoal && state.ending !== degreeGoal)
    issues.push({ code: 'wrong-degree-ending', expected: degreeGoal, ending: state.ending });
  const months=[...monthly.values()];
  const warnings=[];
  const idle=months.filter(m=>m.unusedActions>0&&!m.thesisPass&&m.player.san>=15&&!m.draftCount&&!m.reviewingCount);
  if(idle.length>=3)warnings.push({code:'unexplained-idle-months',months:idle.map(m=>m.month)});
  // Cash at graduation is not itself waste: much of it may arrive after the
  // last useful investment. Expose the earlier balances for manual review.
  const stages=[1,2,3,4,5,6].flatMap(year=>{
    const rows=months.filter(m=>m.year===year);if(!rows.length)return [];
    const last=rows.at(-1),used=actions.filter(a=>rows.some(m=>m.month===a.month));
    return [{year,degree:last.degree,player:last.player,researchScore:last.researchScore,
      unusedActions:rows.reduce((n,m)=>n+m.unusedActions,0),
      work:used.filter(a=>a.action==='part-time-work').length,
      research:used.filter(a=>a.action==='research-paper').length,
      reading:used.filter(a=>a.action==='read-paper').length,
      cooperation:used.filter(a=>a.action==='relationship-task').length}];
  });
  if(stages.some(s=>s.year<6&&s.player.money>=20))warnings.push({code:'early-cash-surplus-review',
    stages:stages.filter(s=>s.year<6&&s.player.money>=20).map(s=>({year:s.year,money:s.player.money}))});
  if(state.degree==='phd'&&state.player.social<6)warnings.push({code:'low-social-review',social:state.player.social});
  const mechanisms={conferences:attendedTrips.size,
    conferenceBookings:bookedTrips.size,selfFundedTrips:(state.advisorProgressState.paidPlayerConferenceTrips??[]).length,conferenceActivities,
    enterpriseContacts:state.conferenceCareerState.enterpriseCount,
    internshipExperience:E.hasInternshipExperience(state),internships:state.internshipCount,
    jointTraining:Boolean(state.conferenceEncounterState.jointTrainingReward),
    scholarCooperations:state.conferenceEncounterState.bigBull?.cooperationCount??0,
    lover:Boolean(state.loverState.active),loverDates:actions.filter(a=>['lover-study','lover-play','lover-shopping'].includes(a.action)).length,
    labProjects:actions.filter(a=>a.action==='advisor-project').length,
    fellowTasks:actions.filter(a=>a.action==='relationship-task').length,
    journals:state.externalPublications.filter(p=>p.journalTarget||p.publication?.journalTarget).length};
  if(state.degree==='phd'&&!mechanisms.conferences)warnings.push({code:'no-conference-attendance-review'});
  if(state.degree==='phd'&&state.player.research<12)warnings.push({code:'joint-training-research-requirement-unmet',research:state.player.research});
  if(state.degree==='phd'&&state.player.social<12)warnings.push({code:'lover-social-requirement-unmet',social:state.player.social});
  return { passed: issues.length === 0, issues, submissions, purchases, draftDecay, reviewDecay,mechanisms,
    stageBudgets:[...budgets.values()].map(b=>({...b,months:b.months.size})),
    warnings, needsManualReview: true, stages, monthly: months,
    produced, transferMonth, ending: state.ending, finalDigest: E.replayStateDigest(state) };
}
