import {FIELDS,expectedResearch,projectAi,paperReliability,cashReserve,safePayment} from './estimates.mjs';
// A bounded, public-information projection. Future random events and research
// rolls are not simulated; score expectation is integrated from the public rule.
export function planPaper(E,state,paper,{deadline=70,minProbability=.8,minScore=1,scoreNeed=Infinity,buffer=6,requiredFields,evaluate,researchQuantile=.25}={}){
 const missing=requiredFields??FIELDS.filter(f=>paper[f]<=0);
 const fields=missing.length?missing:FIELDS;
 if(!fields.length)return null;
 const proposals=[],reliabilities=new Map();
 const nextMonth=s=>{
  const f=E.previewNextMonthEffects(s),settled=f.settledState??s;
  return {...settled,player:{...f.player},totalMonths:s.totalMonths+1,month:s.month%12+1,year:s.year+Number(s.month===12),
   buffs:(f.settledState?settled.buffs:E.advanceBuffDurations(s.buffs)).filter(b=>!b.id.startsWith('ai-')),
   aiShopState:E.createAiShopState(),actionState:{...settled.actionState,used:0,aiResearchBonusUsed:false}};
 };
 const decay=p=>E.decayUnpublishedPaper({...p,prepublicationDecayRate:p.prepublicationDecayRate??.1});
 function visit(s,p,remaining,steps,cost,san,waits=0){
  if(s.totalMonths+3>deadline||s.totalMonths-state.totalMonths>6)return;
  if(!remaining.length){
   // Every projected activation must have a controller step. Claude bundles
   // are enumerated below, including activation-only completion; an implicit
   // final polish would promise scores that the recorded actions never earn.
   const finishes=[{paper:p,price:0}];
   for(const finish of finishes)for(const target of ['B','C','A']){
    const key=[s.year,s.month,target,E.getRoleKindReviewerBonus(s),...FIELDS.map(f=>finish.paper[f])].join(':');
    if(!reliabilities.has(key))reliabilities.set(key,paperReliability(E,s,finish.paper,target));
    const probability=reliabilities.get(key);
    if(probability<minProbability||E.SCORE_BY_TARGET[target]<minScore||s.totalMonths+3>deadline)continue;
    proposals.push({steps,cost:cost+finish.price,polishPrice:finish.price,san,probability,target,finishMonth:s.totalMonths,resultMonth:s.totalMonths+3,scores:FIELDS.map(f=>finish.paper[f]),utility:(Math.min(E.SCORE_BY_TARGET[target],scoreNeed)*probability*10-(cost+finish.price)*1.2-san*.12-(s.totalMonths-state.totalMonths)*2)});
   }return;
  }
  const field=remaining[0];
  // Include recovery in the complete budget. A policy that requires all three
  // operations to fit the current SAN bar will reject feasible manuscripts for
  // months, even though it could rest between the operations.
  if(waits<2&&E.getActiveOperationAllowance(s,'rest').allowed&&s.player.san<s.sanCap-1){
   const rested=E.applyRoleTalentRest(E.consumeActiveOperation(s,'rest'));
   visit(nextMonth(rested),decay(p),remaining,steps,cost,san,waits+1);
  }
  // Compare cheap time/SAN options too. Requiring GPT+DeepSeek before Gemini
  // excluded affordable two-operation batches for low-research characters.
  const modelSets=new Set();
  for(const bundle of [[],['doubao'],['gemini'],['deepseek'],['gpt'],['deepseek','gemini'],['gpt','gemini'],['gpt','deepseek'],['gpt','deepseek','doubao'],['gpt','deepseek','gemini'],['claude'],['claude','gemini'],['claude','deepseek'],['claude','gpt'],['claude','deepseek','gemini'],['claude','gpt','deepseek']]){
   const proj=projectAi(E,s,bundle,p);if(!proj||proj.state.player.money<cashReserve(E,s))continue;
   const models=Object.keys(proj.state.aiShopState.subscriptions).filter(slot=>proj.state.aiShopState.subscriptions[slot].active).sort().join(',');
   if(modelSets.has(models))continue;
   modelSets.add(models);
   const projectedRemaining=missing.length&&!requiredFields?remaining.filter(f=>proj.paper[f]<=0):remaining;
   const projectedField=projectedRemaining[0];
   const purchase=bundle.filter(x=>!s.aiShopState.subscriptions[x].active);
   const requiredModels=Object.keys(proj.state.aiShopState.subscriptions).filter(slot=>proj.state.aiShopState.subscriptions[slot].active&&['gpt','claude','deepseek','gemini','doubao'].includes(slot));
   if(!projectedField){
    if(purchase.length)visit(proj.state,proj.paper,[],[...steps,{month:s.totalMonths,field,bundle:purchase,models:requiredModels,activationOnly:true,san:0,gain:0,cost:proj.cost}],cost+proj.cost,san,waits);
    continue;
   }
   const e=expectedResearch(E,proj.state,proj.paper,projectedField);
   if(!e.allowed)continue;
   const experiment=projectedField==='experiment'?E.getResearchExperimentCostBreakdown(proj.state):{playerMoney:0,advisorFunding:0};
   // The controller uses this same safety test. Do not promise a step that
   // requires borrowing next month's recovery or cannot survive winter.
   const funded={...proj.state,player:{...proj.state.player,money:proj.state.player.money-experiment.playerMoney}};
   if(!safePayment(E,funded,projectedField,e.sanCost,buffer))continue;
   const prepared=E.consumeActiveOperation(funded,projectedField);
   const quote=E.quoteSanPayment(prepared,e.sanCost);
   if(!quote.allowed||quote.sanCapCost>0||prepared.sanCap<proj.state.sanCap)continue;
   const paid=E.paySanCost(prepared,e.sanCost);
   if(paid.player.money<cashReserve(E,s))continue;
   let next=E.consumeNextActionBuffs({...paid,advisorProgressState:{...paid.advisorProgressState,funding:paid.advisorProgressState.funding-experiment.advisorFunding}},projectedField);
   // Reviewer confidence at three mean scores ignores the research rolls that
   // still have to happen. Budget a lower quartile outcome in each field so a
   // low roll has room to miss without invalidating the entire funded route.
   let cumulative=0,projectedScore=proj.paper[projectedField]+e.improvement;
   for(const [score,weight] of [...e.distribution].sort((a,b)=>a[0]-b[0])){
    cumulative+=weight;
    if(cumulative>=researchQuantile){projectedScore=score;break;}
   }
   let copy={...proj.paper,[projectedField]:projectedScore};
   // Pending guidance settles at a month boundary and can select another draft.
   // It is not an immediate writing operation after this experiment. Budget the
   // complete manuscript without that uncredited help; replan once it arrives.
   const path=[...steps,{month:s.totalMonths,field:projectedField,bundle:purchase,models:requiredModels,san:e.sanCost,gain:projectedScore-proj.paper[projectedField],cost:proj.cost,improvementOnly:true}];
   if(projectedRemaining.length>1){
    // Spend the AI research action this month when it makes the full batch feasible.
    if(E.getActiveOperationAllowance(next,projectedRemaining[1]).allowed)visit(next,copy,projectedRemaining.slice(1),path,cost+proj.cost+experiment.playerMoney,san+e.sanCost,waits);
    next=nextMonth(next);
    copy=decay(copy);
   }
   visit(next,copy,projectedRemaining.slice(1),path,cost+proj.cost+experiment.playerMoney,san+e.sanCost,waits);
  }
 }
 if(!missing.length)for(const field of FIELDS)visit(state,paper,[field],[],0,0);
 visit(state,paper,fields,[],0,0);
 // Prefer a feasible start now. Re-optimizing a cheaper future start every
 // month otherwise keeps moving the opening date indefinitely.
 return proposals.sort((a,b)=>(a.steps[0].month-state.totalMonths)-(b.steps[0].month-state.totalMonths)||(evaluate?evaluate(b)-evaluate(a):b.utility-a.utility))[0]??null;
}
