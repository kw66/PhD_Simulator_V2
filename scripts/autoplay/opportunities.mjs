import {cashReserve, safePayment, paperReliability, FIELDS, sum} from './estimates.mjs';

// Six public monthly forecasts, with no future random events or hidden offer.
// Keep a safety margin and at least two research windows, not six idle months.
export function internshipBudget(E,s,reservedCoins=0) {
 const reserve=cashReserve(E,s)+reservedCoins;
 const offer={id:'budget-worst-case',company:'预算',position:'预算',baseMonthlyIncome:0,monthlySanCost:6,experimentBonus:4};
 let frontier=[{state:{...s,internshipState:E.activateInternship(offer)},research:0,months:[]}];
 const draft=s.papers.find(p=>p.status==='draft');
 const fields=draft?FIELDS.filter(f=>draft[f]<=0):FIELDS;
 if(!fields.length)fields.push('experiment');
 for(let month=0;month<6;month++){
  const next=[];
  for(const node of frontier){
   const current=node.state,options=[{state:current,research:node.research,action:'保留行动'}];
   if(E.getActiveOperationAllowance(current,'rest').allowed)
    options.push({state:E.applyRoleTalentRest(E.consumeActiveOperation(current,'rest')),research:node.research,action:'休息'});
   const field=fields[Math.min(node.research,fields.length-1)];
   const quote=E.previewResearchOperation(current,field,E.RESEARCH_OPERATION_SAN_COST[field]);
   if(node.research<3&&quote.allowed&&safePayment(E,current,field,quote.sanCost,8)){
    const cost=field==='experiment'?E.getResearchExperimentCostBreakdown(current):{playerMoney:0,advisorFunding:0};
    const paid=E.paySanCost(E.consumeActiveOperation(current,field),quote.sanCost);
    if(paid.player.money-cost.playerMoney>=reserve&&paid.advisorProgressState.funding>=cost.advisorFunding)
     options.push({state:E.consumeNextActionBuffs({...paid,player:{...paid.player,money:paid.player.money-cost.playerMoney},
      advisorProgressState:{...paid.advisorProgressState,funding:paid.advisorProgressState.funding-cost.advisorFunding}},field),
      research:node.research+1,action:field});
   }
   for(const option of options){
    const forecast=E.previewNextMonthEffects(option.state),settled=forecast.settledState??option.state;
    if(forecast.player.san<8||forecast.player.money<reserve)continue;
    next.push({research:option.research,months:[...node.months,{month:current.totalMonths,action:option.action,san:forecast.player.san,money:forecast.player.money}],
     state:{...settled,player:{...forecast.player},totalMonths:current.totalMonths+1,month:current.month%12+1,year:current.year+Number(current.month===12),
      internshipState:{...option.state.internshipState,remainingMonths:5-month},
      actionState:{...settled.actionState,used:0,aiResearchBonusUsed:false}}});
   }
  }
  // Keep alternatives at each production count instead of spending the entire
  // SAN bar early simply because the six-month endpoint looks attainable.
  frontier=[0,1,2,3].flatMap(count=>next.filter(n=>n.research===count)
   .sort((a,b)=>b.state.player.san-a.state.player.san||b.state.player.money-a.state.player.money).slice(0,4));
  if(!frontier.length)return {sustainable:false,reserve,months:[]};
 }
 const plan=frontier.filter(n=>n.research>=2).sort((a,b)=>b.research-a.research||b.state.player.san-a.state.player.san)[0];
 return {sustainable:Boolean(plan),reserve,researchWindows:plan?.research??0,months:plan?.months??[]};
}

