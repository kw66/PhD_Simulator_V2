/** Policy estimates use only visible state and rule arithmetic; never RNG or candidate dispatch. */
export const FIELDS=['idea','experiment','writing'];
export const sum=p=>p.idea+p.experiment+p.writing;
export function teachingProfile(E,s){
 const points=E.getDesignedTalentNodes(s.selectedRoleId).reduce((n,node)=>n+node.cost*(s.roleTalents?.levels[node.id]??0),0);
 return {points,mode:points===0?'stable':points>=20?'comprehensive':'balanced',
  scoreMargin:points===0?3:points>=20?6:5,ideaTarget:points===0?18:points>=20?28:24};
}
const researchCache=new Map();
const reliabilityCaches=new WeakMap();
export function expectedResearch(E,s,p,field) {
 const preview=E.previewResearchOperation(s,field,E.RESEARCH_OPERATION_SAN_COST[field]);
 const equipment=E.getShopPaperActionModifier(s.shopState,field);
 const current=E.getPaperScoreBreakdown(p,field).own,research=E.getEffectiveResearch(s);
 const first=E.getResearchActionEffect(s,field,true),later=E.getResearchActionEffect(s,field,false);
 const cacheKey=JSON.stringify([current,research,preview.extraActions,equipment.bonus,first.multiplier,first.bonus,later.multiplier,later.bonus]);
 let cached=researchCache.get(cacheKey);
 if(cached)return {...preview,...cached};
 let distribution=new Map([[current,1]]);
 for(let repeat=0;repeat<=Math.floor(preview.extraActions);repeat++){
  const effect=E.getResearchActionEffect(s,field,repeat===0),next=new Map();
  // Integrate the public distribution, not a seeded/game outcome.
  for(const [old,weight] of distribution)for(let u=0;u<12;u++)for(let v=0;v<6;v++){
   const score=Math.max(old+1,Math.max(0,Math.round((research*(.5+(u+.5)/12)+v)*effect.multiplier+effect.bonus+equipment.bonus)));
   next.set(score,(next.get(score)||0)+weight/72);
  }
  distribution=next;
 }
 const expected=[...distribution].reduce((n,[x,w])=>n+x*w,0);
 cached={expected,improvement:expected-current,distribution:[...distribution]};
 if(researchCache.size>=10000)researchCache.clear();
 researchCache.set(cacheKey,cached);
 return {...preview,...cached};
}
export function projectAi(E,s,slots,paper) {
 let money=s.player.money,funding=s.advisorProgressState.funding;const subscriptions={...s.aiShopState.subscriptions};let cost=0,labCost=0;
 let papers=s.papers,projectedPaper=paper;
 for(const slot of slots){if(subscriptions[slot].active)continue;
  const price=E.getShopActionPrice(s,'buy-ai-month',{aiSlotId:slot});if(price===null)return null;
  const lab=E.getShopLabFundingCost(s,'buy-ai-month',{aiSlotId:slot});cost+=price;labCost+=lab;money-=price;funding-=lab;
  subscriptions[slot]={...subscriptions[slot],active:true,modelId:E.getAiModelForTotalMonths(s.totalMonths,slot).id};
  // Claude changes existing editable scores once on activation, including zero
  // fields. Use that public deterministic rule; never dispatch a candidate buy
  // or reapply the polish when the subscription was already active.
  if(slot==='claude'){
   const model=E.getAiModelForTotalMonths(s.totalMonths,slot);
   papers=E.polishUnsubmittedPapers(papers,model).papers;
   if(projectedPaper)projectedPaper=E.polishUnsubmittedPapers([{status:'draft',...projectedPaper}],model).papers[0];
  }
 }
 if(money<0||funding<0)return null;
 const aiShopState={subscriptions};return {state:{...s,papers,player:{...s.player,money},advisorProgressState:{...s.advisorProgressState,funding},aiShopState,buffs:[...s.buffs.filter(b=>!b.id.startsWith('ai-')), ...E.createAiBuffs(aiShopState)]},cost,labCost,...(paper?{paper:projectedPaper}:{})};
}
export function cashReserve(E,s) {
 const f=E.previewNextMonthEffects(s);return Math.max(1,1-Math.min(0,f.totals.money))+(s.illnessProbability>=20?2:0);
}
export function safePayment(E,s,operation,cost,buffer=6) {
 const prepared=operation?E.consumeActiveOperation(s,operation):s;
 const quote=E.quoteSanPayment(prepared,cost);
 if(!quote.allowed||quote.sanCapCost>0)return false;
 const after=E.paySanCost(prepared,cost);
 if(after.player.money<0||after.player.san<0)return false; // Do not borrow next month's semester recovery to justify leaving the player // near zero now. Events can still occur before that recovery is applied. if(after.player.san<Math.min(6,buffer)){  if(!E.getActiveOperationAllowance(after,'rest').allowed)return false;  const recovered=E.applyRoleTalentRest(E.consumeActiveOperation(after,'rest'));  if(recovered.player.san<Math.min(6,buffer))return false; }
 const f=E.previewNextMonthEffects(after);
 if(f.player.money<0)return false;
 if(f.player.san>=buffer)return true;
 if(operation!=='rest'&&E.getActiveOperationAllowance(after,'rest').allowed){
  const rested=E.applyRoleTalentRest(E.consumeActiveOperation(after,'rest'));
  return E.previewNextMonthEffects(rested).player.san>=buffer;
 }
 return false;
}
// Integrate reviewer types and continuous weighting, then convolve three reports.
// This estimates acceptance from published rules, never from the run seed.
export function paperReliability(E,s,p,target) {
 if(FIELDS.some(f=>p[f]<=0))return 0;
 let cache=reliabilityCaches.get(E);
 if(!cache){cache=new Map();reliabilityCaches.set(E,cache);}
 const bonus=E.getRoleKindReviewerBonus(s);
 const key=JSON.stringify([s.year,s.month,target,bonus,...FIELDS.map(f=>p[f])]);
 if(cache.has(key))return cache.get(key);
 const conference=E.getConferenceInfo(s.month,target,s.year),thresholds=E.getReviewThresholds(target,conference.influence);
 const grades=[0,0,0];
 for(const [type,weight] of E.getReviewerWeights(s.year,bonus)){
  const t=thresholds[type],add=(score,w)=>{grades[score<t.reject?0:score<t.borderline?1:2]+=w;};
  if(type!=='normal'&&type!=='gpt'){add(E.getReviewerEffectiveScore(type,p.idea,p.experiment,p.writing,()=>.5),weight);continue;}
  const base=type==='gpt'?.2:.8,total=type==='gpt'?2.4:.6;
  for(let i=0;i<8;i++)for(let j=0;j<8;j++){
   const x=(i+.5)/8*total,y=(j+.5)/8*(total-x),z=total-x-y;
   for(const v of [[x,y,z],[x,z,y],[y,x,z],[y,z,x],[z,x,y],[z,y,x]])add(Math.round(p.idea*(base+v[0])+p.experiment*(base+v[1])+p.writing*(base+v[2])),weight/384);
  }
 }
 let probability=0;
 for(let a=0;a<3;a++)for(let b=0;b<3;b++)for(let c=0;c<3;c++){
  const score=a+b+c-3;
  probability+=grades[a]*grades[b]*grades[c]*(score>=2?1:score<=-2?0:E.getBorderlineAcceptChance(target,sum(p),score));
 }
 if(cache.size>=20000)cache.clear();
 cache.set(key,probability);
 return probability;
}
export function stageGoal(E,s,degreeGoal) {
 // April's blind review freezes before queued conference results are claimed.
 // Graduate in June, but have required research credited by March.
 const thesis=s.degree===degreeGoal?E.getThesisForecast(s):null,deadline=degreeGoal==='master'?31:67;
 const review=s.thesis?.review;
 if(thesis&&thesis.researchScoreMet&&thesis.currentPass&&(!review||review.submitted&&review.passed))return {id:'finish',label:'毕业收尾：保留安全储备，不再购买科研用品',deadline};
 if(review&&(!review.submitted||!review.passed))return {id:'missed-review',label:'盲审已冻结且未通过：本局无法补救，不再为毕业资格购买科研用品',deadline};
 if(thesis&&thesis.stage!=='planning')return {id:'thesis',label:'毕业准备：优先补齐盲审短板与科研分',deadline};
 const transfer=s.degree==='master'&&degreeGoal==='phd'?{milestoneMonth:s.totalMonths<21?21:33,submissionDeadline:s.totalMonths<21?18:30,requiredScore:s.totalMonths<21?2:3}:{};
 if(s.totalResearchScore===0)return {id:'foundation',label:'打基础：积累阅读与加成，完成首篇可靠投稿',deadline,...transfer};
 if(s.degree==='master'&&degreeGoal==='phd')return {id:'transfer',label:'转博准备：科研分达标，同时积累长期收益',deadline,...transfer};
 return {id:'production',label:'稳健成长：科研满足毕业并留余量，兼顾属性、实验室、参会与关系机会',deadline};
}
