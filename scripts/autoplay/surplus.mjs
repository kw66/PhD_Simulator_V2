import {cashReserve, safePayment, projectAi} from './estimates.mjs';
const decision=(action,payload,reason,detail)=>({action,payload,reason,detail});
const hasOffer=s=>Object.values(s.careerOffers).some(Boolean);
const thesisReady=(E,s)=>{const t=E.getThesisForecast(s);return Boolean(t.researchScoreMet&&t.currentPass);};

// Count automatic reads only on a future purchase. An active subscription has
// already delivered them; projecting that bonus again can invent a milestone.
export function readingMilestoneReachable(E,s,{degreeGoal='phd',reserve=cashReserve(E,s)}={}){
 const deadline=degreeGoal==='master'?34:70;
 if(s.totalMonths>=deadline)return false;
 const left=Math.max(0,deadline-s.totalMonths-1);
 const needed=10-s.readingState.readCount%10;
 const current=E.previewReadPaperAction(s);
 let capacity=Math.max(0,s.actionState.limit-s.actionState.used)*current.readCount;
 let budget=Math.max(0,s.player.money-reserve),remainder=s.roleTalents?.actionRemainder??0;
 const extra=s.degree==='phd'?(s.roleTalents?.levels.diligence??0)/10:0,options=[];
 for(let k=1;k<=left;k++){
  remainder+=extra;const actions=1+Math.floor(remainder);remainder-=Math.floor(remainder);
  capacity+=actions;
  const future={...s,totalMonths:s.totalMonths+k,aiShopState:E.createAiShopState()};
  const projection=projectAi(E,future,['kimi']);
  if(!projection)continue;
  const model=E.getAiModelForTotalMonths(future.totalMonths,'kimi');
  const added=(model.readingEffect?.automaticReads??0)+actions*(E.previewReadPaperAction(projection.state).readCount-1);
  if(added>0)options.push({price:projection.cost,added});
 }
 for(const option of options.sort((a,b)=>b.added/Math.max(.1,b.price)-a.added/Math.max(.1,a.price))){
  if(option.price<=budget){budget-=option.price;capacity+=option.added;}
 }
 return needed<=capacity;
}

// The job catalogue, chance curves and fixed interview costs are public. Never
// inspect enqueueEvents: they contain the already drawn interview outcomes.
export function careerEventChoice(E,s,e,pool){
 if(e.source!=='career')return null;
 const pick=id=>pool.find(c=>c.id===id),ready=thesisReady(E,s);
 if(e.stage==='result')return pick('accept-offer')??pick('keep-offer')??pick('confirm');
 const safe=type=>safePayment(E,s,null,
  Math.max(0,-E.getActualSanChange(-E.CAREER_INTERVIEW_SAN_COST[type],s.month,s.eventSupport,s.buffs)),ready?10:16);
 const options=Object.keys(E.CAREER_DEFINITIONS).flatMap(type=>
  E.getCareerCandidates(s,type).map(job=>({type,job,chance:E.getCareerSuccessChance(type,E.getCareerAbility(s,type),job)})))
  .filter(o=>o.chance>=45&&safe(o.type));
 if(e.stage==='act1'){
  if(hasOffer(s))return pick('rest');
  const best=options.filter(o=>pick('choose-'+o.type)).sort((a,b)=>b.chance-a.chance||b.job.threshold-a.job.threshold)[0];
  return best?pick('choose-'+best.type):pick('rest');
 }
 if(e.stage==='act2'){
  const best=options.filter(o=>pick('apply-'+o.job.id)).sort((a,b)=>b.chance-a.chance||b.job.threshold-a.job.threshold)[0];
  // Act1 already reserved the cost. If a required event changed resources,
  // recover before the mandatory interview instead of selecting a hidden win.
  return best?pick('apply-'+best.job.id):null;
 }
 return null;
}

