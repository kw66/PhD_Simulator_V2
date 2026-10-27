import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadEngine} from './engine.mjs';
import {projectAi,safePayment,expectedResearch,cashReserve,FIELDS} from './estimates.mjs';
import {planPaper} from './pipeline.mjs';
import {createPlanner} from './planner.mjs';

const {E,close}=await loadEngine();
try{
 const recording=JSON.parse(await readFile('public/official-replays/normal-phd-0.json','utf8'));
 let base=structuredClone(recording.replay.initial);
 for(const command of recording.replay.commands){base=E.executeReplayCommand(base,command,recording.replay.ruleset);if(base.totalMonths===1)break;}
 const draft={...E.createDraftPaper(15,0,()=>.5),idea:0,experiment:0,writing:0};
 const state={...base,totalMonths:15,year:2,month:3,eventQueue:[],papers:[draft],
  player:{...base.player,san:20,money:20,research:4},
  aiShopState:E.createAiShopState(),buffs:base.buffs.filter(b=>!b.id.startsWith('ai-')),
  actionState:{...base.actionState,used:0,aiResearchBonusUsed:false}};
 const before=JSON.stringify(state),projection=projectAi(E,state,['claude'],draft);
 const purchased=E.executeReplayCommand(state,{kind:'action',actionId:'buy-ai-month',payload:{aiSlotId:'claude'}},E.REPLAY_RULESET);
 assert.deepEqual(FIELDS.map(f=>projection.paper[f]),[2,2,0],'Claude can fill zero idea and experiment without an operation');
 assert.deepEqual(projection.state.papers,purchased.papers,'public activation projection must match the real deterministic score changes');
 assert.equal(projection.state.player.money,purchased.player.money);
 assert.equal(projection.state.actionState.used,purchased.actionState.used);
 assert.equal(projection.state.player.san,purchased.player.san);
 assert.equal(JSON.stringify(state),before,'projection must not mutate the live state');
 const active=projectAi(E,projection.state,['claude'],projection.paper);
 assert.equal(active.cost,0);
 assert.deepEqual(active.paper,projection.paper,'an active Claude must not polish again');
 const expanded=projectAi(E,projection.state,['claude','gpt','deepseek'],projection.paper);
 assert.equal(expanded.cost,E.getShopActionPrice(state,'buy-ai-month',{aiSlotId:'gpt'})+E.getShopActionPrice(state,'buy-ai-month',{aiSlotId:'deepseek'}),
  'a later operation in the same month must pay only for newly activated models');
 assert.deepEqual(expanded.paper,projection.paper);
 const complete={...draft,idea:10,experiment:12,writing:8};
 const completedProjection=projectAi(E,{...state,papers:[complete]},['claude'],complete);
 assert.deepEqual(FIELDS.map(f=>completedProjection.paper[f]),[12,14,8]);
 const thirdYear={...state,totalMonths:27,year:3,papers:[complete]};
 const renewal=projectAi(E,thirdYear,['claude'],complete);
 assert.deepEqual(FIELDS.map(f=>renewal.paper[f]),[12,14,10],'a new subscription after the model release uses that month\'s model');
 const pipeline=planPaper(E,state,draft,{deadline:21,minProbability:.8});
 assert.ok(pipeline);
 if(pipeline.steps[0].models.includes('claude'))assert.equal(pipeline.steps[0].field,'writing','do not waste actions refilling fields covered by activation');
 assert.deepEqual(pipeline,planPaper(E,{...state,randomState:{seed:456789,cursor:222}},draft,{deadline:21,minProbability:.8}),
  'activation-aware plans must remain independent of unrevealed random rolls');
 const shortWindow={...state,player:{...state.player,research:12},buffs:[]};
 const sameMonth=planPaper(E,shortWindow,draft,{deadline:18,minProbability:.00001});
 assert.ok(sameMonth&&sameMonth.finishMonth===15);
 assert.ok(sameMonth.steps.some(step=>step.models.includes('claude')));
 assert.ok(sameMonth.steps.length<=2,'Claude must fill at least one zero field instead of scheduling all three operations');
 // At year 3 Claude can complete a last missing field with no regular action.
 const unfinished={...complete,writing:0};
 const noActions={...thirdYear,papers:[unfinished],actionState:{...thirdYear.actionState,used:99,aiResearchBonusUsed:true}};
 const activation=planPaper(E,noActions,unfinished,{deadline:30,minProbability:.1});
 assert.ok(activation?.steps[0].activationOnly,'buying Claude is a legal completion even when no operation remains');
 assert.equal(activation.steps[0].san,0);
 // Reserve one coin, not an unrelated hard-coded three, when the public next
 // month budget is safe. A one-operation deadline isolates this from waiting.
 const cheapState={...state,month:8,totalMonths:20,player:{...state.player,money:2,san:20,research:12}};
 const lastField={...complete,idea:30,experiment:30,writing:0};
 assert.equal(cashReserve(E,cheapState),1);
 const quote=expectedResearch(E,cheapState,lastField,'writing');
 assert.ok(safePayment(E,cheapState,'writing',quote.sanCost,8));
 const cheap=planPaper(E,cheapState,lastField,{deadline:23,minProbability:.8});
 assert.ok(cheap&&cheap.finishMonth===20,'the planner must accept a safe controller-executable step with two coins remaining');
 // A mentor contribution can make total writing positive while the player's
 // own writing remains zero. Finishing that part is a real improvement.
 const mentorPaper={...complete,idea:6,experiment:5,writing:8,
  collaborationScores:{idea:0,experiment:0,writing:8}};
 const funded={...state,totalMonths:23,year:2,month:11,totalResearchScore:0,papers:[mentorPaper],buffs:[],
  player:{...state.player,san:15.0104,research:3,money:5},
  shopState:{...state.shopState,chairOwned:true}};
 const revision=planPaper(E,funded,mentorPaper,{deadline:33,minProbability:.88});
 assert.ok(revision&&revision.steps[0].field==='writing'&&revision.finishMonth===23,
  'do not mistake positive mentor writing for a completed writing-improvement operation');
 assert.ok(revision.cost+cashReserve(E,funded)<=funded.player.money);
 const fundedDecision=createPlanner(E).next(funded);
 assert.ok(['buy-ai-month','research-paper'].includes(fundedDecision.action),
  'a funded revision must finish before a generic cash target consumes its regular action');
 // Reproduce a batch with idea now and two operations sharing next month's
 // subscriptions. The controller must not spend those subscriptions early.
 let scheduled={...state,totalMonths:29,year:3,month:5,totalResearchScore:0,papers:[],
  player:{...state.player,san:14.5152,research:4,money:8},
  buffs:[{id:'schedule-idea',name:'idea',source:'check',timing:'next-action',remainingMonths:null,actionEffects:{idea:{bonus:3}}},
   {id:'schedule-experiment',name:'experiment',source:'check',timing:'next-action',remainingMonths:null,actionEffects:{experiment:{extraActions:3}}}],
  shopState:{...state.shopState,chairOwned:true},advisorProgressState:{...state.advisorProgressState,pendingGuidanceToPlayer:null}};
 const scheduledPlanner=createPlanner(E);
 const opening=scheduledPlanner.next(scheduled);
 assert.equal(opening.action,'create-paper');
 assert.ok(opening.detail.pipeline.steps.some(step=>step.month===30));
 scheduled=E.executeReplayCommand(scheduled,{kind:'action',actionId:opening.action,payload:opening.payload},E.REPLAY_RULESET);
 for(let i=0;i<8;i++){
  const decision=scheduledPlanner.next(scheduled);
  if(decision.action==='next-month'){
   assert.equal(scheduled.aiShopState.subscriptions.gpt.active,false,
    'the next-month GPT batch must not be purchased after this month\'s idea');
   break;
  }
  assert.ok(!(decision.action==='research-paper'&&decision.payload.paperActionType==='experiment'),
   'never execute the future experiment step early');
  scheduled=E.executeReplayCommand(scheduled,{kind:'action',actionId:decision.action,payload:decision.payload},E.REPLAY_RULESET);
  scheduled={...scheduled,eventQueue:[]};
  assert.ok(i<7,'the controller must reach its planned month boundary');
 }
 console.log('Pipeline activation, budget and public-information checks passed.');
}finally{await close();}
