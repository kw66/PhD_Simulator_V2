import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {loadEngine} from './engine.mjs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {auditTeachingReplay} from './quality.mjs';
const plannerModule=process.env.AUTOPLAY_PLANNER?pathToFileURL(resolve(process.env.AUTOPLAY_PLANNER)):new URL('./planner.mjs',import.meta.url);
const {createPlanner}=await import(plannerModule.href);
const role=process.argv[2]??'normal',route=process.argv[3]??'phd-10';
const seeds=(process.argv[4]??'1097218,271001,271019').split(',').map(Number);
const directory=process.argv[5]??'artifacts/strategic-autoplay';await mkdir(directory,{recursive:true});
const {E,close}=await loadEngine();
try{
 const policyFiles=['planner.mjs','estimates.mjs','pipeline.mjs','quality.mjs','relationships.mjs','opportunities.mjs','engine.mjs'];
 const policySources=Object.fromEntries(await Promise.all(policyFiles.map(async name=>[name,await readFile(new URL(name,plannerModule),'utf8')])));
 const policyDigest=createHash('sha256').update(JSON.stringify(policySources)).digest('hex');
 await writeFile(`${directory}/policy-snapshot.json`,JSON.stringify({policyDigest,sources:policySources},null,2));
 const budget=Number(route.split('-').at(-1));
 const old=budget===0?null:JSON.parse(await readFile(`public/official-replays/${role}-${route}.json`,'utf8'));
 const talents=JSON.parse(process.env.AUTOPLAY_TALENTS??'null')??(budget===0?{}:old.replay.commands[0].payload.talentAllocation??{});
 const config=JSON.parse(process.env.AUTOPLAY_CONFIG??'{}');
 for(const seed of seeds){
  const degreeGoal=route.startsWith('master')?'master':'phd';
  const planner=createPlanner(E,{degreeGoal,config});
  const initial={...E.createInitialState(),randomState:{seed,cursor:0}},payload={roleId:role,talentAllocation:talents};
  let s=E.executeReplayCommand(initial,{kind:'action',actionId:'start-game',payload},E.REPLAY_RULESET),started=structuredClone(s);
  const commands=[{kind:'action',actionId:'start-game',payload}],decisions=[],paperDates={},submissions=[],papers=[],purchases=[];let decay=0,reviewDecay=0,produced=0,stuck=null;
  for(let i=0;i<2000&&s.phase!=='finished';i++){
   const began=performance.now(),d=planner.next(s),planningMs=performance.now()-began;
   if(process.env.AUTOPLAY_PROGRESS==='1'&&(d?.action==='next-month'||planningMs>3000))console.log(JSON.stringify({progress:`${role}-${route}-${seed}`,month:s.totalMonths,action:d?.action,planningMs:Math.round(planningMs)}));
   if(!d?.reason){stuck='Missing decision rationale';break;}
   if(!d.action){stuck=d.reason;break;}
   const c={kind:'action',actionId:d.action,payload:d.payload};const before=s;
   s=E.executeReplayCommand(before,c,E.REPLAY_RULESET);
   if(s===before||E.replayStateDigest(s)===E.replayStateDigest(before)||s.log[0]?.kind==='noop'){stuck=`No-op ${d.action}: ${s.log[0]?.text}`;s=before;break;}
   commands.push(c);
   const brief={step:commands.length,month:before.totalMonths,year:before.year,academicMonth:before.month,action:d.action,payload:d.payload,stage:d.stage,goal:d.goal,reason:d.reason,detail:structuredClone(d.detail),planningMs:Math.round(planningMs),season:d.season,before:{...before.player},after:{...s.player},researchScore:s.totalResearchScore,nextMonth:d.forecast};decisions.push(brief);
   if(d.action==='buy-ai-month')purchases.push({...brief,slot:d.payload.aiSlotId,cost:before.player.money-s.player.money});
   for(const p of s.papers){const previous=before.papers.find(x=>x.id===p.id);if(!previous)paperDates[p.id]=s.totalMonths;
    if(previous){const delta=p.idea+p.experiment+p.writing-previous.idea-previous.experiment-previous.writing;
     if(d.action==='next-month'&&delta<0){if(previous.status==='draft')decay-=delta;else reviewDecay-=delta;}
     if(d.action==='research-paper'&&delta>0)produced+=delta;
    }
   }
   if(d.action==='submit-paper'){const p=before.papers.find(x=>x.id===d.payload.paperId);submissions.push({step:commands.length,month:before.totalMonths,id:p.id,target:d.payload.paperTarget,scores:[p.idea,p.experiment,p.writing],age:before.totalMonths-paperDates[p.id],reason:d.reason,quality:d.detail?.reviewerQuality});}
   for(const p of s.externalPublications)if(!before.externalPublications.some(x=>x.id===p.id))papers.push({id:p.id,month:s.totalMonths,target:p.target,coauthor:!!p.nonFirstAuthor,score:(p.submittedIdea??p.idea)+(p.submittedExperiment??p.experiment)+(p.submittedWriting??p.writing)});
  }
  if(s.phase!=='finished'&&!stuck)stuck='Action limit exceeded';
  const unused=purchases.filter(p=>['gpt','deepseek','gemini','doubao'].includes(p.slot)&&!decisions.some(d=>d.month===p.month&&d.step>p.step&&d.action==='research-paper'));
  const replay=E.createRunReplay(initial,started,payload);replay.commands=commands;replay.checkpoints=[{index:commands.length,digest:E.replayStateDigest(s),totalMonths:s.totalMonths}];
  const id=`${role}-${route}-${seed}`,recording=E.captureReplayRecording(replay,s,{id:'candidate-'+id});
  await E.verifyReplayRecording(recording,{yieldControl:async()=>{}});
  const teachingAudit=auditTeachingReplay(E,recording,{degreeGoal});
  const summary={id,seed,ruleset:E.REPLAY_RULESET,ending:s.ending,months:s.totalMonths,score:s.totalResearchScore,player:s.player,steps:commands.length,stuck,submissions,papers,unusedAI:unused.map(p=>({month:p.month,slot:p.slot,cost:p.cost})),decay,reviewDecay,produced,firstSubmission:submissions[0]?.month,thesis:E.getThesisForecast(s),minMoney:Math.min(...decisions.map(d=>d.after.money)),minSan:Math.min(...decisions.map(d=>d.after.san))};
  await writeFile(`${directory}/${id}.json`,JSON.stringify({summary,teachingAudit,policyDigest,config,talents,decisions,state:s},null,2));
  await writeFile(`${directory}/${id}.phdreplay.json`,E.serializeReplayRecording(recording));
  console.log(JSON.stringify({...summary,submissions:submissions.length,papers:papers.length,thesis:summary.thesis&&{pass:summary.thesis.currentPass,score:summary.thesis.currentGuaranteedScore}}));
 }
}finally{await close()}