// This is a window check, not a promise that a future random event will fund a
// manuscript. Count only today's unused actions and one normal action per later
// month; an existing draft may finish during thesis season, a blank one may not.
function paperOpportunity(E,s,degreeGoal,{productionTarget,productionDeadline}={}) {
 const ending=degreeGoal==='master'?34:70;
 const target=productionTarget??(s.graduationScoreTarget??(degreeGoal==='master'?1:7))+2;
 const deadline=Math.min(ending,productionDeadline??(degreeGoal==='master'?ending:60));
 const currentActions=Math.max(0,s.actionState.limit-s.actionState.used);
 const windows=lastMonth=>currentActions+Math.max(0,lastMonth-s.totalMonths);
 const blank=s.totalResearchScore<target&&s.totalMonths<=deadline-3&&windows(deadline-3)>=3;
 const fields=new Set(blank?FIELDS:[]);
 for(const paper of s.papers){
  if(!['draft','journal-reviewing'].includes(paper.status))continue;
  const journal=paper.status==='journal-reviewing';
  const lastMonth=journal?ending:ending-3;
  if(s.totalMonths>lastMonth||windows(lastMonth)<1)continue;
  const missing=FIELDS.filter(field=>paper[field]<=0);
  if(windows(lastMonth)<Math.max(1,missing.length))continue;
  const needsRevision=journal
   ?sum(paper)<E.JOURNAL_DEFINITIONS[paper.journalTarget].acceptanceScore
   :!missing.length&&paperReliability(E,s,paper,'C')<.82;
  for(const field of needsRevision?FIELDS:missing)fields.add(field);
 }
 return {needsPaper:fields.size>0,fields};
}

