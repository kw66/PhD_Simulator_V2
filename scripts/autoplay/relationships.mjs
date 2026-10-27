import {cashReserve, safePayment,teachingProfile} from './estimates.mjs';

// Quote fixed public costs from their rules. Random event choices may defer
// their effects to the result page; effects.san alone can therefore be zero.
// Never consult a frozen attendance/recruitment outcome for these prices.
export function optionalEventSanCost(E, s, prefix, eventChoice) {
  const researchCosts = {
    'random-1-self':4, 'random-4-horizontal':8, 'random-4-vertical':6,
    'random-4-share':2, 'random-6-series':4, 'random-6-deep':2,
    'random-10-short-term':5, 'random-11-deep':5, 'random-16-stay-up':5,
  };
  if (prefix in researchCosts) return Math.max(0, -E.getActualResearchMiscSanChange(
    -researchCosts[prefix], E.getEffectiveResearch(s), s.month, s.eventSupport, s.buffs));
  if (prefix === 'random-2-self') return E.getReadPaperSanCost(s).sanCost * 2;
  const ordinaryCosts = {
    'random-10-exchange':E.getEffectiveSocial(s)<6?2:0,
    'random-12-argue':s.player.favor<6?3:0,
    'random-15-terraria':Math.max(0,4-s.eventCounters.terrariaCount),
    'random-15-magic-tower':Math.max(0,6-s.eventCounters.magicTowerCount),
  };
  if (prefix in ordinaryCosts) return Math.max(0, -E.getActualSanChange(
    -ordinaryCosts[prefix], s.month, s.eventSupport, s.buffs));
  return Math.max(0, -(eventChoice?.effects.san ?? 0));
}

export function canBudgetOptionalEvent(E, s, cost, commitment=null, buffer=8) {
  if (!safePayment(E,s,null,cost,buffer)) return false;
  if (cost <= 0) return true;
  const draft=s.papers.find(p=>p.status==='draft'&&(commitment?.paperId==null||p.id===commitment.paperId));
  if (!draft) return true;
  const field=commitment?.steps.find(step=>!step.activationOnly)?.field
    ?? ['idea','experiment','writing'].find(f=>draft[f]<=0);
  if (!field || !E.getActiveOperationAllowance(s,field).allowed) return true;
  const after=E.paySanCost(s,cost);
  const work=E.previewResearchOperation(after,field,E.RESEARCH_OPERATION_SAN_COST[field]);
  // Reserve the next available manuscript operation, using its actual seasonal
  // and illness price. Do not add a larger generic safety cushion.
  return work.allowed && safePayment(E,after,field,work.sanCost,buffer);
}

// Policy targets, not new game rules. Stop optional growth before the final review.
export function socialTarget(s, degreeGoal, E) {
  return degreeGoal === 'phd' && s.year >= 3 && s.year < 6 && (!E||teachingProfile(E,s).mode!=='stable') ? 12 : 6;
}

export function relationshipEventPriorities(E, s, degreeGoal, reservedCoins=0, commitment=null) {
  const growing = s.year < (degreeGoal === 'master' ? 3 : 6);
  const needSocial = (degreeGoal!=='phd'||s.degree==='phd') && s.player.social < socialTarget(s, degreeGoal,E);
  const funding = s.advisorProgressState.funding, reserve = Math.max(cashReserve(E,s)+reservedCoins,degreeGoal==='phd'&&s.degree==='master'?10:3);
  const capacity = Math.max(0, s.relationshipState.unlockedSlots - 1);
  const room = s.fellowProgressState.length < capacity;
  const budget=prefix=>canBudgetOptionalEvent(E,s,optionalEventSanCost(E,s,prefix),commitment);
  const badmintonWin = Math.max(0, s.player.san) * (s.eventCounters.badmintonCount + 3)
    + (s.eventSupport.hasBadmintonRacket ? 40 : 0) >= 100;
  const knownResearch=s.totalResearchScore+s.papers.filter(p=>p.status==='reviewing').reduce((n,p)=>n+(E.SCORE_BY_TARGET[p.target]??0),0);
  const masterCashNeed=reserve+(s.totalMonths<24&&knownResearch<2?6:2);
  return [
    s.player.favor <= 0 ? 'year-summary-favor' : s.player.san < 6 ? 'year-summary-sleep' : s.player.money < (s.degree==='master'?(degreeGoal==='master'?masterCashNeed:reserve+(s.totalMonths<24?6:2)):Math.min(reserve,cashReserve(E,s)+2)) ? 'year-summary-part-time'
      : s.player.favor < 3 ? 'year-summary-favor' : needSocial ? 'year-summary-social'
      : s.player.favor < 6 ? 'year-summary-favor' : 'year-summary-sleep',
    badmintonWin && !s.eventSupport.hasStrongBodyTalent || s.illnessProbability >= 30
      ? 'random-7-badminton' : needSocial ? 'random-7-ktv' : 'random-7-badminton',
    // These branches have fixed benefits; do not inspect frozen random outcomes.
    growing && needSocial && budget('random-15-terraria')
      ? 'random-15-terraria' : 'random-15-grad-sim',
    // Repair costs 2 coins with a public 50% chance of failure. Budget the
    // failure's rental surcharge instead of reading the stored success result.
    s.player.money >= reserve + 5 ? 'random-13-taobao' : 'random-13-advisor',
    s.player.san<10?'random-19-travel':s.player.money<reserve+2?'random-19-money':needSocial?'random-19-friends':'random-19-sport',
    growing && room && budget('random-10-short-term') ? 'random-10-short-term'
      : budget('random-10-exchange') ? 'random-10-exchange' : 'random-10-reject',
    growing && room && budget('random-11-deep') ? 'random-11-deep' : 'random-11-light',
    needSocial && s.player.san >= 6 ? 'tea-break' : 'tour-local',
    growing && needSocial && s.player.money >= reserve + 2 ? 'ccig-activity-food' : 'ccig-activity-listen',
    // Personal surplus takes precedence over draining the laboratory or favor.
    growing && s.player.money >= E.getCcigSelfPayCost(s).actualCost + reserve + 2 ? 'ccig-self'
      : growing && s.player.favor >= 7 && funding >= E.getCcigSelfPayCost(s).actualCost + 25 ? 'ccig-advisor' : 'ccig-skip',
  ];
}

