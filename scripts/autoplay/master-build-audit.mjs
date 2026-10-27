import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {loadEngine} from './engine.mjs';
import {optionalEventSanCost,canBudgetOptionalEvent} from './relationships.mjs';
import {safePayment} from './estimates.mjs';

// Independent audit: test legal allocations and realized fixed event prices,
// then freeze all policy files before a small, reproducible seed comparison.
const directory=resolve(process.argv[2]??'artifacts/master-build-event-audit');
const seeds=[288011,288028,288045];
const builds={
  existing10:{'first-month-drive':1,'first-month-drive-plus':5,diligence:3},
  cap10:{'first-month-drive':1,'first-month-drive-plus':5,'self-determination':1,breakthrough:1},
  effective7:{'first-month-drive':1,'first-month-drive-plus':5},
};
await mkdir(directory,{recursive:true});
const {E,close}=await loadEngine();
const checks={builds:{},eventPrices:[],manuscriptReservations:0};
try {
  const nodes=E.getDesignedTalentNodes('normal');
  for(const [name,allocation] of Object.entries(builds)){
    assert.deepEqual(E.sanitizeRoleTalentAllocation('normal',0,allocation),allocation,name+' must be legal');
    const spent=nodes.reduce((n,node)=>n+(allocation[node.id]??0)*node.cost,0);
    assert.equal(spent,name==='effective7'?7:10);
    checks.builds[name]={allocation,spent,nodes:nodes.filter(n=>allocation[n.id]).map(n=>({id:n.id,name:n.name,effect:n.effect}))};
  }
  for(const seed of seeds){
    const recording=JSON.parse(await readFile(`artifacts/strategy-repair-balanced-v88-holdout-master/normal-master-10-${seed}.phdreplay.json`,'utf8'));
    let s=structuredClone(recording.replay.initial);
    const pending=new Map();
    for(const command of recording.replay.commands){
      const before=s;
      const queued=command.actionId==='resolve-event'&&before.eventQueue.find(e=>e.id===command.payload.eventId);
      const event=queued?E.getResolvableQueuedEvent(before,queued):null;
      const selected=event?.choices.find(c=>c.id===command.payload.eventChoiceId);
      if(event?.stage==='act2'&&/^random-(1|2|4|6|10|11|12|15|16)-/.test(selected.id)){
        const prefix=selected.id.replace(/-\d+$/,'');
        if(['random-1-self','random-2-self','random-4-horizontal','random-4-vertical','random-4-share','random-6-series','random-6-deep','random-10-short-term','random-11-deep','random-16-stay-up','random-10-exchange','random-12-argue','random-15-terraria'].includes(prefix)){
          pending.set(event.chainId,{seed,month:s.totalMonths,prefix,quoted:optionalEventSanCost(E,s,prefix,selected)});
        }
      }
      // Exercise a genuine actionable manuscript state against every small
      // event price. This checks that a quoted optional cost cannot spend the
      // SAN reserved for its next available research operation.
      const draft=s.papers.find(p=>p.status==='draft');
      const field=draft&&['idea','experiment','writing'].find(f=>draft[f]<=0);
      if(field&&E.getActiveOperationAllowance(s,field).allowed){
        for(const cost of [2,4,5,6]){
          if(!canBudgetOptionalEvent(E,s,cost))continue;
          const after=E.paySanCost(s,cost),preview=E.previewResearchOperation(after,field,E.RESEARCH_OPERATION_SAN_COST[field]);
          assert.ok(safePayment(E,after,field,preview.sanCost,8));
          checks.manuscriptReservations++;
        }
      }
      s=E.executeReplayCommand(s,command,recording.replay.ruleset);
      if(event?.stage==='result'&&pending.has(event.chainId)){
        const entry=pending.get(event.chainId),actual=Math.max(0,before.player.san-s.player.san);
        assert.ok(Math.abs(actual-entry.quoted)<.011,JSON.stringify({...entry,actual}));
        checks.eventPrices.push({...entry,actual});pending.delete(event.chainId);
      }
    }
  }
  const start=E.executeReplayCommand(E.createInitialState(),{kind:'action',actionId:'start-game',payload:{roleId:'normal',talentAllocation:builds.existing10}},E.REPLAY_RULESET);
  const summer={...start,month:10,player:{...start.player,research:1}};
  assert.equal(optionalEventSanCost(E,summer,'random-1-self'),5);
  assert.equal(optionalEventSanCost(E,summer,'random-16-stay-up'),6);
  const winter={...summer,month:2};
  assert.equal(optionalEventSanCost(E,winter,'random-1-self'),4);
  assert.equal(optionalEventSanCost(E,winter,'random-16-stay-up'),5);
  checks.conclusion='A pure master route has only 7 generally useful normal-role points. Both exact-10 builds spend 3 points on transfer-only or untriggered cap effects. No game rules were changed.';
  await writeFile(`${directory}/audit.json`,JSON.stringify(checks,null,2));
} finally {await close();}
console.log(JSON.stringify({builds:checks.builds,eventPriceChecks:checks.eventPrices.length,manuscriptReservationChecks:checks.manuscriptReservations}));
if(process.argv.includes('--static-only'))process.exit(0);
const policyDirectory=resolve(directory,'policy');await mkdir(policyDirectory,{recursive:true});
const files=['planner.mjs','pipeline.mjs','estimates.mjs','relationships.mjs','opportunities.mjs','quality.mjs','engine.mjs','run.mjs'];
const contents={};
for(const file of files){contents[file]=await readFile(new URL(file,import.meta.url),'utf8');await writeFile(resolve(policyDirectory,file),contents[file]);}
await writeFile(`${directory}/policy-digest.json`,JSON.stringify({sha256:createHash('sha256').update(JSON.stringify(contents)).digest('hex')},null,2));
for(const name of ['existing10','cap10']){
  const output=resolve(directory,name);await mkdir(output,{recursive:true});
  await new Promise((done,reject)=>{
    const child=spawn(process.execPath,[resolve(policyDirectory,'run.mjs'),'normal','master-10',seeds.join(','),output],{
      cwd:process.cwd(),env:{...process.env,AUTOPLAY_TALENTS:JSON.stringify(builds[name]),AUTOPLAY_PLANNER:resolve(policyDirectory,'planner.mjs')},stdio:'inherit',windowsHide:true,
    });
    child.once('error',reject);child.once('exit',code=>code===0?done():reject(Error('Autoplay exited '+code)));
  });
}
const results=[];
for(const seed of seeds){
  const variants={};
  for(const name of ['existing10','cap10']){
    const data=JSON.parse(await readFile(`${directory}/${name}/normal-master-10-${seed}.json`,'utf8'));
    variants[name]={ending:data.summary.ending,score:data.summary.score,player:data.summary.player,
      submissions:data.summary.submissions,stuck:data.summary.stuck,decay:data.summary.decay,
      capOverflowTriggered:data.state.log.some(l=>l.text?.includes('突破极限'))};
  }
  results.push({seed,variants,equivalent:JSON.stringify(variants.existing10)===JSON.stringify(variants.cap10)});
}
await writeFile(`${directory}/comparison.json`,JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