// Policy decisions use visible requirements and worst-case costs, never stored rolls.
// The optional final context keeps existing callers valid while letting the
// planner supply its own production target and result deadline.
export function opportunityEventPriority(E,s,e,degreeGoal,reservedCoins=0,context={}) {
 const reserve=cashReserve(E,s)+reservedCoins;
 const endingMonth=degreeGoal==='master'?34:70;
 const left=(degreeGoal==='master'?34:64)-s.totalMonths;
 const {needsPaper,fields}=paperOpportunity(E,s,degreeGoal,context);
 if(e.conferencePreview&&e.stage==='act2'){
  if(degreeGoal==='phd'&&s.degree==='master'&&s.totalResearchScore<3)
   return {id:'proxy',reason:'先保转博成果与下一篇论文预算，本次代贴，转博后再安排参会探索'};
  const {context}=e.conferencePreview,base=E.getConferenceBaseCosts(context.region);
  if((context.availableAtTotalMonths??s.totalMonths)>=endingMonth)
   return {id:'proxy',reason:'会议在本局毕业时或之后举办，无法兑现会场交流，不支付差旅'};
  const alreadyPaid=s.advisorProgressState.paidPlayerConferenceTrips?.includes(E.getConferenceTripId(context));
  const price=alreadyPaid?0:base.selfPay;
  if(left<2)return {id:'proxy',reason:'已进入毕业收尾，参会机会没有足够兑现时间'};
  if(s.player.money-price>=reserve)return {id:'self',reason:'个人现金覆盖差旅与科研储备：亲自参会积累交流及后续机会',detail:{price,reserve}};
  // Use the full raw favor cost rather than an unrevealed resistance result.
  if(s.player.favor-base.advisorCost>=6&&s.advisorProgressState.funding-price>=25)
   return {id:'advisor',reason:'个人资金留给已预算论文，导师关系与经费能承担报销参会',detail:{price,maxFavorCost:base.advisorCost}};
  return {id:'proxy',reason:'差旅会挤占论文、医疗或实验室工资储备，本次代贴'};
 }
 if(e.conferenceActivityPreview&&e.stage==='act2'){
  const encounter=s.conferenceEncounterState,career=s.conferenceCareerState;
  const hasLover=s.loverState.active,trained=encounter.bigBullCooperation||Boolean(encounter.jointTrainingReward);
  const menu=new Set(e.choices.filter(c=>!c.disabledReason).map(c=>c.id));
  const options=[];
  const add=(id,value,reason)=>{if(menu.has(id))options.push({id,value,reason});};
  const enterprise=career.enterpriseCount??0,coops=encounter.bigBull?.cooperationCount??0;
  const encounters=Math.max(0,...Object.values(encounter.scholars??{}).map(c=>c?.encounterCount??0));
  // The scholar type is hidden until selection. Do not inspect the follow-up
  // effects to know which person, resistance result or invitation will appear.
  add('tour-local',!safePayment(E,s,null,0,8)?100:2,'缺少安全恢复窗口时利用参会恢复，否则把机会用于交流成长');
  add('tea-break',s.player.social<6?90:s.player.social<12?60:8,'茶歇补社交，先解锁高级交流，再向恋爱门槛成长');
  if(!E.hasOngoingInternship(s)&&needsPaper&&left>=7){
   const eligible=E.hasPublishedAConferencePaper(s)||E.hasInternshipExperience(s);
   add('enterprise-networking',eligible?(enterprise>=1?88:69):enterprise===0&&left>=18?45:14,
    eligible?'企业交流累计联系，争取六个月实习机会':'企业交流积累联系及实验倍率，尚未满足实习论文或经历要求');
  }
  if(!trained&&left>=8)add('big-bull-coop',E.getEffectiveResearch(s)>=12?(coops>=2?91:75):coops<3&&left>=18?62:35,
   '持续与同一学者合作：积累三次交流，科研达到12后争取联培');
  if(!hasLover&&left>=8)add('opposite-scholar',E.getEffectiveSocial(s)>=12?(encounters>=2?92:78):encounters>=3?15:E.getEffectiveSocial(s)>=6&&left>=18?62:25,
   '尚无恋人：积累会场交往，社交达到12后争取发展关系；不预知学者类型');
  if(fields.has('experiment'))add('experiment-discussion',32,'已有可兑现的实验窗口，为计划中的实验积累次数加成');
  if(fields.has('idea')){
   add('idea-networking',31,'已有可兑现的idea窗口，为计划中的论文积累次数加成');
   add('famous-scholar',28,'已有可兑现的idea窗口，为计划中的论文积累倍率加成');
  }
  if(trained&&fields.has('writing'))add('big-bull-coop',30,'已有联培：继续交流为尚待完成的写作补分');
  // A late menu can omit both tea and tourism. Repeated mentor contact has
  // immediate social value; a random scholar can restore SAN with no partner.
  // Never read the generated scholar type to choose a guaranteed recovery.
  if(!needsPaper){
   if(coops>=1)add('big-bull-coop',20,'已有合作联系：本次交流可直接提升社交，不为用不到的论文加成选活动');
   if(!hasLover&&s.player.san<s.sanCap)add('opposite-scholar',10,'没有可兑现的论文加成窗口：会场交流保留随机恢复SAN的机会，不预知学者类型');
  }
  return options.sort((a,b)=>b.value-a.value)[0]??null;
 }
 if(e.chainId==='joint-training'&&e.stage==='act2')return {id:'accept',reason:'接受已争取到的联培，获得永久科研加成和成长空间，不挑隐藏支持档位'};
 if(e.loverDevelopmentPreview&&e.stage==='act2')return {id:'accept',reason:'接受已建立联系的恋爱邀约，之后安排有收益的共同活动'};
 if(e.chainId==='internship-invite'&&e.stage==='act2'){
  // The actual offer is revealed after acceptance; budget the public worst
  // case of 6 SAN/month instead of reading the pre-generated offer.
  const eligible=needsPaper&&left>=7&&s.player.san>=16&&!E.hasOngoingInternship(s);
  const budget=eligible?internshipBudget(E,s,reservedCoins):{sustainable:false};
  return {id:eligible&&budget.sustainable?'accept':'decline',
   reason:budget.sustainable?'六个月最坏待遇预算可持续且保留科研窗口，接受实习，不挑隐藏待遇':'实习六个月恢复或科研收益不足，保留毕业预算',detail:budget};
 }
 if(e.chainId==='random-5'&&e.stage==='act2'&&needsPaper&&left>=5&&s.totalResearchScore>=2
   &&!E.hasOngoingInternship(s)&&s.player.san>=16&&E.previewNextMonthEffects(s).player.san>=12
   &&(s.player.favor>=6||!E.hasInternshipExperience(s)))
  return {id:'random-5-intern',reason:'科研分已达2：申请三个月远程实习，以较轻SAN负担换收入和实验加成'};
 if(e.journalFeePreview&&e.stage==='act2'){
  const paper=s.externalPublications.find(p=>p.id===e.journalFeePreview.paperId);
  if(!paper)return null;
  const fee=E.JOURNAL_PUBLICATION_FEES[paper.journalTarget??paper.publication?.journalTarget];
  return {id:s.player.money-fee>=reserve?'self':'advisor',reason:'期刊版面费优先使用可支配个人现金，现金不足再使用导师经费',detail:{fee,reserve}};
 }
 return null;
}