function promotion(E,s,left,reserve){
 if(!E.getPaperCitationMultiplier||left<4)return null;
 const options=[];
 for(const p of [...new Map([...s.papers,...s.externalPublications].map(p=>[p.id,p])).values()]){
  if(p.status!=='published'||!p.publication||p.nonFirstAuthor||p.leadAuthorId&&p.leadAuthorId!=='player')continue;
  for(const id of ['github','xiaohongshu','quantum']){
   if(p.publication.promotions?.[id]||id==='quantum'&&!p.journalTarget&&!p.publication.journalTarget)continue;
   const money=E.getPaperPromotionMoneyCost(id),san=E.getPaperPromotionCost(id,s);
   if(s.player.money-money<reserve||!safePayment(E,s,null,san,12))continue;
   let base=p.publication.effectiveScore,boosted=base+(id==='github'?Math.floor(base*.25):0),gain=0;
   const rate=E.getPaperCitationMultiplier(s,p);
   const promoted={...p,publication:{...p.publication,promotions:{...p.publication.promotions,[id]:true}}};
   const multiplier=id==='github'?1:E.getPaperCitationMultiplier(s,promoted)/Math.max(.0001,rate);
   // Integrate the known published-score decay, with today's visible multiplier.
   for(let month=1;month<=left;month++){
    gain+=(boosted*multiplier-base)*.05*rate;
    if(((p.publication.monthsSincePublish??0)+month)%E.PUBLISHED_SCORE_DECAY_INTERVAL_MONTHS===0){base=Math.max(0,base-Math.ceil(base*E.PUBLISHED_SCORE_DECAY_RATE));boosted=Math.max(0,boosted-Math.ceil(boosted*E.PUBLISHED_SCORE_DECAY_RATE));}
   }
   const cost=san+money*2;
   if(gain<Math.max(3,cost))continue;
   options.push({...decision('promote-paper',{paperId:p.id,promotionId:id},
    '成果推广按剩余引用窗口与发表后衰减计回报：只推广可覆盖SAN或现金成本的已有成果',
    {promotion:id,expectedExtraCitations:gain,san,money,months:left}),value:gain/Math.max(1,cost)});
  }
 }
 return options.sort((a,b)=>b.value-a.value)[0]??null;
}

