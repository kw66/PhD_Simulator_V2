import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadEngine } from './engine.mjs';
import { expectedResearch, paperReliability, projectAi, safePayment, stageGoal } from './estimates.mjs';
import { createPlanner } from './planner.mjs';
import { planPaper } from './pipeline.mjs';
import { auditTeachingReplay } from './quality.mjs';
import { readingMilestoneReachable } from './surplus.mjs';
import { relationshipEventPriorities } from './relationships.mjs';
import {opportunityEventPriority,compareVenues,planLoverActivity,internshipBudget} from './opportunities.mjs';
import {scholarshipDecision,scholarshipChance,transferPaperOptions,criticalPolish} from './milestones.mjs';
const { E, close } = await loadEngine();
try {
  const recording = E.parseReplayRecording(await readFile('public/official-replays/normal-phd-10.json', 'utf8'));
  let s = structuredClone(recording.replay.initial);
  for (const command of recording.replay.commands) {
    s = E.executeReplayCommand(s, command, recording.replay.ruleset);
    if (s.totalMonths >= 1) break;
  }
  const before = JSON.stringify(s), paper = { idea: 0, experiment: 0, writing: 0 };
  const estimate = expectedResearch(E, s, paper, 'idea');
  assert.ok(estimate.expected > 0);
  assert.equal(JSON.stringify(s), before, 'estimating must not mutate or advance RNG');
  const balanced = { idea: 20, experiment: 20, writing: 20 };
  assert.ok(paperReliability(E,s,balanced,'C') > paperReliability(E,s,{idea:2,experiment:2,writing:2},'C'));
  assert.ok(paperReliability(E,s,balanced,'C') >= paperReliability(E,s,balanced,'A'));
  assert.equal(stageGoal(E,s,'phd').submissionDeadline,18);
  assert.equal(stageGoal(E,{...s,totalMonths:22},'phd').submissionDeadline,30);
  assert.equal(stageGoal(E,{...s,degree:'phd'},'phd').deadline,67,'required papers must be credited before April blind review freezes');
  assert.equal(stageGoal(E,s,'master').deadline,31);
  const spring={...s,totalMonths:20,year:2,month:8,eventQueue:[],totalResearchScore:0,
    player:{san:20,research:4,social:4,favor:4,money:20},
    advisorProgressState:{...s.advisorProgressState,funding:60}};
  const mildWarning={...spring,totalMonths:6,year:1,month:6,
    roleTalents:{...spring.roleTalents,levels:{}},papers:[],
    actionState:{...spring.actionState,used:spring.actionState.limit,aiResearchBonusUsed:true},
    player:{san:6.5,research:2,social:2,favor:2,money:3}};
  assert.ok(E.previewNextMonthEffects(mildWarning).player.san>=5);
  assert.notEqual(createPlanner(E).next(mildWarning).action,'buy-coffee',
    'a nonfatal soft warning with no remaining action must not consume the manuscript cash reserve');
  const eligibleScholar={...spring,totalMonths:14,year:2,month:2,totalResearchScore:1};
  assert.equal(scholarshipDecision(E,eligibleScholar).apply,true,'one published C already qualifies for the second-year six-coin award');
  assert.equal(scholarshipDecision(E,{...eligibleScholar,totalResearchScore:3,year:3,
    scholarshipState:{...s.scholarshipState,scoreBaseline:3,lastAwardYear:2}}).apply,false,
    'previously awarded scores cannot justify another application');
  assert.equal(scholarshipDecision(E,{...eligibleScholar,buffs:[E.createImageMisuseBuff()]}).apply,false,
    'a disqualified run must not pay to apply');
  assert.equal(scholarshipChance(E,3,2),1/3);
  assert.equal(scholarshipChance(E,4,4),0);
  assert.equal(transferPaperOptions(E,{...spring,totalMonths:18}).deadline,21,
    'the last timely first-round submission is still a second-year transfer attempt');
  assert.equal(transferPaperOptions(E,{...spring,totalMonths:29,totalResearchScore:1}).minScore,2,
    'a last C cannot replace the B required for the final transfer');
  const criticalPaper={...E.createDraftPaper(27,0,()=>.5),idea:9,experiment:4,writing:11};
  const critical={...spring,totalMonths:29,year:3,month:5,totalResearchScore:2,
    papers:[criticalPaper],player:{...spring.player,money:13.5},aiShopState:E.createAiShopState(),
    roleTalents:{...spring.roleTalents,levels:{}}};
  assert.ok(criticalPolish(E,critical,criticalPaper)?.after>=.95,'buy an affordable same-grade reliability improvement before the last decisive submission');
  const polishDecision=createPlanner(E).next(critical);
  assert.equal(polishDecision.action,'buy-ai-month');
  assert.equal(polishDecision.payload.aiSlotId,'claude');
  const ready={...E.createDraftPaper(18,0,()=>.5),idea:19,experiment:14,writing:12};
  const submissionState={...projectAi(E,spring,['claude']).state,papers:[ready]};
  assert.ok(paperReliability(E,submissionState,ready,'B')>=.5);
  assert.ok(paperReliability(E,submissionState,ready,'B')<.82);
  const submission=createPlanner(E).next(submissionState);
  assert.equal(submission.action,'submit-paper','a reliable C must not decay indefinitely while waiting for B');
  assert.equal(submission.payload.paperTarget,'C');
  const projectState={...spring,month:4,totalMonths:16,player:{...spring.player,san:10},
    eventQueue:[{id:'project-budget-test',title:'project',chainId:'random-4',stage:'act2',source:'random',blocking:true,deadlineMonths:1,
      choices:[{id:'random-4-horizontal-1',effects:{san:-8},label:'horizontal'},
        {id:'random-4-vertical-1',effects:{san:-6},label:'vertical'},
        {id:'random-4-reject-1',effects:{favor:-2},label:'reject'}]}]};
  assert.equal(createPlanner(E).next(projectState).payload.eventChoiceId,'random-4-reject-1',
    'surviving a project is insufficient when it exhausts the manuscript SAN budget');
  assert.equal(relationshipEventPriorities(E,{...spring,player:{...spring.player,favor:0,money:0}},'phd')[0],
    'year-summary-favor','zero favor must be repaired before optional income to avoid the next mandatory talk ending the run');
  const lowFavorMeeting={...spring,player:{...spring.player,favor:0,san:9},
    eventQueue:[{id:'meeting-test',chainId:'random-6',stage:'act2',source:'random',title:'meeting',blocking:true,
      choices:[{id:'random-6-deep-1',label:'prepare',effects:{san:-2}},
        {id:'random-6-slack-1',label:'slack',effects:{}}]}]};
  assert.equal(createPlanner(E).next(lowFavorMeeting).payload.eventChoiceId,'random-6-deep-1',
    'do not rely on a stored random advisor absence to slack at zero favor');
  for(const [eventNumber,field,minorCost,minorMultiplier,majorCost]of [[17,'idea',2,1,4],[18,'experiment',3,.75,6]]){
    const paper={...ready,idea:20,experiment:20,writing:0};
    const competition={id:`competition-${eventNumber}`,chainId:`random-${eventNumber}`,stage:'act2',
      title:'competition',source:'random',blocking:true,paperCompetitionTargetId:paper.id,
      choices:[['ignore',0,.25],['minor',minorCost,minorMultiplier],['major',majorCost,1.25]].map(([branch,sanCost,multiplier])=>({
        id:`random-${eventNumber}-${branch}-1`,label:branch,effects:{enqueueEvents:[{
          id:'result',stage:'result',choices:[{id:'finish',effects:{paperCompetitionResolution:{paperId:paper.id,field,sanCost,multiplier}}}]
        }]}
      }))};
    const competitionState={...spring,papers:[paper],eventQueue:[competition],player:{...spring.player,san:14}};
    const preservation=createPlanner(E).next(competitionState);
    assert.equal(preservation.action,'resolve-event');
    assert.ok(!preservation.payload.eventChoiceId.includes('ignore'),
      'do not destroy three quarters of a funded draft when preserving it is affordable');
    const resolution=competition.choices.find(c=>c.id===preservation.payload.eventChoiceId)
      .effects.enqueueEvents[0].choices[0].effects.paperCompetitionResolution;
    const preview=E.previewPaperCompetitionResolution(competitionState,resolution);
    assert.ok(safePayment(E,competitionState,null,preview.sanCost,8));
    assert.ok(preview.score>=15);
    const inReview={...E.prepareConferenceSubmission({...paper,writing:100,idea:100,experiment:100},'C',8,2),
      idea:20,experiment:20};
    const reviewDecision=createPlanner(E).next({...competitionState,papers:[inReview]});
    assert.ok(reviewDecision.payload.eventChoiceId.includes('ignore'),
      'a competition does not change frozen submission scores; protect the next manuscript budget');
  }
  const planBefore=JSON.stringify(spring);
  const pipeline=planPaper(E,spring,{...ready,idea:0,experiment:0,writing:0},{deadline:33});
  assert.ok(pipeline?.steps.length);
  assert.ok(pipeline.steps.filter(step=>!step.activationOnly).every(step=>step.improvementOnly),
    'external nonzero scores cannot silently fulfill an unexecuted quality operation');
  assert.equal(JSON.stringify(spring),planBefore,'planning must not mutate the game or RNG');
  assert.deepEqual(pipeline,planPaper(E,{...spring,randomState:{seed:987654,cursor:123}},
    {...ready,idea:0,experiment:0,writing:0},{deadline:33}),'plans must not depend on hidden future rolls');
  const guided={...spring,advisorProgressState:{...spring.advisorProgressState,pendingGuidanceToPlayer:10}};
  assert.deepEqual(planPaper(E,guided,{...ready,idea:0,experiment:0,writing:0},{deadline:33}),pipeline,
    'uncredited future advisor guidance cannot replace a funded writing operation');
  if(pipeline.steps[0].month===spring.totalMonths){
    const step=pipeline.steps[0],projected=projectAi(E,spring,step.models).state;
    assert.ok(safePayment(E,projected,step.field,expectedResearch(E,projected,ready,step.field).sanCost,8),
      'the controller must be able to execute the budgeted first step safely');
  }
  const lastMonth={...spring,totalMonths:30,year:3,month:6,player:{...spring.player,research:12}};
  const finalReadingMonth={...spring,totalMonths:69,year:6,month:9,
    actionState:{...spring.actionState,limit:1,used:0},
    readingState:{...spring.readingState,readCount:86}};
  assert.equal(readingMilestoneReachable(E,finalReadingMonth),false,
    'graduation settles at month 70: no automatic or manual reads can be purchased after it');
  const lastStep=planPaper(E,lastMonth,{...ready,idea:30,experiment:30,writing:0},{deadline:33});
  assert.ok(lastStep&&lastStep.resultMonth===33,'a result arriving in the transfer month is usable');
  let sameMonth={...spring,totalMonths:32,year:3,month:8,maxMonths:34,totalResearchScore:2,illnessProbability:0,
    papers:[{...E.prepareConferenceSubmission({...ready,idea:100,experiment:100,writing:100},'C',6,3),reviewMonthsLeft:1}]};
  sameMonth=E.executeReplayCommand(sameMonth,{kind:'action',actionId:'next-month',payload:{}},E.REPLAY_RULESET);
  const transferPlanner=createPlanner(E);
  for(let n=0;n<60&&sameMonth.eventQueue.length&&sameMonth.degree!=='phd';n++){
    const decision=transferPlanner.next(sameMonth);
    assert.equal(decision.action,'resolve-event');
    sameMonth=E.executeReplayCommand(sameMonth,{kind:'action',actionId:decision.action,payload:decision.payload},E.REPLAY_RULESET);
  }
  assert.equal(sameMonth.degree,'phd','settle the review before the live transfer condition is rebuilt');
  const blindBoundary={...spring,totalMonths:67,year:6,month:7,degree:'phd',maxMonths:70,
    graduationScoreTarget:7,totalResearchScore:6,illnessProbability:0,
    papers:[{...E.prepareConferenceSubmission({...ready,idea:100,experiment:100,writing:100},'C',4,6),reviewMonthsLeft:1}]};
  const blindFrozen=E.executeReplayCommand(blindBoundary,{kind:'action',actionId:'next-month',payload:{}},E.REPLAY_RULESET);
  assert.equal(blindFrozen.thesis.review.submitted,false,
    'unlike transfer, settling a paper result during April cannot repair an already frozen blind review');
  assert.notEqual(stageGoal(E,{...blindFrozen,totalResearchScore:7,
    thesis:{...blindFrozen.thesis,researchPoints:blindFrozen.thesis.researchPoints.map(p=>({...p,score:500}))}},'phd').id,'finish',
    'late scores and thesis advances cannot turn a frozen failure into a completed graduation plan');
  assert.equal(compareVenues(E,{...blindBoundary,totalMonths:65},{...ready,idea:30,experiment:30,writing:30},{deadline:67}),null,
    'a needed conference result must arrive before blind-review qualification freezes');
  const commitmentState={...spring,totalMonths:10,year:1,month:10,
    roleTalents:{...spring.roleTalents,levels:{}},player:{san:20,research:5,social:4,favor:4,money:20},papers:[]};
  const interruptedPlanner=createPlanner(E);
  let committedState=commitmentState;
  let completedOperations=0;
  for(let n=0;n<12&&completedOperations<2;n++){
    const d=interruptedPlanner.next(committedState);
    committedState=E.executeReplayCommand(committedState,{kind:'action',actionId:d.action,payload:d.payload},E.REPLAY_RULESET);
    // Isolate an interruption of the manuscript controller from new events.
    committedState={...committedState,eventQueue:[],player:{...committedState.player,san:20,money:20}};
    if(d.action==='research-paper')completedOperations++;
  }
  assert.equal(completedOperations,2);
  committedState={...committedState,totalMonths:16,year:2,month:4,aiShopState:E.createAiShopState(),
    actionState:{...committedState.actionState,used:0,aiResearchBonusUsed:false},buffs:committedState.buffs.filter(b=>!b.id.startsWith('ai-')),
    player:{...committedState.player,san:20,money:20}};
  let afterDelay;
  for(let n=0;n<6;n++){
    afterDelay=interruptedPlanner.next(committedState);
    if(afterDelay.action!=='buy-ai-month')break;
    committedState=E.executeReplayCommand(committedState,{kind:'action',actionId:afterDelay.action,payload:afterDelay.payload},E.REPLAY_RULESET);
  }
  assert.equal(afterDelay.action,'research-paper');
  assert.equal(afterDelay.payload.paperActionType,'writing','a calendar interruption must preserve the unfinished writing operation');
  const claudeFillsMissing={...projectAi(E,spring,['gpt','deepseek','gemini']).state,totalMonths:20,year:2,month:8,
    roleTalents:{...spring.roleTalents,levels:{}},totalResearchScore:1,
    actionState:{...spring.actionState,limit:1,used:1,aiResearchBonusUsed:false},
    player:{san:10.416,research:3,social:2,favor:3,money:3.5},
    papers:[{...ready,idea:13,experiment:0,writing:0}]};
  const fillDecision=createPlanner(E).next(claudeFillsMissing);
  assert.equal(fillDecision.action,'buy-ai-month');
  assert.equal(fillDecision.payload.aiSlotId,'claude',
    'planned Claude activation may fill experiment before the writing operation; do not loop replanning the same route');
  const interrupted={...spring,totalMonths:18,year:2,month:6,
    player:{san:5,research:2,social:3,favor:3,money:4.5},
    papers:[{...ready,idea:12,experiment:0,writing:0}],
    shopState:{...spring.shopState,chairOwned:true}};
  const afterInterruption=createPlanner(E).next(interrupted);
  assert.notEqual(afterInterruption.action,'buy-ai-month',
    'a model quoted for next month must not be bought before recovery this month');
  const report = auditTeachingReplay(E,recording);
  const opportunityState={...spring,degree:'phd',year:4,totalMonths:40,month:4,totalResearchScore:5,graduationScoreTarget:7,
    player:{...spring.player,research:12,social:12,favor:10,money:20}};
  const trip={stage:'act2',conferencePreview:{context:{region:'domestic',conferenceName:'Test',conferenceYear:2027,city:'Test'}}};
  assert.equal(opportunityEventPriority(E,opportunityState,trip,'phd').id,'self');
  const brokeTrip={...opportunityState,player:{...opportunityState.player,money:1,favor:3}};
  assert.equal(opportunityEventPriority(E,brokeTrip,trip,'phd').id,'proxy','attendance cannot consume the manuscript or favor safety buffer');
  assert.equal(opportunityEventPriority(E,opportunityState,{...trip,conferencePreview:{context:{...trip.conferencePreview.context,availableAtTotalMonths:72}}},'phd').id,'proxy',
    'do not pay travel for a conference that takes place after graduation');
  const careerState={...opportunityState,conferenceCareerState:{...opportunityState.conferenceCareerState,hasInternshipExperience:true,enterpriseCount:1}};
  const enterpriseMenu={stage:'act2',conferenceActivityPreview:{},choices:[{id:'enterprise-networking'},{id:'tour-local'}]};
  assert.equal(opportunityEventPriority(E,careerState,enterpriseMenu,'phd').id,'enterprise-networking','remote internship experience unlocks the enterprise bridge without an A paper');
  const jointMenu={stage:'act2',conferenceActivityPreview:{},choices:[{id:'big-bull-coop'},{id:'tour-local'}]};
  assert.equal(opportunityEventPriority(E,opportunityState,jointMenu,'phd').id,'big-bull-coop');
  assert.equal(opportunityEventPriority(E,{...opportunityState,player:{...opportunityState.player,research:9,social:8}},
    {...jointMenu,choices:[...jointMenu.choices,{id:'tea-break'}]},'phd').id,'big-bull-coop',
    'build the first contacts before research reaches 12, rather than waiting until too late to accumulate three meetings');
  const romanceMenu={stage:'act2',conferenceActivityPreview:{},choices:[{id:'opposite-scholar'},{id:'tour-local'}]};
  const romanceDecision=opportunityEventPriority(E,opportunityState,romanceMenu,'phd');
  assert.equal(romanceDecision.id,'opposite-scholar');
  assert.equal(opportunityEventPriority(E,{...opportunityState,player:{...opportunityState.player,social:7}},
    {...romanceMenu,choices:[...romanceMenu.choices,{id:'tea-break'}]},'phd').id,'opposite-scholar',
    'start the repeated-contact route before social 12 instead of waiting until graduation');
  const occupied={...opportunityState,loverState:{...opportunityState.loverState,active:true}};
  assert.equal(opportunityEventPriority(E,occupied,romanceMenu,'phd').id,'tour-local','do not jeopardize an existing lover by flirting');
  assert.deepEqual(romanceDecision,opportunityEventPriority(E,opportunityState,{...romanceMenu,
    conferenceActivityPreview:{rolls:[.01,.99]},choices:romanceMenu.choices.map(c=>({...c,effects:{hiddenResult:'different'}}))},'phd'),
    'opportunity decisions must not depend on hidden scholar type or outcome');
  assert.equal(opportunityEventPriority(E,opportunityState,{chainId:'joint-training',stage:'act2'},'phd').id,'accept');
  assert.equal(opportunityEventPriority(E,opportunityState,{loverDevelopmentPreview:{},stage:'act2'},'phd').id,'accept');
  const late={...opportunityState,year:6,totalMonths:62};
  const journalPaper={...ready,idea:50,experiment:45,writing:35};
  const journalDecision=compareVenues(E,late,journalPaper);
  assert.equal(journalDecision.action,'submit-journal-paper');
  assert.equal(journalDecision.payload.journalTarget,'pami');
  const submittedJournal=E.executeReplayCommand({...late,papers:[journalPaper]},
    {kind:'action',actionId:journalDecision.action,payload:journalDecision.payload},E.REPLAY_RULESET);
  assert.equal(submittedJournal.papers[0].status,'journal-reviewing');
  const journalConfirmation=createPlanner(E).next(submittedJournal);
  assert.equal(journalConfirmation.action,'submit-journal-paper');
  const publishedJournal=E.executeReplayCommand(submittedJournal,{kind:'action',actionId:journalConfirmation.action,payload:journalConfirmation.payload},E.REPLAY_RULESET);
  assert.equal(publishedJournal.totalResearchScore,late.totalResearchScore+5,'journal requires an explicit second publication confirmation');
  const graduationReady={...submittedJournal,totalResearchScore:20,thesis:{...publishedJournal.thesis,
    researchPoints:publishedJournal.thesis.researchPoints.map(point=>({...point,score:500}))}};
  assert.equal(stageGoal(E,graduationReady,'phd').id,'finish');
  assert.equal(createPlanner(E).next(graduationReady).action,'submit-journal-paper',
    'confirm an already completed journal before idling through graduation');
  assert.notEqual(compareVenues(E,late,{...journalPaper,idea:30,experiment:30,writing:30})?.action,'submit-journal-paper',
    '75-point submission threshold is not the 125-point publication threshold');
  assert.equal(compareVenues(E,{...late,totalMonths:69},{...journalPaper,idea:30,experiment:30,writing:30}),null,
    'a high acceptance probability cannot justify a review that finishes after graduation');
  assert.equal(compareVenues(E,{...late,totalMonths:69},journalPaper)?.action,'submit-journal-paper',
    'an already-ready journal can still be completed when conference review is too late');
  assert.notEqual(compareVenues(E,{...late,player:{...late.player,money:0},advisorProgressState:{...late.advisorProgressState,funding:2}},journalPaper)?.action,'submit-journal-paper',
    'journal must have affordable publication fees');
  const costlyOffer={chainId:'internship-invite',stage:'act2',internshipInvitePreview:{context:{offer:{monthlySanCost:1}}}};
  assert.equal(opportunityEventPriority(E,{...opportunityState,player:{...opportunityState.player,san:8}},costlyOffer,'phd').id,'decline',
    'do not inspect an unrevealed cheap internship offer to justify an unsafe commitment');
  const sustainableIntern={...opportunityState,sanCap:50,player:{...opportunityState.player,san:50,money:30},
    shopState:{...opportunityState.shopState,chairOwned:true,chairUpgrade:'massage'}};
  const beforeIntern=JSON.stringify(sustainableIntern),internBudget=internshipBudget(E,sustainableIntern);
  assert.equal(E.getRoleRestSanGain(sustainableIntern),2);
  assert.equal(internBudget.sustainable,true,'monthly recovery and starting SAN can sustain an ordinary role with only +2 per rest');
  assert.ok(internBudget.researchWindows>=2);
  assert.equal(JSON.stringify(sustainableIntern),beforeIntern,'internship forecasting must not mutate the run or RNG');
  assert.equal(opportunityEventPriority(E,sustainableIntern,costlyOffer,'phd').id,'accept');
  assert.deepEqual(opportunityEventPriority(E,sustainableIntern,costlyOffer,'phd'),
    opportunityEventPriority(E,sustainableIntern,{...costlyOffer,internshipInvitePreview:{context:{offer:{monthlySanCost:6,baseMonthlyIncome:2}}}},'phd'),
    'both cheap and expensive hidden offers must use the same public worst-case budget');
  assert.equal(planLoverActivity(E,occupied),null,'no lover action is available before the progression profile is active');
  const wastedHelp={...occupied,papers:[],loverProgressState:{...occupied.loverProgressState,active:true,
    intimacy:4,research:10,pendingPaperHelp:{amount:10,name:'Test'},routes:{study:{progress:99,completed:0},play:{progress:0,completed:0}}}};
  assert.notEqual(planLoverActivity(E,wastedHelp)?.action,'lover-study','do not spend SAN to duplicate stored, non-stacking paper help');
  assert.equal(report.finalDigest,recording.finalDigest);
  assert.ok(report.stages.length > 0);
  assert.equal(report.needsManualReview, true);
  const master=E.parseReplayRecording(await readFile('public/official-replays/normal-master-10.json','utf8'));
  const shortRoute={...s,totalMonths:2,year:1,month:2,eventQueue:[],player:{...s.player,san:20,money:3}};
  assert.notEqual(createPlanner(E,{degreeGoal:'master'}).next(shortRoute).action,'part-time-work',
    'do not save for a chair whose SAN value cannot repay its work cost during a masters route');
  let graduateYear=structuredClone(master.replay.initial);
  for(const c of master.replay.commands){graduateYear=E.executeReplayCommand(graduateYear,c,master.replay.ruleset);if(graduateYear.totalMonths>=25)break;}
  const missingMasterPaper={...graduateYear,eventQueue:[],totalResearchScore:0,
    papers:[],externalPublications:[],player:{...graduateYear.player,san:20,money:8}};
  assert.equal(E.getThesisForecast(missingMasterPaper).stage,'writing');
  assert.equal(E.getThesisForecast(missingMasterPaper).currentPass,false);
  assert.notEqual(createPlanner(E,{degreeGoal:'master'}).next(missingMasterPaper).action,'advance-thesis-point',
    'protect the first three graduation-year months for the required paper instead of spending every month on the thesis first');
  const wrongRoute=auditTeachingReplay(E,master,{degreeGoal:'phd'});
  assert.ok(wrongRoute.issues.some(x=>x.code==='wrong-degree-ending'), 'a master ending cannot qualify a PhD tutorial');
  // A small synthetic audit fixture keeps this regression independent of which
  // tutorial is currently published. Publication legality is checked separately.
  const initial={...E.createInitialState(),player:{...E.createInitialState().player,money:20}};
  const start={kind:'action',actionId:'start-game',payload:{roleId:'rich',talentAllocation:{heiress:4}}};
  const commands=[start];let fixture=E.executeReplayCommand(initial,start,E.REPLAY_RULESET);
  for(const id of ['before-grad-school-open-advisor-info','before-grad-school-confirm','before-grad-school-finish']){
    const event=fixture.eventQueue[0];const c={kind:'action',actionId:'resolve-event',payload:{eventId:event.id,eventChoiceId:id}};
    fixture=E.executeReplayCommand(fixture,c,E.REPLAY_RULESET);commands.push(c);
  }
  commands.push({kind:'action',actionId:'next-month',payload:{}});
  commands.push({kind:'action',actionId:'buy-ai-month',payload:{aiSlotId:'gpt'}});
  const waste=auditTeachingReplay(E,{replay:{initial,commands,ruleset:E.REPLAY_RULESET}});
  assert.ok(waste.issues.some(x=>x.code==='paid-ai-unused'),'paid model without a research operation must fail');
  console.log('Autoplay estimation and teaching quality checks passed.');
} finally { await close(); }