// A deliberately conservative late-game option: only enter a journal when
// acceptance is already funded by existing paper scores. No stranded 75/125 draft.
export function compareVenues(E,s,p,{degreeGoal='phd',reliability=.82,reservedCoins=0,minScore=1,deadline=degreeGoal==='master'?34:70}={}) {
 if(!p||p.status!=='draft'||FIELDS.some(f=>p[f]<=0))return null;
 const conferences=['A','B','C'].map(target=>({target,probability:paperReliability(E,s,p,target),score:E.SCORE_BY_TARGET[target]}));
 const conference=s.totalMonths+3<=deadline
  ?conferences.find(c=>c.score>=minScore&&c.probability>=reliability):null;
 const wantsContacts=!s.conferenceEncounterState.jointTrainingReward||!s.loverState.active||!E.hasInternshipExperience(s);
 const reserve=cashReserve(E,s)+reservedCoins;
 const journals=Object.values(E.JOURNAL_DEFINITIONS).map(j=>({...j,ready:sum(p)>=j.acceptanceScore,
  payable:s.player.money-E.JOURNAL_PUBLICATION_FEES[j.id]>=reserve||s.advisorProgressState.funding-E.JOURNAL_PUBLICATION_FEES[j.id]>=25}));
 const journal=degreeGoal==='phd'&&s.degree==='phd'&&s.year>=4
  ?journals.filter(j=>j.ready&&j.payable).sort((a,b)=>b.researchScore-a.researchScore)[0]:null;
 const detail={paperScore:sum(p),conference,conferences,journals:journals.map(j=>({id:j.id,acceptanceScore:j.acceptanceScore,ready:j.ready,payable:j.payable})),wantsContacts};
 // A high-confidence A offers 5 points plus an in-person opportunity. Keep
 // it while relationships still need time; otherwise the journal avoids review risk.
 if(journal&&(!conference||journal.researchScore>conference.score||conference.probability<.95||!wantsContacts||s.year>=6))
  return {action:'submit-journal-paper',payload:{paperId:p.id,journalTarget:journal.id},
   reason:'比较会议录用概率、三个月等待及交流机会：稿件已达到期刊录用线，版面费可承担，选择确定性发表',detail};
 return conference?{action:'submit-paper',payload:{paperId:p.id,paperTarget:conference.target},
  reason:'比较会议与期刊：选择录用概率达标的会议，保留参会交流机会；不把仅达送审线的期刊当作成果',detail:{...detail,reviewerQuality:conference.probability}}:null;
}

export function planLoverActivity(E,s,reservedCoins=0) {
 if(!s.loverState.active||!s.loverProgressState.active||s.year>=6)return null;
 const options=[];
 for(const route of ['study','play']){
  if(E.getLoverDateFailure(s,route))continue;
  const cost=E.getLoverRouteCost(s,route),gain=E.getLoverRouteGain(s,route);
  if(gain<=0||s.player.money-cost.money<cashReserve(E,s)+reservedCoins)continue;
  if(cost.san>0&&(s.player.san<20||!safePayment(E,s,null,cost.san,12)))continue;
  const progress=E.getLoverRouteProgress(s,route),passive=E.getLoverPassiveGains(s)[route];
  const cycle=(s.loverProgressState.routes?.[route]?.completed??0)%3;
  if(route==='study'&&cycle===0&&s.loverProgressState.pendingPaperHelp
   &&!s.papers.some(p=>['draft','journal-reviewing'].includes(p.status)))continue;
  const months=Math.min(12,60-s.totalMonths),remaining=Math.max(0,100-progress-passive*months);
  const pushes=Math.ceil(remaining/Math.max(1,gain));
  if(pushes>months||progress+gain<100&&pushes>4)continue;
  // Passive completion already due next month needs no spending this month.
  if(progress+passive>=100&&progress+gain<100)continue;
  options.push({action:'lover-'+route,payload:{},reason:route==='study'
   ?'共同学习：结合被动进度补足可完成的路线，获得论文帮助与长期成长'
   :'约会玩耍：以可支配现金补足路线，争取恢复和长期SAN收益',
   detail:{progress,gain,cost,nextReward:E.getLoverNextReward(s,route)},value:(progress+gain>=100?50:0)+gain/(cost.san+cost.money*2+1)});
 }
 return options.sort((a,b)=>b.value-a.value)[0]??null;
}
