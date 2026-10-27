/** Policy estimates use only visible state and rule arithmetic; never RNG or candidate dispatch. */
export const FIELDS=['idea','experiment','writing'];
export const sum=p=>p.idea+p.experiment+p.writing;
export function expectedResearch(E,s,p,field) {
 const preview=E.previewResearchOperation(s,field,E.RESEARCH_OPERATION_SAN_COST[field]);
 const equipment=E.getShopPaperActionModifier(s.shopState,field);
 let distribution=new Map([[E.getPaperScoreBreakdown(p,field).own,1]]);
 for(let repeat=0;repeat<=Math.floor(preview.extraActions);repeat++){
  const effect=E.getResearchActionEffect(s,field,repeat===0),next=new Map();
  // Integrate the public distribution, not a seeded/game outcome.
  for(const [old,weight] of distribution)for(let u=0;u<12;u++)for(let v=0;v<6;v++){
   const score=Math.max(old+1,Math.max(0,Math.round((E.getEffectiveResearch(s)*(.5+(u+.5)/12)+v)*effect.multiplier+effect.bonus+equipment.bonus)));
   next.set(score,(next.get(score)||0)+weight/72);
  }
  distribution=next;
 }
 const current=E.getPaperScoreBreakdown(p,field).own;
 const expected=[...distribution].reduce((n,[x,w])=>n+x*w,0);
 return {...preview,expected,improvement:expected-current};
}
export function projectAi(E,s,slots) {
 let money=s.player.money,funding=s.advisorProgressState.funding;const subscriptions={...s.aiShopState.subscriptions};let cost=0,labCost=0;
 for(const slot of slots){if(subscriptions[slot].active)continue;
  const price=E.getShopActionPrice(s,'buy-ai-month',{aiSlotId:slot});if(price===null)return null;
  const lab=E.getShopLabFundingCost(s,'buy-ai-month',{aiSlotId:slot});cost+=price;labCost+=lab;money-=price;funding-=lab;
  subscriptions[slot]={...subscriptions[slot],active:true,modelId:E.getAiModelForTotalMonths(s.totalMonths,slot).id};
 }
 if(money<0||funding<0)return null;
 const aiShopState={subscriptions};return {state:{...s,player:{...s.player,money},advisorProgressState:{...s.advisorProgressState,funding},aiShopState,buffs:[...s.buffs.filter(b=>!b.id.startsWith('ai-')), ...E.createAiBuffs(aiShopState)]},cost,labCost};
}
export function cashReserve(E,s) {
 const f=E.previewNextMonthEffects(s);return Math.max(1,1-Math.min(0,f.totals.money))+(s.illnessProbability>=20?2:0);
}
export function safePayment(E,s,operation,cost,buffer=6) {
 const prepared=operation?E.consumeActiveOperation(s,operation):s;
 const quote=E.quoteSanPayment(prepared,cost);
 if(!quote.allowed||quote.sanCapCost>0)return false;
 const after=E.paySanCost(prepared,cost);
 if(after.player.money<0||after.player.san<0)return false;
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
 const conference=E.getConferenceInfo(s.month,target,s.year),thresholds=E.getReviewThresholds(target,conference.influence);
 const grades=[0,0,0];
 for(const [type,weight] of E.getReviewerWeights(s.year,E.getRoleKindReviewerBonus(s))){
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
 return probability;
}
export function stageGoal(E,s,degreeGoal) {
 const thesis=s.degree===degreeGoal?E.getThesisForecast(s):null,deadline=degreeGoal==='master'?34:70;
 if(thesis&&thesis.researchScoreMet&&thesis.currentPass)return {id:'finish',label:'毕业收尾：保留安全储备，不再购买科研用品',deadline};
 if(thesis&&thesis.stage!=='planning')return {id:'thesis',label:'毕业准备：优先补齐盲审短板与科研分',deadline};
 const transfer=s.degree==='master'&&degreeGoal==='phd'?{milestoneMonth:s.totalMonths<21?21:33,submissionDeadline:s.totalMonths<21?18:30,requiredScore:s.totalMonths<21?2:3}:{};
 if(s.totalResearchScore===0)return {id:'foundation',label:'打基础：积累阅读与加成，完成首篇可靠投稿',deadline,...transfer};
 if(s.degree==='master'&&degreeGoal==='phd')return {id:'transfer',label:'转博准备：科研分达标，同时积累长期收益',deadline,...transfer};
 return {id:'production',label:'集中产出：提高论文质量，兼顾经费和同题毕业支撑',deadline};
}