export function planSurplus(E,s,{degreeGoal,finish=false,protectedBudget=0}={}){
 const left=(degreeGoal==='master'?34:70)-s.totalMonths;
 if(left<0)return null;
 const reserve=Math.max(cashReserve(E,s)+protectedBudget,finish?6:8);
 const regular=E.getActiveOperationAllowance(s,'read').allowed;
 const safe=(cost,operation=null,buffer=12)=>safePayment(E,s,operation,cost,buffer);
 // A retained offer has a real ending payoff. Preparation is once/month and
 // targets one attainable direction, not four directions for checklist coverage.
 if(s.year===(degreeGoal==='master'?3:6)&&s.degree===degreeGoal&&!hasOffer(s)&&left>=1&&thesisReady(E,s)){
  const options=Object.keys(E.CAREER_DEFINITIONS).flatMap(type=>{
   if(E.getCareerPreparationFailure(s,type)||!E.CAREER_DEFINITIONS[type].activeMonths.some(m=>m>s.month))return [];
   const cost=E.getCareerPreparationSanCost(s,type);
   const best=Math.max(...E.getCareerCandidates(s,type).map(job=>E.getCareerSuccessChance(type,E.getCareerAbility(s,type),job)));
   const gain=type==='civilService'?Math.floor(s.player.san/2)+2.5:type==='stateOwned'?Math.floor(E.getEffectiveResearch(s)*.25)+2.5:type==='internet'?Math.floor(E.getEffectiveResearch(s)*.5):Math.floor(E.getEffectiveResearch(s)*.25);
   const windows=E.CAREER_DEFINITIONS[type].activeMonths.filter(m=>m>s.month).length;
   const chancePerPoint={internet:.5,stateOwned:.55,civilService:.75,academic:.4}[type];
   if(best>=85||gain<=0||best+gain*windows*chancePerPoint<45||!safe(cost,null,12))return [];
   return [{type,cost,best,gain,value:gain/cost+best/30}];
  }).sort((a,b)=>b.value-a.value);
  const chosen=options[0];
  if(chosen&&!Object.values(s.careerPreparedMonths).includes(s.totalMonths))return decision('prepare-career',{careerType:chosen.type},
   '盲审预算已经落实：用富余SAN准备一个有招聘窗口的方向，提高实际录用机会',chosen);
 }
 const promotionChoice=promotion(E,s,left,reserve);
 if(promotionChoice)return promotionChoice;
 // A terminal idea buff is worthless. Finish-stage reading must be able to
 // reach another ten-read research milestone before graduation.
 const read=E.previewReadPaperAction(s),count=s.readingState.readCount;
 const actions=Math.max(0,Math.floor(s.actionState.limit-s.actionState.used));
 const needed=10-count%10;
 const model=E.getAiModelForTotalMonths(s.totalMonths,'kimi'),projection=projectAi(E,s,['kimi']);
 const manual=projection?E.previewReadPaperAction(projection.state):read,auto=model.readingEffect?.automaticReads??0;
 const modelReads=auto+Math.max(1,actions)*manual.readCount;
 const fundedMonths=projection?Math.min(left+1,Math.floor(Math.max(0,s.player.money-reserve)/Math.max(1,projection.cost))):0;
 const reachable=readingMilestoneReachable(E,s,{degreeGoal,reserve});
 if(regular&&read.canRead&&safe(read.sanCost,'read',finish?8:10)
  &&(!finish||reachable)
  &&E.getEffectiveResearch(s)<E.getPlayerAttributeCap(s,'research')
  &&(!finish||count%10!==0||left>=4)){
  const freeReads=actions*read.readCount;
  if(needed>freeReads&&!s.aiShopState.subscriptions.kimi.active&&projection&&s.player.money-projection.cost>=reserve){
   const reads=auto+actions*manual.readCount,cost=reads*E.getReadPaperSanCost(projection.state).sanCost;
   if(reads>=2&&projection.cost<=reads&&safePayment(E,projection.state,null,cost,finish?8:12)
    &&(!finish||needed<=reads+Math.max(0,fundedMonths-1)*modelReads))return decision('buy-ai-month',{aiSlotId:'kimi'},
    '以剩余行动兑现阅读模型：比较自动和手动阅读、SAN及下个科研里程碑，不为毕业后用不到的buff付钱',
    {price:projection.cost,reads,san:cost,readsToMilestone:needed});
  }
  return decision('read-paper',{},'在毕业与医疗储备之外继续成长：消耗剩余行动推进可达的科研阅读里程碑',
   {readCount:count,readsToMilestone:needed,san:read.sanCost});
 }
 const a=s.advisorProgressState;
 if(left>=2&&a.lastPlayerProjectTotalMonths!==s.totalMonths&&s.player.san>=16){
  for(const type of ['horizontal','vertical']){
   if(a.playerProjectCompletions[type]>0||a.playerProjectParticipation[type])continue;
   if(type==='vertical'&&finish)continue; // No future manuscript can use the guidance.
   const gain=Math.max(1,Math.floor(E.getEffectiveResearch(s))),pushes=Math.ceil((100-a[type+'Progress'])/gain);
   const cost=E.getAdvisorTaskSanCost(s,type);
   if(pushes>Math.min(3,left)||!safe(cost))continue;
   return decision('advisor-project',{projectType:type},'已有项目能在余下学期完成：以安全余量参与，换取劳务或下一篇指导，不从零堆无回报进度',
    {progress:a[type+'Progress'],guaranteedGain:gain,pushes,cost});
  }
 }
 return null;
}