export function planCooperation(E, s, degreeGoal) {
  if (s.year >= (degreeGoal === 'master' ? 3 : 6)) return null;
  const draft = s.papers.find(p => p.status === 'draft');
  const options = [];
  for (const fellow of s.fellowProgressState) {
    if (fellow.taskUsedThisMonth || fellow.pendingHelpToPlayer != null || fellow.research < 2) continue;
    const cost = E.getFellowDiscussionSanCost(s, fellow);
    const gain = Math.floor(E.getEffectiveResearch(s)) + 2.5;
    const deficit = Math.max(0, fellow.taskMax - fellow.taskProgress);
    // Buy the final useful push. Starting a 100-point chain with no near-term
    // payoff competes poorly with reading and is not justified by a large SAN bar.
    const monthsLeft=(degreeGoal==='master'?34:60)-s.totalMonths;
    const passive=fellow.affinity*(fellow.longTermMentoring?2:1);
    const pushes=Math.ceil(Math.max(0,deficit-passive*Math.min(8,monthsLeft))/gain);
    if (pushes>Math.min(6,monthsLeft)||(!draft&&monthsLeft<12)||draft&&draft[fellow.taskType]<=0) continue;
    if (s.player.san<16 || !safePayment(E,s,null,cost,12)) continue;
    const value=fellow.research/Math.max(1,pushes);
    if (value / Math.max(1,cost) < .75) continue;
    options.push({action:'relationship-task',payload:{relationshipId:fellow.id},
      reason:'同学协作接近完成：推进后为已有论文补分，并提供双向帮助',
      detail:{name:E.getFellowName(fellow),cost,progress:fellow.taskProgress,expectedGain:gain,paperHelp:fellow.research},value});
  }
  return options.sort((a,b)=>b.value-a.value)[0] ?? null;
}

export function planLabProject(E,s,degreeGoal) {
  if(s.degree!=='phd'||degreeGoal!=='phd'||s.year>=6||s.player.san<18)return null;
  const a=s.advisorProgressState;
  if(a.lastPlayerProjectTotalMonths===s.totalMonths)return null;
  const gain=Math.floor(E.getEffectiveResearch(s))+2.5;
  const left=60-s.totalMonths;
  const options=[];
  for(const type of ['horizontal','vertical']){
    if(type==='vertical'&&(a.pendingGuidanceToPlayer!=null||s.totalResearchScore>=(s.graduationScoreTarget??7)+2))continue;
    if(type==='horizontal'&&a.funding>=45)continue;
    const progress=a[type+'Progress'],pushes=Math.ceil((100-progress)/Math.max(1,gain));
    // A share of a long-running lab project must have a reachable payoff.
    if(pushes>Math.min(5,left))continue;
    const cost=E.getAdvisorTaskSanCost(s,type);
    if(!safePayment(E,s,null,cost,12))continue;
    const reward=type==='horizontal'?E.getAdvisorHorizontalReward(a)*.05:E.getAdvisorGuidanceAmount(s);
    const value=reward/Math.max(1,pushes*cost)+(type==='horizontal'&&a.funding<20?4:0);
    if(value<.6)continue;
    options.push({action:'advisor-project',payload:{projectType:type},reason:type==='horizontal'
      ?'实验室经费偏低：参与可在剩余时间完成的横向项目，补工资、实验资金与个人劳务收入'
      :'纵向项目有可达回报：用科研余量换导师指导，为下一篇论文补分',
      detail:{progress,expectedGain:gain,pushes,cost,reward},value});
  }
  return options.sort((a,b)=>b.value-a.value)[0]??null;
}
