import {cashReserve, paperReliability, projectAi, safePayment} from './estimates.mjs';

// Integrate the public score-line distribution. Never use the application's roll
// or the generated result event to decide whether to apply.
export function scholarshipChance(E,year,score) {
 const low=E.getScholarshipRequirement(year,()=>0);
 const high=E.getScholarshipRequirement(year,()=>1);
 return Math.max(0,Math.min(1,(Math.floor(score)-low+1)/(high-low+1)));
}
export function scholarshipDecision(E,s) {
 const score=Math.max(0,s.totalResearchScore-s.scholarshipState.scoreBaseline);
 const probability=scholarshipChance(E,s.year,score),reward=E.getScholarshipReward(s.year);
 const cost=Math.max(0,-E.getActualSanChange(-2,s.month,s.eventSupport,s.buffs));
 const eligible=!E.hasScholarshipDisqualification(s)&&(s.scholarshipState.lastAwardYear??0)<s.year;
 // Two SAN is a small investment, but do not pay for a negligible chance or
 // count the same awarded papers twice. A failed application preserves score.
 return {score,probability,reward,cost,apply:eligible&&probability>=1/3&&probability*reward>=2&&safePayment(E,s,null,cost,5)};
}
export function transferWindow(s) {
 // A result arriving in May can be settled before the transfer decision.
 const early=s.totalMonths<=18;
 return {deadline:early?21:33,requiredScore:early?2:3};
}
export function transferPaperOptions(E,s,{deadline,requiredScore}=transferWindow(s)) {
 const pending=s.papers.filter(p=>p.status==='reviewing'&&s.totalMonths+p.reviewMonthsLeft<=deadline)
  .reduce((n,p)=>n+(E.SCORE_BY_TARGET[p.target]??0),0);
 const scoreNeed=Math.max(1,requiredScore-s.totalResearchScore-pending);
 // C is a valid early cash-flow route. Near the final window, a one-point
 // manuscript cannot silently replace a needed B if no next paper can finish.
 const minScore=deadline===33&&s.totalMonths>=25&&scoreNeed>=2?(s.totalMonths>=27?scoreNeed:2):1;
 return {deadline,scoreNeed,minScore,minProbability:.88};
}
export function transferPlanValue(E,s,plan,{deadline,requiredScore}=transferWindow(s)) {
 const points=E.SCORE_BY_TARGET[plan.target],pending=s.papers.filter(p=>p.status==='reviewing'
  &&s.totalMonths+p.reviewMonthsLeft<=deadline).reduce((n,p)=>n+(E.SCORE_BY_TARGET[p.target]??0),0);
 const deficit=Math.max(0,requiredScore-s.totalResearchScore-pending);
 let value=plan.utility;
 // Reward an actual early funding opportunity; no projected award is added to
 // the spendable balance. This competes with B's larger score, not a fixed C rule.
 const awardMonth=s.totalMonths<=14?14:26,year=awardMonth===14?2:3;
 if(plan.resultMonth<=awardMonth&&(s.scholarshipState.lastAwardYear??0)<year&&!E.hasScholarshipDisqualification(s)){
  const unclaimed=Math.max(0,s.totalResearchScore-s.scholarshipState.scoreBaseline);
  const increment=scholarshipChance(E,year,unclaimed+points)-scholarshipChance(E,year,unclaimed);
  value+=increment*E.getScholarshipReward(year)*plan.probability*1.5;
 }
 if(deficit>0&&points>=deficit&&plan.resultMonth<=deadline)value+=8*plan.probability;
 if(points<deficit){
  // This is a scheduling allowance, not a prediction of unknown future buffs.
  const nextPaperMonths=Math.max(4,plan.finishMonth-s.totalMonths+3);
  if(plan.finishMonth+nextPaperMonths+3>deadline)value-=12;
 }
 return value;
}
export function criticalPolish(E,s,p,window=transferWindow(s)) {
 if(s.totalMonths+3>window.deadline||s.totalMonths+6<=window.deadline||s.aiShopState.subscriptions.claude.active)return null;
 const need=window.requiredScore-s.totalResearchScore;
 if(need<=0)return null;
 const projection=projectAi(E,s,['claude'],p);
 if(!projection||projection.state.player.money<cashReserve(E,s))return null;
 for(const target of ['C','B','A']){
  if(E.SCORE_BY_TARGET[target]<need)continue;
  const before=paperReliability(E,s,p,target),after=paperReliability(E,projection.state,projection.paper,target);
  if(before<.95&&after>=.95&&after-before>=.05)return {target,before,after,price:projection.cost};
 }
 return null;
}
