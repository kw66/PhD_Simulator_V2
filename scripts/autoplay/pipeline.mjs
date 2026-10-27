import {FIELDS,expectedResearch,projectAi,paperReliability,cashReserve} from './estimates.mjs';
// A bounded, public-information projection. Future random events and research
// rolls are not simulated; score expectation is integrated from the public rule.
export function planPaper(E,state,paper,{deadline=70,minProbability=.8}={}){
 const missing=FIELDS.filter(f=>paper[f]<=0);
 const fields=missing.length?missing:FIELDS.filter(f=>expectedResearch(E,state,paper,f).improvement>=4);
 if(!fields.length)return null;
 const proposals=[];
 function visit(s,p,remaining,steps,cost,san){
  if(!remaining.length){
   for(const target of ['B','C','A']){
    const probability=paperReliability(E,s,p,target);
    if(probability<minProbability||s.totalMonths+3>deadline)continue;
    proposals.push({steps,cost,san,probability,target,finishMonth:s.totalMonths,resultMonth:s.totalMonths+3,scores:FIELDS.map(f=>p[f]),utility:(E.SCORE_BY_TARGET[target]*probability*10-cost*1.2-san*.12-(s.totalMonths-state.totalMonths)*2)});
   }return;
  }
  if(remaining[0]==='writing'&&p.writing>0)return visit(s,p,remaining.slice(1),steps,cost,san);
  const field=remaining[0];
  for(const bundle of [[],['deepseek'],['gpt'],['gpt','deepseek'],['gpt','deepseek','gemini']]){
   const proj=projectAi(E,s,bundle);if(!proj||proj.state.player.money<cashReserve(E,s))continue;
   const e=expectedResearch(E,proj.state,p,field);
   if(!e.allowed)continue;
   const experiment=field==='experiment'?E.getResearchExperimentCostBreakdown(proj.state):{playerMoney:0,advisorFunding:0};
   const prepared=E.consumeActiveOperation({...proj.state,player:{...proj.state.player,money:proj.state.player.money-experiment.playerMoney}},field);
   const quote=E.quoteSanPayment(prepared,e.sanCost);
   if(!quote.allowed||quote.sanCapCost>0||prepared.sanCap<proj.state.sanCap)continue;
   const paid=E.paySanCost(prepared,e.sanCost);
   if(paid.player.san<8||paid.player.money<Math.max(3,cashReserve(E,s)))continue;
   let next=E.consumeNextActionBuffs({...paid,advisorProgressState:{...paid.advisorProgressState,funding:paid.advisorProgressState.funding-experiment.advisorFunding}},field);
   let copy={...p,[field]:p[field]+e.improvement};
   if(field==='experiment'&&next.advisorProgressState.pendingGuidanceToPlayer!=null){const help=E.getAdvisorGuidanceScores(next,next.advisorProgressState.pendingGuidanceToPlayer);for(const f of FIELDS)copy[f]+=help[f]??0;next={...next,advisorProgressState:{...next.advisorProgressState,pendingGuidanceToPlayer:null}};}
   const path=[...steps,{month:s.totalMonths,field,bundle:bundle.filter(x=>!s.aiShopState.subscriptions[x].active),san:e.sanCost,gain:e.improvement,cost:proj.cost}];
   if(remaining.length>1){
    // Spend the AI research action this month when it makes the full batch feasible.
    if(E.getActiveOperationAllowance(next,remaining[1]).allowed)visit(next,copy,remaining.slice(1),path,cost+proj.cost+experiment.playerMoney,san+e.sanCost);

    const f=E.previewNextMonthEffects(next);
    next={...next,player:{...f.player},totalMonths:s.totalMonths+1,month:s.month%12+1,year:s.year+Number(s.month===12),buffs:E.advanceBuffDurations(next.buffs).filter(b=>!b.id.startsWith('ai-')),aiShopState:E.createAiShopState(),actionState:{...s.actionState,used:0,aiResearchBonusUsed:false}};
    copy={...copy,...Object.fromEntries(FIELDS.map(f=>[f,copy[f]>1?Math.max(1,copy[f]-Math.ceil(copy[f]*(p.prepublicationDecayRate??.1))):copy[f]]))};
   }
   visit(next,copy,remaining.slice(1),path,cost+proj.cost+experiment.playerMoney,san+e.sanCost);
  }
 }
 visit(state,paper,fields,[],0,0);
 return proposals.sort((a,b)=>b.utility-a.utility)[0]??null;
}
