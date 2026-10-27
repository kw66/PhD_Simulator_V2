import {planPaper} from './pipeline.mjs';
import {relationshipEventPriorities,planCooperation,planLabProject,optionalEventSanCost,canBudgetOptionalEvent} from './relationships.mjs';
import {opportunityEventPriority,compareVenues,planLoverActivity} from './opportunities.mjs';
import { FIELDS,sum,expectedResearch,projectAi,cashReserve,safePayment,paperReliability,stageGoal,teachingProfile } from './estimates.mjs';
const choice=(action,payload,reason,detail={})=>({action,payload,reason,detail});
export function createPlanner(E, {degreeGoal='phd',config={}}={}) {
 config={chairAfter:1,ideaTarget:12,...config};
 const opened=new Map(),rerolls=new Map();let committed=null,readingMonth=-1,paperCommitment=null;
 function chairWorthSaving(s,goal){
  const price=E.getShopActionPrice(s,'buy-shop-item',{shopItemId:'chair'}),work=E.previewPartTimeWork(s);
  const left=goal.deadline-s.totalMonths;
  return !s.shopState.chairOwned&&s.totalMonths>=config.chairAfter&&left>=10&&price!==null
   &&left*.8>price*Math.max(1,work.sanCost/Math.max(1,work.moneyReward))*1.2;
 }
 function safe(s,op,cost,buffer=config.sanBuffer??6){return safePayment(E,s,op,cost,buffer);}
 function buy(s,id,payload,reason,detail={}){const cost=E.getShopActionPrice(s,id,payload),lab=E.getShopLabFundingCost(s,id,payload);
  const reserve=['chair','monitor'].includes(payload.shopItemId)&&s.totalMonths<=12?1:cashReserve(E,s);
  if(cost===null||s.player.money-cost<reserve||s.advisorProgressState.funding<lab)return null;
  // Spending lab money must retain payroll/experiment room, unless the purchase is free.
  if(lab>0&&s.advisorProgressState.funding-lab<Math.min(20,s.advisorProgressState.funding))return null;
  return choice(id,payload,reason,{cost,lab,...detail});
 }
 function event(s) {
  const queued=s.eventQueue.find(x=>x.id.startsWith('illness-'))??s.eventQueue.find(x=>x.source==='review')??s.eventQueue.find(x=>['result','act3'].includes(x.stage))??s.eventQueue[0];
  const e=E.getResolvableQueuedEvent(s,queued);let pool=e.choices.filter(c=>!c.disabledReason);
  if(['random-17','random-18'].includes(e.chainId)&&e.stage==='act2'){
   // These result effects contain public, fixed multipliers, not hidden rolls.
   const options=pool.map(c=>{
    const resolution=c.effects.enqueueEvents?.flatMap(result=>result.choices)
     .map(finish=>finish.effects.paperCompetitionResolution).find(Boolean);
    if(!resolution)return null;
    const preview=E.previewPaperCompetitionResolution(s,resolution);
    if(!preview.applicable)return null;
    // In-review scores are frozen: preservation only helps if that submission
    // is rejected, so do not sacrifice the next draft for an accepted paper.
    const value=preview.paper.status==='reviewing'?1-paperReliability(E,s,{
     ...preview.paper,...Object.fromEntries(FIELDS.map(f=>[f,preview.paper['submitted'+f[0].toUpperCase()+f.slice(1)]??preview.paper[f]]))
    },preview.paper.target):1;
    return {c,...preview,value:preview.score*value-preview.sanCost*1.5};
   }).filter(Boolean).sort((a,b)=>b.value-a.value);
   const selected=options.find(o=>safe(s,null,o.sanCost,8));
   if(selected)return choice('resolve-event',{eventId:e.id,eventChoiceId:selected.c.id},
    '论文竞争：比较公开分数保留与真实SAN支出，保护已有投入；在审稿件按拒稿后的重投价值评估',
    {paperId:selected.paper.id,score:selected.score,sanCost:selected.sanCost});
  }
  // Project SAN is a public fixed cost. Risk labels only warn about crossing
  // zero; they do not reserve enough SAN for the player's own manuscript.
  if(e.chainId==='random-4'&&e.stage==='act2'){
   const available=pool.filter(c=>!E.getEventChoiceRiskDetails(s,e,c));
   const projectPrefix=c=>['horizontal','vertical','share'].map(id=>'random-4-'+id).find(id=>c.id.startsWith(id+'-'));
   const budgeted=available.filter(c=>canBudgetOptionalEvent(E,s,optionalEventSanCost(E,s,projectPrefix(c),c),paperCommitment));
   const ranked=[...(s.player.favor<=2?['share']:[]),s.advisorProgressState.funding<20?'horizontal':'vertical','vertical','horizontal','share','reject'];
   const selected=ranked.map(id=>budgeted.find(c=>c.id.startsWith('random-4-'+id+'-'))).find(Boolean);
   if(selected)return choice('resolve-event',{eventId:e.id,eventChoiceId:selected.id},'导师项目按公开SAN支出和次月预告选择，保留自身科研预算',{sanCost:optionalEventSanCost(E,s,projectPrefix(selected),selected)});
   if(E.getActiveOperationAllowance(s,'rest').allowed&&s.player.san<s.sanCap)return choice('rest',{},'导师项目的安全选项SAN不足，先恢复再决定，避免低好感下被迫透支');
  }
  const risks=pool.map(c=>({c,r:({certain:2,possible:1}[E.getEventChoiceRiskDetails(s,e,c)?.risk]??0)}));
  const safest=Math.min(...risks.map(x=>x.r));pool=risks.filter(x=>x.r===safest).map(x=>x.c);
  const pick=prefix=>pool.find(c=>c.id===prefix||c.id.startsWith(prefix+'-'));
  // Act2 defers the actual payment to its result, so effects.san is often 0.
  // Quote the public fixed preparation cost, never the hidden attendance roll.
  const eventSanCost=(prefix,c)=>optionalEventSanCost(E,s,prefix,c);
  const canBudget=prefix=>{const c=pick(prefix);if(!c)return false;
   const cost=eventSanCost(prefix,c);
   // Early research growth improves every later manuscript and its SAN price;
   // unlike optional mentoring, this is itself part of the PhD research budget.
   if(prefix==='random-6-series'&&degreeGoal==='phd'&&E.getEffectiveResearch(s)<6)return safe(s,null,cost,8);
   return canBudgetOptionalEvent(E,s,cost,paperCommitment);
  };
  if(e.chainId==='random-6'&&e.stage==='act2'&&s.player.favor<=2){
   const series=pick('random-6-series'),seriesCost=eventSanCost('random-6-series',series);
   if(growingForResearch(s)&&series&&safe(s,null,seriesCost,8))return choice('resolve-event',{eventId:e.id,eventChoiceId:series.id},'低好感组会仍优先可负担的系列论文：同时提升科研并保护导师关系',{cost:seriesCost});
   const deep=pick('random-6-deep'),cost=eventSanCost('random-6-deep',deep);
   // Advisor attendance is random. Never rely on a pre-rolled absence to make
   // slacking safe at zero favor; recover for the fixed-cost preparation.
   if(deep&&safe(s,null,cost,6))return choice('resolve-event',{eventId:e.id,eventChoiceId:deep.id},'导师好感处于危险区：认真准备保住关系，不赌导师缺席',{cost});
   if(E.getActiveOperationAllowance(s,'rest').allowed&&s.player.san<s.sanCap)return choice('rest',{},'低好感组会先恢复准备所需SAN，避免冒险敷衍导致退学');
  }
  // Never submit a real message during automated play.
  if(e.chainId==='midterm-message')return choice('resolve-event',{eventId:e.id,eventChoiceId:'midterm-message-skip'},'教学模拟不向公共留言板发送自动消息');
  if(pool.length>1&&s.player.san<5&&E.getActiveOperationAllowance(s,'rest').allowed&&E.getRoleRestSanGain(s)>0)return choice('rest',{},'处理事件前恢复SAN，保留应急空间');
  const growing=s.year<(degreeGoal==='master'?3:6),funding=s.advisorProgressState.funding;
  const reservedCoins=paperCommitment?(paperCommitment.steps.reduce((n,step)=>n+(step.cost??0),0)+(paperCommitment.polishPrice??0)):0;
  const eventReserve=cashReserve(E,s)+reservedCoins;
  const opportunity=opportunityEventPriority(E,s,e,degreeGoal,reservedCoins);
  const opportunityChoice=opportunity&&pick(opportunity.id);
  if(opportunityChoice)return choice('resolve-event',{eventId:e.id,eventChoiceId:opportunityChoice.id},opportunity.reason,opportunity.detail);
  if(e.chainId==='random-16'&&e.stage==='act2'){
   const money=pick('random-16-pay'),san=pick('random-16-stay-up');
   const invested=s.papers.filter(p=>p.status==='draft').reduce((n,p)=>n+sum(p),0);
   const cost=eventSanCost('random-16-stay-up',san);
   const selected=money&&invested>=8&&s.player.money>=3+eventReserve?money:
    san&&canBudgetOptionalEvent(E,s,cost,paperCommitment,6)?san:money&&s.player.money>=3?money:pick('random-16-restart');
   if(selected)return choice('resolve-event',{eventId:e.id,eventChoiceId:selected.id},'数据丢失：比较3金币恢复和实际SAN消耗，保护已投入的稿件，避免无谓清零',{invested,cost});
  }
  const priorities=[...relationshipEventPriorities(E,s,degreeGoal,reservedCoins,paperCommitment),'before-grad-school-open-advisor-info','before-grad-school-confirm','before-grad-school-finish','mentor-assign-select-4',degreeGoal==='master'?'continue-master':'transfer-phd','proxy','rest','teachers-day-message',
    s.totalResearchScore>=(s.year===2?2:4)?'scholarship-apply':'scholarship-skip',
    s.player.san>=16&&growing?'summer-vacation-research':'summer-vacation-home',
    s.player.san<8?'year-summary-sleep':s.player.money<cashReserve(E,s)+8?'year-summary-part-time':s.player.favor<6&&growing?'year-summary-favor':'year-summary-sleep',
    growing&&canBudget('random-1-self')&&(s.degree==='phd'?s.player.favor<8||s.fellowProgressState.length<2:s.player.favor<4)?'random-1-self':s.player.favor<=2?'random-1-delegate':'random-1-refuse',
    growing&&canBudget('random-2-self')?'random-2-self':s.player.favor<=2?'random-2-delegate':'random-2-refuse',
    funding<20&&s.player.san>=14?'random-4-horizontal':s.player.san>=10?'random-4-vertical':s.player.social>=3?'random-4-share':'random-4-reject',
    s.player.favor>=6&&growing?'random-5-ask':'random-5-report',
    growing&&canBudget('random-6-series')?'random-6-series':growing&&s.player.favor<3&&canBudget('random-6-deep')?'random-6-deep':'random-6-slack',
    s.player.social<6&&s.player.san>=14&&growing?'random-7-ktv':'random-7-badminton',
    !s.shopState.chairOwned&&funding>=25?'random-8-renovate':'random-8-salary',
    E.getEffectiveResearch(s)<6?'random-9-basic':'random-9-code',
    s.fellowProgressState.length<2&&s.player.san>=12&&growing?'random-10-short-term':s.player.san>=8?'random-10-exchange':'random-10-reject',
    s.fellowProgressState.length<2&&s.player.san>=12&&growing?'random-11-deep':'random-11-light',
    s.player.favor>=6?'random-12-complain':canBudget('random-12-argue')?'random-12-argue':'random-12-complain','random-13-report','random-14-decline',growing&&s.player.san>=12?'random-15-magic-tower':'random-15-grad-sim',
    s.player.money>eventReserve+6?'random-16-pay':s.player.san>=14?'random-16-stay-up':'random-16-restart',
    'random-17-ignore','random-18-ignore','random-19-travel',growing&&s.player.favor>=6&&funding>=E.getCcigSelfPayCost(s).actualCost+10?'ccig-advisor':growing&&s.player.money>=E.getCcigSelfPayCost(s).actualCost+1?'ccig-self':'ccig-skip','ccig-activity-listen'];
  if(e.id.startsWith('illness-'))priorities.unshift(s.player.money>=cashReserve(E,s)+5?'illness-hospital':'illness-rest');
  let selected;
  if(e.id.startsWith('illness-')){const price=e.id.includes('stomach')?3:e.id.includes('flu')?4:5;selected=pool.find(c=>c.id.includes(s.player.money>=price?'-hospital-':e.id.includes('stomach')&&s.player.money>=1?'-medicine-':'-rest-'));}
  selected??=priorities.map(pick).find(Boolean)??pool.find(c=>!/reroll|fake|cheat/.test(c.id))??pool[0];
  if(!selected)throw Error('No safe event choice '+e.id);
  return choice('resolve-event',{eventId:e.id,eventChoiceId:selected.id},`${e.title}：${selected.label}；结合当前SAN、现金、成长阶段选择`,{risk:safest});
 }
 function reserveForGrowth(s){return cashReserve(E,s)+24;}
 function growingForResearch(s){return s.year<(degreeGoal==='master'?3:6)&&E.getEffectiveResearch(s)<12;}
 function equipment(s,goal){
  if(goal.id==='finish')return null;
  const left=goal.deadline-s.totalMonths,season=E.getSeasonByMonth(s.month),list=[];
  // SAN per coin relative to current rest/work alternatives; conservative demand horizon.
  const work=E.previewPartTimeWork(s),rest=E.getRoleRestSanGain(s);
  const sanPerCoin=Math.max(1,work.sanCost/Math.max(1,work.moneyReward));
  const add=(id,payload,benefit,reason)=>{const q=buy(s,id,payload,reason,{expectedSanSaved:benefit,horizon:left});if(q&&benefit>q.detail.cost*sanPerCoin*1.2)list.push({...q,value:benefit/Math.max(1,q.detail.cost)});};
  if(!s.shopState.chairOwned&&left>=10&&(s.totalMonths>=(config.chairAfter??0)||s.totalResearchScore>0))add('buy-shop-item',{shopItemId:'chair'},left*.8,'购置办公椅：持续回SAN减少后续休息，占用现金有足够回本期');
  if(s.shopState.chairOwned&&!s.eventSupport.hasDownJacket&&s.month<=6&&left>=9)add('buy-shop-item',{shopItemId:'down_jacket'},Math.floor(left/12)*3+(s.month<=4?3:7-s.month),'入冬前/冬季保暖：免除冬季固定SAN损失，按剩余冬月计回报');
  if(s.shopState.chairOwned&&!s.shopState.monitorOwned&&goal.id!=='thesis'&&left>=15)add('buy-shop-item',{shopItemId:'monitor'},Math.min(30,left*.65),'购置显示器：后续阅读积累频繁，每次省1SAN');
  if(s.shopState.chairOwned&&!s.eventSupport.hasParasol&&s.month>=7&&s.month<=11&&left>=10)add('buy-support-item',{supportItemId:'parasol'},Math.floor(left/12)*4+Math.max(0,13-Math.max(s.month,10))*1.5,'夏季操作加耗：遮阳伞按未来夏季科研/阅读次数回本');
  if(s.shopState.chairOwned&&!s.shopState.chairUpgrade&&left>=18){
   const missing=Math.max(0,s.sanCap-Math.min(s.player.san,s.sanCap*.65));
   if(missing*.2>1.7)add('upgrade-shop-item',{shopUpgradeId:'chair-massage'},Math.min(left,24)*(missing*.2-1),'按摩椅按缺失SAN恢复；只在超过原椅收益且剩余月份够回本时升级');
   else add('upgrade-shop-item',{shopUpgradeId:'chair-advanced'},Math.min(left,30),'人体工学椅：相比原椅每月多恢复1SAN，评估剩余回本期');
  }
  if(!s.shopState.keyboardOwned&&left>=18&&s.degree==='phd')add('buy-shop-item',{shopItemId:'keyboard'},Math.min(left*.25,12),'键盘只在后续有足够写作次数时购买');
  return list.sort((a,b)=>b.value-a.value)[0]??null;
 }
 function researchPlan(s,p) {
  const candidates=[];
  const slots=[[],['deepseek'],['gpt'],['gpt','deepseek'],['gemini'],['gpt','deepseek','doubao'],['gpt','deepseek','gemini']];
  for(const bundle of slots){
   const projection=projectAi(E,s,bundle);if(!projection)continue;
   let v=projection.state,copy={...p},steps=[],value=0;
   if(v.player.money<cashReserve(E,s))continue;
   for(let n=0;n<3;n++){
    const required=FIELDS.find(f=>copy[f]<=0);
    const choices=FIELDS.filter(f=>(!required||f===required)&&(f==='idea'||f==='experiment'&&copy.idea>0||f==='writing'&&copy.experiment>0)).map(field=>({field,...expectedResearch(E,v,copy,field)}))
     .filter(x=>x.allowed&&x.improvement>=2&&safe(v,x.field,x.sanCost));
    const c=choices.sort((a,b)=>{
     const priority=x=>(copy[x.field]<=0?20:0)+x.improvement/Math.max(1,x.sanCost);
     return priority(b)-priority(a);
    })[0];if(!c)break;
    const ex=c.field==='experiment'?E.getResearchExperimentCostBreakdown(v):{playerMoney:0,advisorFunding:0};
    if(v.player.money-ex.playerMoney<1)break;
    v=E.paySanCost(E.consumeActiveOperation(v,c.field),c.sanCost);
    v={...v,player:{...v.player,money:v.player.money-ex.playerMoney},advisorProgressState:{...v.advisorProgressState,funding:v.advisorProgressState.funding-ex.advisorFunding}};
    v=E.consumeNextActionBuffs(v,c.field);copy[c.field]+=c.improvement;
    value+=c.improvement;steps.push({field:c.field,san:c.sanCost,gain:c.improvement});
   }
   if(!steps.length)continue;
   const missing=bundle.filter(slot=>!s.aiShopState.subscriptions[slot].active);
   // Count each planned operation and cash opportunity cost, not just 'can afford'.
   candidates.push({bundle:missing,cost:projection.cost,labCost:projection.labCost,steps,value,utility:value-steps.reduce((n,x)=>n+x.san,0)*.6-projection.cost*1.2-projection.labCost*.3});
  }
  const base=candidates.find(c=>!c.bundle.length);
  return candidates.filter(c=>!c.bundle.length||(c.value-(base?.value??0))>=Math.max(1,c.cost*1.2+c.labCost*.3)).sort((a,b)=>b.utility-a.utility)[0]??null;
 }
 function next(s){
  const goal=stageGoal(E,s,degreeGoal),decorate=d=>d&&({...d,stage:goal.id,goal:goal.label,season:E.getSeasonByMonth(s.month),forecast:E.previewNextMonthEffects(s).player});
  if(s.eventQueue.length){committed=null;return decorate(event(s));}
  if(s.totalMonths===0)return decorate(choice('next-month',{},'完成入学，开始第一学期'));
  const forecast=E.previewNextMonthEffects(s),regular=E.getActiveOperationAllowance(s,'read').allowed;
  const restGain=E.getRecoveredSan(s.player.san,s.sanCap,E.getRoleRestSanGain(s),s.selectedRoleId)-s.player.san;
  const rest=(why)=>regular&&restGain>0?choice('rest',{},why,{gain:restGain}):null;
  const coffee=()=>{const price=E.getShopActionPrice(s,'buy-coffee',{}),gain=E.getRecoveredSan(s.player.san,s.sanCap,E.getCoffeeSanGain(s.coffeeState),s.selectedRoleId)-s.player.san;
   return price!==null&&price<=s.player.money-1&&gain>0&&s.coffeeState.coffeePurchaseCountThisMonth===0?choice('buy-coffee',{},'应急恢复：普通行动不足以把下一月SAN维持安全',{price,gain}):null;};
  if(forecast.player.san<8){const recovery=rest('跨月预警：优先恢复SAN，防止负SAN和疾病累积')??coffee();if(recovery)return decorate(recovery);}
  const readyJournal=s.papers.find(p=>p.status==='journal-reviewing'&&!E.getJournalSubmissionFailure(p,p.journalTarget));
  if(readyJournal)return decorate(choice('submit-journal-paper',{paperId:readyJournal.id,journalTarget:readyJournal.journalTarget},'期刊已达到录用线：确认发表后再计算科研分与毕业条件'));
  // Complete an already funded publication even if other work meets graduation.
  // Do not consume the first-month normal recovery at full SAN unnecessarily.
  if(goal.id==='finish')return decorate(rest('毕业条件已满足，保持SAN与健康，不再买科研用品')??choice('next-month',{},'已完成科研和盲审要求，推进毕业流程'));
  const thesis=s.degree===degreeGoal?E.getThesisForecast(s):null;
  if(s.degree==='phd'&&s.year>=5&&s.month<=7&&s.shopState.chairOwned&&!s.shopState.chairUpgrade&&!thesis?.projectedPass&&s.player.money>=16){const q=buy(s,'upgrade-shop-item',{shopUpgradeId:'chair-hammock'},'为毕业论文密集推进配置吊床：至少使用五次休息，每次多恢复3SAN',{minimumRestsToUse:5,extraSanPerRest:3});if(q)return decorate(q);}
  const masterNeedsPaper=s.degree==='master'&&degreeGoal==='master'&&!thesis?.researchScoreMet
   &&!s.papers.some(p=>p.status==='reviewing')&&s.month<=3;
  if(thesis&&thesis.stage==='writing'&&!thesis.currentPass&&!masterNeedsPaper&&E.getThesisAdvanceGain(s)>0){
   const projection=thesis.points.map(point=>point.score),remaining=thesis.points.map(point=>point.remainingAdvances),needed=projection.map(()=>0);
   let required=0;
   while(E.getGuaranteedThesisScore(s.degree,projection)<thesis.threshold&&required<21){
    const index=projection.reduce((best,score,index)=>remaining[index]>needed[index]&&(best<0||score<projection[best])?index:best,-1);
    if(index<0)break;
    projection[index]+=thesis.advanceGain;needed[index]++;required++;
   }
   const alreadyUsed=thesis.points.filter(point=>point.lastAdvancedTotalMonths===s.totalMonths).length;
   const monthQuota=Math.ceil((required+alreadyUsed)/Math.max(1,8-s.month));
   const points=s.thesis.researchPoints.map((p,i)=>({...p,i})).filter(p=>!E.getThesisAdvanceFailure(s,p.i)&&needed[p.i]>0).sort((a,b)=>a.score-b.score);
   const pacingSafe=E.getGuaranteedThesisScore(s.degree,projection)>=thesis.threshold;
   const point=pacingSafe&&alreadyUsed>=monthQuota?null:points[0];
   if(point&&!safe(s,null,E.getThesisAdvanceSanCost(s),5)){const r=rest('本月毕业论文尚有推进额度，恢复后继续，不丢失无法补回的月度次数');if(r)return decorate(r);const c=coffee();if(c)return decorate(c);}
   if(point&&safe(s,null,E.getThesisAdvanceSanCost(s),5))return decorate(choice('advance-thesis-point',{thesisPointIndex:point.i},'按剩余月份分配毕业论文推进，补最弱点并避免无须提前的集中消耗',{guaranteed:thesis.currentGuaranteedScore,target:thesis.threshold,gain:thesis.advanceGain,remainingAdvancesNeeded:required,monthQuota,alreadyUsed}));
  }
  // All degrees share the full-manuscript budget and equipment planning.
  // Reserve a complete manuscript, not merely the next profitable-looking operation.
  // Events can interrupt the schedule, but never silently replace its cash/SAN
  // reservation with shopping, unrelated work, or another idea operation.
  if(paperCommitment&&s.totalMonths>paperCommitment.finishMonth+2)paperCommitment=null;
  if(paperCommitment){
   const manuscript=s.papers.find(q=>q.status==='draft'&&(paperCommitment.paperId==null||q.id===paperCommitment.paperId));
   if(!manuscript)paperCommitment=null;
   else {
    paperCommitment.paperId=manuscript.id;
    while(paperCommitment.steps.length&&manuscript[paperCommitment.steps[0].field]>0)paperCommitment.steps.shift();
    const missing=FIELDS.find(field=>manuscript[field]<=0);
    if(missing&&paperCommitment.steps[0]&&FIELDS.indexOf(missing)<FIELDS.indexOf(paperCommitment.steps[0].field)){
     paperCommitment=planPaper(E,s,manuscript,{deadline:s.degree==='master'&&degreeGoal==='phd'?(s.totalMonths<18?21:33):goal.deadline,minProbability:.85});
    }
    let step=paperCommitment?.steps[0];
    if(!step)paperCommitment=null;
    else {
     let requiredModels=step.models??step.bundle;
     let projected=projectAi(E,s,requiredModels,manuscript);
     // After an event or a month boundary, replace unaffordable historical
     // packages with a complete plan from today's visible resources.
     if((!projected||projected.state.player.money<cashReserve(E,s)||s.totalMonths>step.month)&&!step.activationOnly){
      const revised=planPaper(E,s,manuscript,{deadline:s.degree==='master'&&degreeGoal==='phd'?(s.totalMonths<18?21:33):goal.deadline,minProbability:.88});
      if(revised?.steps.length){paperCommitment={...revised,paperId:manuscript.id};step=paperCommitment.steps[0];requiredModels=step.models??step.bundle;projected=projectAi(E,s,requiredModels,manuscript);}
     }
     const quote=projected&&!step.activationOnly&&expectedResearch(E,projected.state,projected.paper??manuscript,step.field);
     const rationale={field:step.field,target:paperCommitment.target,plannedFinish:paperCommitment.finishMonth,reservedCoins:paperCommitment.cost,plannedScores:paperCommitment.scores};
     if(step.month>s.totalMonths){
      if(regular){const recovery=rest('保留已规划的下月模型批次：本月恢复，不提前拆开购买并让模型过期');if(recovery)return decorate(recovery);}
      return decorate(choice('next-month',{},'按整篇预算等待计划月份，同月完成配套模型的科研批次',rationale));
     }
     if(step.activationOnly){
      const ai=requiredModels.find(slot=>!s.aiShopState.subscriptions[slot].active);
      if(ai){const purchase=buy(s,'buy-ai-month',{aiSlotId:ai},'即时润色补全论文缺项，按当前整篇预算购买',rationale);if(purchase)return decorate(purchase);}
     }
     if(quote?.allowed&&(step.field!=='experiment'||s.player.money>=E.getResearchExperimentCostBreakdown(s).playerMoney)&&projected.state.player.money>=cashReserve(E,s)&&safe(projected.state,step.field,quote.sanCost,6)){
      const ai=requiredModels.find(slot=>!s.aiShopState.subscriptions[slot].active);
      if(ai){const purchase=buy(s,'buy-ai-month',{aiSlotId:ai},'兑现整篇预算：仅购买本次缺项操作已验证需要的模型',rationale);if(purchase)return decorate(purchase);}
      else return decorate(choice('research-paper',{paperId:manuscript.id,paperActionType:step.field},'按整篇承诺顺序完成缺项，保留后续实验和写作所需资源',rationale));
     }
     if(projected&&quote?.allowed&&!safe(projected.state,step.field,quote.sanCost,6)&&s.coffeeState.coffeePurchaseCountThisMonth===0){
      const price=E.getShopActionPrice(s,'buy-coffee',{}),gain=E.getRecoveredSan(s.player.san,s.sanCap,E.getCoffeeSanGain(s.coffeeState),s.selectedRoleId)-s.player.san;
      const recovered=price===null?null:{...s,player:{...s.player,san:s.player.san+gain,money:s.player.money-price}};
      const recoveryPlan=recovered&&projectAi(E,recovered,requiredModels);
      if(gain>0&&recoveryPlan&&recoveryPlan.state.player.money>=cashReserve(E,s)+2&&safe(recoveryPlan.state,step.field,quote.sanCost,6))return decorate(choice('buy-coffee',{},'咖啡使已预算的缺项科研本月可完成：用现金缩短草稿衰减，保留模型与医疗费用',{...rationale,price,gain,sanCost:quote.sanCost}));
     }
     if(!projected||projected.state.player.money<cashReserve(E,s)){
      const work=E.previewPartTimeWork(s);
      if(work.allowed&&safe(s,'work',work.sanCost,8))return decorate(choice('part-time-work',{},'医疗或事件占用了预留资金：定向补回本篇缺项模型预算',{...rationale,netIncome:work.moneyReward}));
     }
     if(regular){const recovery=rest('论文批次被事件影响：优先恢复缺项操作预算，保留全部科研资金');if(recovery)return decorate(recovery);}
     // Only revisit the plan after the deadline becomes impossible or its model
     // is no longer affordable, using current visible state.
     if(step.activationOnly||s.totalMonths>paperCommitment.finishMonth+2||!projected)paperCommitment=null;
     else return decorate(choice('next-month',{},'本月缺项操作暂不可行，保留科研预算等待下月常规行动',rationale));
    }
   }
  }
  const remaining=goal.deadline-s.totalMonths,scoreGoal=s.degree==='master'&&degreeGoal==='phd'?s.year<=2?2:3:(s.graduationScoreTarget??(degreeGoal==='master'?1:7));
  const thesisBudget=s.degree==='phd'?E.getThesisForecast({...s,year:Math.max(5,s.year)}):null;
  const profile=teachingProfile(E,s);
  const productionTarget=s.degree==='master'&&degreeGoal==='phd'?scoreGoal+1:goal.id==='thesis'?scoreGoal:(config.productionScore??(degreeGoal==='master'?2:scoreGoal+profile.scoreMargin));
  const enough=s.totalResearchScore>=productionTarget&&(s.degree==='phd'&&s.year<6||!thesisBudget||thesisBudget.projectedPass);
  const reviewingScore=s.papers.filter(q=>q.status==='reviewing').reduce((n,q)=>n+(E.SCORE_BY_TARGET[q.target]??0),0);
  const awaitingResult=reviewingScore>0&&s.totalResearchScore+reviewingScore>=productionTarget;
  // Finish an already started batch before considering unrelated purchases.
  if(committed&&committed.month===s.totalMonths){
   const p=s.papers.find(p=>p.id===committed.paperId&&p.status==='draft');
   if(p){const slot=committed.bundle.find(x=>!s.aiShopState.subscriptions[x].active);if(slot){const q=buy(s,'buy-ai-month',{aiSlotId:slot},'科研批次配套：为本月已规划的具体操作购买AI',committed);if(q)return decorate(q);}
    const step=committed.steps[0];if(step){const quote=expectedResearch(E,s,p,step.field);if(quote.allowed&&safe(s,step.field,quote.sanCost)){committed.steps.shift();return decorate(choice('research-paper',{paperId:p.id,paperActionType:step.field},'集中完成论文批次，消费已积累buff，缩短草稿暴露于衰减的时间',{expectedGain:quote.improvement,san:quote.sanCost}));}}
   }committed=null;
  }
  let p=s.papers.find(x=>x.status==='draft');
  if(p&&FIELDS.every(f=>p[f]>0)){
   const venue=compareVenues(E,s,p,{degreeGoal,reliability:config.reliability??.82});
   if(venue?.action==='submit-journal-paper')return decorate(venue);
   const reviewInTime=s.totalMonths+3<=goal.deadline;
   const target=reviewInTime?['A','B','C'].find(t=>paperReliability(E,s,p,t)>=(config.reliability??.82)):null;
   const needsTwo=s.degree==='master'&&degreeGoal==='phd'&&s.totalMonths>=17&&s.totalResearchScore<2;
   if(!s.aiShopState.subscriptions.claude.active){
    const model=E.getAiModelForTotalMonths(s.totalMonths,'claude');
    const polished={...p,...Object.fromEntries(FIELDS.map(f=>[f,p[f]+(model.researchEffects[f]?.bonus??0)]))};
    const preferred=['A','B','C'].find(t=>paperReliability(E,s,polished,t)>=.88);
    if(reviewInTime&&preferred&&(!target||needsTwo&&target==='C'&&preferred!=='C'||s.player.money>=cashReserve(E,s)+10&&E.SCORE_BY_TARGET[preferred]>E.SCORE_BY_TARGET[target])){const q=buy(s,'buy-ai-month',{aiSlotId:'claude'},'即时润色将现有稿件推过目标会议录用线，比较成本后当月投稿',{beforeProbability:paperReliability(E,s,p,preferred),afterProbability:paperReliability(E,s,polished,preferred),target:preferred});if(q)return decorate(q);}
   }
   if(venue)return decorate(venue);
  }
  if(s.totalMonths>=config.chairAfter&&!committed&&(enough||!s.shopState.chairOwned||s.degree==='phd'&&!p)&&(enough||!s.shopState.chairOwned||E.getPendingReadingIdeaBonus(s)<10||s.player.money>=reserveForGrowth(s))){const equip=equipment(s,goal);if(equip)return decorate(equip);}
  if(readingMonth===s.totalMonths&&regular){readingMonth=-1;const r=E.previewReadPaperAction(s);if(r.canRead&&safe(s,'read',r.sanCost))return decorate(choice('read-paper',{},'兑现本月已购买的阅读模型：完成计划的阅读次数，积累下一篇论文加成',{readCount:r.readCount,san:r.sanCost}));}
  // Targeted work: only emergency cash or an identified high-return purchase.
  const work=E.previewPartTimeWork(s),reserve=cashReserve(E,s);
  const ideaThreshold=s.degree==='master'&&degreeGoal==='phd'?8:s.degree==='phd'?(config.phdIdeaTarget??profile.ideaTarget):config.ideaTarget;
  const bankReady=expectedResearch(E,s,{id:'reserve',idea:0,experiment:0,writing:0},'idea').expected>=ideaThreshold;
  const thesisSavings=s.degree==='phd'&&s.year>=5&&s.month<=7&&!thesis?.projectedPass&&!s.shopState.chairUpgrade&&s.player.money<19;
  const savingForChair=chairWorthSaving(s,goal);
  let cashTarget=s.degree==='master'&&degreeGoal==='phd'&&bankReady?12:thesisSavings?19:savingForChair?11:bankReady||p?reserve+8:reserve+2;
  // Build a useful permanent idea bank before exposing a manuscript to decay.
  const phantom={id:'estimate',idea:0,experiment:0,writing:0,prepublicationDecayRate:.1};
  const resultDeadline=s.degree==='master'&&degreeGoal==='phd'?s.totalMonths<18?21:33:goal.deadline;
  const transferring=s.degree==='master'&&degreeGoal==='phd';
  const transferNeed=transferring?Math.max(1,scoreGoal-s.totalResearchScore-reviewingScore):Infinity;
  const pipeline=planPaper(E,s,p??phantom,{deadline:resultDeadline,minProbability:.88,minScore:s.degree==='phd'&&s.year<6?2:1,scoreNeed:transferNeed});
  if(pipeline)cashTarget=reserve+pipeline.cost+(p?0:2);
  const expected=expectedResearch(E,s,phantom,'idea').expected;
  const startThreshold=ideaThreshold;
  const urgent=s.degree==='master'&&degreeGoal==='phd'&&s.totalMonths>=16&&s.totalResearchScore<2||goal.id==='thesis'&&!enough;
  if(!p&&!enough&&!awaitingResult&&expected>=startThreshold&&remaining>=3&&pipeline&&regular&&s.player.money>=pipeline.cost+reserve){
   if(pipeline.steps[0].month>s.totalMonths){
    const recovery=rest('整篇预算要求先恢复：准备阶段暂不开稿，避免等待首个科研操作时就开始衰减');
    if(recovery)return decorate(recovery);
   }
   const slots=E.getWorkstationPaperSlotMap(s.papers);const slot=Array.from({length:E.getAvailablePaperSlotCount(s)},(_,i)=>i).find(i=>!slots.has(i));
   if(slot!==undefined&&s.player.san>=8&&pipeline.steps[0].month===s.totalMonths){paperCommitment=structuredClone(pipeline);return decorate(choice('create-paper',{paperSlotIndex:slot},'整篇三项已有可完成的资源预算，锁定操作顺序后开稿',{ideaExpected:expected,startThreshold,pipeline}));}
  }
  if(work.allowed&&s.player.money<cashTarget&&safe(s,'work',work.sanCost,8)){
   const quote=E.quoteSanPayment(E.consumeActiveOperation(s,'work'),work.sanCost);
   const net=work.moneyReward-quote.moneyCost;
   if(net>0&&(savingForChair||thesisSavings||s.totalMonths<=2||s.month>=7&&s.month<=9||s.player.money<reserve||(bankReady||p)&&s.player.money<cashTarget))return decorate(choice('part-time-work',{},s.player.money<reserve?'补足医疗/生活与实验储备':'为下一次科研批次筹资，优先春季或SAN充足的窗口',{cashTarget,net,san:work.sanCost}));
  }
  // When the idea bank is ready, spending the last safe SAN on more reading
  // can permanently prevent the work needed to pay for its experiment batch.
  const batchCashTarget=Math.min(cashTarget,reserve+(pipeline?.cost??4)+2);
  if(!enough&&!awaitingResult&&(bankReady||p)&&regular&&s.player.money<batchCashTarget
    &&!safe(s,'work',work.sanCost,8)){
   const recovery=rest('阅读加成已备好但科研现金不足：先恢复打工所需SAN，避免继续阅读却始终付不起实验批次');
   if(recovery)return decorate(recovery);
  }
  if(savingForChair&&!bankReady&&s.totalMonths<13&&regular&&s.player.money<11){const r=rest('积累办公椅资金阶段：当前打工SAN不足，先恢复，不用阅读挤占下一次筹资窗口');if(r)return decorate(r);}
  if(p&&p.experiment>0&&s.advisorProgressState.pendingGuidanceToPlayer==null){
   const a=s.advisorProgressState,progress=Math.floor(E.getEffectiveResearch(s));
   if(a.lastPlayerProjectTotalMonths!==s.totalMonths&&a.verticalProgress+progress>=100&&safe(s,null,E.getAdvisorTaskSanCost(s,'vertical'),8))return decorate(choice('advisor-project',{projectType:'vertical'},'纵向已接近完成：用不占常规行动的项目推进换取本篇写作协作，缩短收尾时间',{progress:a.verticalProgress,guaranteedProgress:progress,guidance:E.getAdvisorGuidanceAmount(s)}));
  }
  const cooperation=planCooperation(E,s,degreeGoal);
  if(cooperation&&!paperCommitment)return decorate(cooperation);
  if(!paperCommitment){const lover=planLoverActivity(E,s,p?8:0);if(lover)return decorate(lover);}
  if(!paperCommitment&&!p){const project=planLabProject(E,s,degreeGoal);if(project)return decorate(project);}
  if(p){
   if(!opened.has(p.id))opened.set(p.id,s.totalMonths);
   if(sum(p)===0&&!s.externalPublications.some(x=>!x.nonFirstAuthor)&&p.prepublicationDecayRate>.12&&(rerolls.get(p.id)??0)<3){rerolls.set(p.id,(rerolls.get(p.id)??0)+1);return decorate(choice('reroll-paper-topic',{paperId:p.id},'开稿前选择较低衰减课题，最多尝试3次，不无限刷题'));}
   // Avoid three consecutive research months when time permits: one recovery/read month.
   const streak=[1,2].every(k=>(s.achievementProgress?.counters[`research-actions:${s.totalMonths-k}`]??0)>0);
   const full=pipeline?.steps[0];
   const plan=full&&full.month===s.totalMonths&&E.getActiveOperationAllowance(s,full.field).allowed?{bundle:full.bundle,cost:full.cost,steps:[full],pipeline}:researchPlan(s,p);
   const execution=plan&&projectAi(E,s,plan.bundle);
   const currentQuote=execution&&expectedResearch(E,execution.state,p,plan.steps[0].field);
   const fullyAffordable=execution&&execution.state.player.money>=reserve;
   if(plan&&fullyAffordable&&currentQuote?.allowed&&safe(execution.state,plan.steps[0].field,currentQuote.sanCost)&&(!streak||sum(p)>=40||p.writing<=0)&&!enough&&plan.steps[0].gain>=3){
    committed={...plan,paperId:p.id,month:s.totalMonths};
    const missingModel=plan.bundle.find(slot=>!s.aiShopState.subscriptions[slot].active);
    if(missingModel){const q=buy(s,'buy-ai-month',{aiSlotId:missingModel},'比较不用AI与各套餐的预期净收益后，购买本月科研批次所需模型',plan);if(q)return decorate(q);}
    const first=committed.steps.shift();if(first)return decorate(choice('research-paper',{paperId:p.id,paperActionType:first.field},'完成当前论文缺项或有实质收益的改进；拒绝反复只涨1分的刷操作',{expectedGain:first.gain,san:first.san,age:s.totalMonths-opened.get(p.id)}));
   }
   if(s.totalMonths+3<=goal.deadline&&FIELDS.every(f=>p[f]>0)&&sum(p)>=30&&paperReliability(E,s,p,'C')>=.72&&(s.totalMonths-opened.get(p.id)>=4||urgent))return decorate(choice('submit-paper',{paperId:p.id,paperTarget:'C'},'继续修改的边际收益低且会衰减；按截止期选择保守C类投稿',{reviewerQuality:paperReliability(E,s,p,'C')}));
  }
  if(!enough&&!awaitingResult&&regular&&expected>=startThreshold&&!pipeline&&s.player.money>=reserve+4&&s.player.san<s.sanCap-2){
   const recovery=rest('阅读加成与现金已经准备好：整篇计划因SAN不足暂不可行，先恢复，不再用阅读把SAN长期卡在低位');
   if(recovery)return decorate(recovery);
  }
  if(p&&regular&&!pipeline&&s.player.money>=reserve+3&&s.player.san<s.sanCap-2){
   const recovery=rest('已有稿件需要完整改进预算：先恢复科研窗口，避免一边阅读一边让草稿持续衰减');
   if(recovery)return decorate(recovery);
  }
  if(!thesisSavings&&(expected<startThreshold||!pipeline&&!p||s.degree==='phd'&&s.totalResearchScore>=7)&&!s.aiShopState.subscriptions.kimi.active&&goal.id!=='thesis'&&s.year>=1&&(E.getPendingReadingIdeaBonus(s)<24||s.degree==='phd'&&s.totalResearchScore>=7)&&s.player.money>=cashReserve(E,s)+2&&(!p||!regular)){
   const model=E.getAiModelForTotalMonths(s.totalMonths,'kimi');const projection=projectAi(E,s,['kimi']);
   if(projection){const manual=E.previewReadPaperAction(projection.state),automatic=model.readingEffect?.automaticReads??0;
    const count=automatic+(regular?manual.readCount:0),cost=E.getReadPaperSanCost(projection.state).sanCost*count;
    if(count>=2&&projection.cost<=count&&safe(projection.state,regular?'read':null,cost,9)){
     const q=buy(s,'buy-ai-month',{aiSlotId:'kimi'},'阅读成长窗口：按本型号额外阅读次数和SAN成本比较，积累buff与科研里程碑',{reads:count,san:cost});if(q){readingMonth=s.totalMonths;return decorate(q);}
    }
   }
  }
  if(p&&regular&&FIELDS.some(f=>p[f]<=0)&&s.player.money>=reserve+2&&s.coffeeState.coffeePurchaseCountThisMonth===0){
   const field=FIELDS.find(f=>p[f]<=0),v=E.previewResearchOperation(s,field,E.RESEARCH_OPERATION_SAN_COST[field]);
   const gain=E.getRecoveredSan(s.player.san,s.sanCap,E.getCoffeeSanGain(s.coffeeState),s.selectedRoleId)-s.player.san;
   const projected={...s,player:{...s.player,san:s.player.san+gain,money:s.player.money-2}};
   if(gain>0&&!safe(s,field,v.sanCost)&&safe(projected,field,v.sanCost))return decorate(choice('buy-coffee',{},'咖啡使本月关键实验/写作从不可承受到可执行，避免整篇跨月继续衰减',{gain,field}));
  }
  if(p&&FIELDS.some(f=>p[f]<=0)&&regular){const r=rest('为实验/写作收尾恢复SAN，不重做已完成的idea而让稿件继续拖延');if(r)return decorate(r);}
  if(thesisSavings&&regular&&s.player.money<19){const r=rest('为毕业论文恢复装备筹资：当前打工不满足安全线，先恢复');if(r)return decorate(r);}
  if(!p&&!enough&&pipeline&&expected>=startThreshold&&s.player.san<16&&regular){const r=rest('论文已有完整可行预算，恢复到可以完成科研组合的SAN预算');if(r)return decorate(r);}
  if(!p&&!enough&&expected>=(s.degree==='phd'?startThreshold:15)&&regular&&s.totalMonths<(config.chairAfter??0)){
   if(work.allowed&&safe(s,'work',work.sanCost,6)&&s.player.money<10)return decorate(choice('part-time-work',{},'论文加成已备好：为完整科研批次补足资金，暂缓长期装备',{money:s.player.money}));
  }
  if(!p&&!enough&&pipeline&&expected>=startThreshold&&regular&&s.player.money<pipeline.cost+reserve+2&&work.allowed){
   if(safe(s,'work',work.sanCost,6))return decorate(choice('part-time-work',{},'按整篇论文实际报价补齐资金，避免现金目标与开稿门槛冲突',{required:pipeline.cost+reserve+2}));
   const r=rest('完整论文预算已有报价，恢复到可安全筹资的状态');if(r)return decorate(r);
  }
  const read=E.previewReadPaperAction(s);
  if(regular&&(!enough||goal.id!=='thesis'&&E.getEffectiveResearch(s)<14)&&read.canRead&&safe(s,'read',read.sanCost,6))return decorate(choice('read-paper',{},p?'科研加成不足：阅读积累下一次idea与科研成长，避免低效重做':'积累不会跨月衰减的idea buff，并推进每10次阅读的科研成长',{pendingBonus:E.getPendingReadingIdeaBonus(s),san:read.sanCost,ideaExpected:expected}));
  if(regular&&restGain>0)return decorate(rest('保留下一阶段科研/事件余量，休息优于无目标消费和无收益操作'));
  // One horizontal project near completion can replenish payroll; never burn SAN blindly.
  const a=s.advisorProgressState;
  if(a.funding<35&&a.horizontalProgress+Math.floor(E.getEffectiveResearch(s))>=100&&a.lastPlayerProjectTotalMonths!==s.totalMonths&&safe(s,null,E.getAdvisorTaskSanCost(s,'horizontal'),9))return decorate(choice('advisor-project',{projectType:'horizontal'},'横向项目接近完成，补充实验室经费保障工资和实验费用'));
  if(forecast.player.san<0||forecast.player.money<0)return decorate(choice(null,{},'资源规划失败：已知跨月会出现负资源，停止候选局并记录失败',{forecast:forecast.player}));
  return decorate(choice('next-month',{},'本月高性价比操作已完成，按月初预告进入下一阶段'));
 }
 return {next};
}
