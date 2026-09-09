import fs from 'node:fs';
import crypto from 'node:crypto';

const AREAS='data/runtime/area-evidence-records.json';
const FACTS='data/runtime/contest-facts.json';
const LEDGER='data/runtime/competition-threshold-evaluations.json';
const CLASSES='data/political-competition-class-registry.json';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const sha=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
const uniq=xs=>[...new Set(xs.filter(Boolean))];

const areas=read(AREAS);
const factsLedger=read(FACTS);
const ledger=read(LEDGER);
const classes=read(CLASSES);
ledger.evaluations ||= [];

const classById=new Map((classes.classes||[]).map(x=>[x.competition_class,x]));
const evaluationByArea=new Map(ledger.evaluations.map(x=>[x.area_evidence_id,x]));
const activeFacts=(factsLedger.facts||[]).filter(x=>x.fact_state==='OBSERVED_SOURCE_TEXT');
const factsByArea=new Map();
for(const fact of activeFacts){
  if(!factsByArea.has(fact.area_evidence_id)) factsByArea.set(fact.area_evidence_id,[]);
  factsByArea.get(fact.area_evidence_id).push(fact);
}
const now=new Date().toISOString();
let created=0,changed=0;

const entityTokens=facts=>uniq(facts.flatMap(f=>[
  ...(f.actor_ids||[]).map(id=>`ACTOR:${id}`),
  ...(f.party_ids||[]).map(id=>`TEAM:${id}`)
]));

function conditionResult(condition,row,facts){
  const participantTokens=uniq([
    ...(row.actor_ids||[]).map(id=>`ACTOR:${id}`),
    ...(row.party_ids||[]).map(id=>`TEAM:${id}`),
    ...entityTokens(facts.filter(x=>x.fact_type==='PARTICIPANT'))
  ]);
  const support=entityTokens(facts.filter(x=>x.fact_type==='EXPLICIT_SUPPORT_POSITION'));
  const oppose=entityTokens(facts.filter(x=>x.fact_type==='EXPLICIT_OPPOSITION_POSITION'));
  if(condition==='RESOLVED_PARTICIPANT_OR_TEAM') return {state:participantTokens.length>0?'SATISFIED':'MISSING',support,oppose,participantTokens};
  if(condition==='AT_LEAST_TWO_RESOLVED_PARTICIPANTS_OR_TEAMS') return {state:participantTokens.length>=2?'SATISFIED':'MISSING',support,oppose,participantTokens};
  if(condition==='IDENTIFIABLE_PUBLIC_ACTOR') return {state:(row.public_actor_ids||[]).length>0?'SATISFIED':'MISSING',support,oppose,participantTokens};
  if(condition==='DISTINCT_SUPPORTING_AND_OPPOSING_SIDES'){
    if(!support.length||!oppose.length) return {state:'MISSING',support,oppose,participantTokens};
    const overlap=support.filter(x=>oppose.includes(x));
    return {state:overlap.length?'REVIEW_REQUIRED':'SATISFIED',support,oppose,participantTokens,overlap};
  }
  return {state:'MISSING',support,oppose,participantTokens};
}

for(const row of areas.records||[]){
  const policy=ledger.thresholds?.[row.competition_class];
  if(!policy) continue;
  const facts=factsByArea.get(row.area_evidence_id)||[];
  const factTypes=new Set(facts.map(x=>x.fact_type));
  const missingFactTypes=(policy.required_fact_types||[]).filter(type=>!factTypes.has(type));
  const conditionResults=(policy.required_conditions||[]).map(condition=>({condition,...conditionResult(condition,row,facts)}));
  const missingConditions=conditionResults.filter(x=>x.state==='MISSING').map(x=>x.condition);
  const reviewConditions=conditionResults.filter(x=>x.state==='REVIEW_REQUIRED');
  const blockers=[
    ...missingFactTypes.map(x=>`MISSING_FACT_TYPE_${x}`),
    ...missingConditions.map(x=>`MISSING_CONDITION_${x}`),
    ...reviewConditions.map(x=>`REVIEW_CONDITION_${x.condition}`)
  ];

  let evaluationState;
  if(row.routing_state!=='SUBSTANTIVE_CONTENT_ROUTED') evaluationState='NOT_A_MATCH';
  else if(missingFactTypes.length||missingConditions.length) evaluationState='EVIDENCE_GAP';
  else if(reviewConditions.length) evaluationState='REVIEW_REQUIRED';
  else evaluationState='ELIGIBLE_FOR_REGISTRATION';

  if(evaluationState==='NOT_A_MATCH'){
    blockers.length=0;
    blockers.push('AREA_ROUTING_RETRACTED_AS_NOISE');
  }

  const supportFacts=facts.filter(x=>x.fact_type==='EXPLICIT_SUPPORT_POSITION');
  const opposeFacts=facts.filter(x=>x.fact_type==='EXPLICIT_OPPOSITION_POSITION');
  const supportingEntities=entityTokens(supportFacts);
  const opposingEntities=entityTokens(opposeFacts);
  const evaluationId=`THRESH-${sha(row.area_evidence_id).slice(0,24)}`;
  const snapshot={
    evaluation_id:evaluationId,
    area_evidence_id:row.area_evidence_id,
    detail_record_id:row.detail_record_id,
    detail_version_id:row.detail_version_id,
    source_snapshot_id:row.source_snapshot_id,
    jurisdiction_id:row.jurisdiction_id,
    competition_class:row.competition_class,
    threshold_id:policy.threshold_id,
    canonical_registration_threshold:classById.get(row.competition_class)?.registration_threshold||null,
    evaluation_state:evaluationState,
    evaluated_at:now,
    active_fact_ids:facts.map(x=>x.fact_id),
    active_fact_types:uniq(facts.map(x=>x.fact_type)).sort(),
    satisfied_fact_types:(policy.required_fact_types||[]).filter(type=>factTypes.has(type)),
    missing_fact_types:missingFactTypes,
    condition_results:conditionResults.map(x=>({condition:x.condition,state:x.state,overlap:x.overlap||[]})),
    supporting_entities:supportingEntities,
    opposing_entities:opposingEntities,
    blockers,
    registration_action:'NO_AUTOMATIC_REGISTRATION',
    projection_effect:'NO_EFFECT',
    inference:null,
    inference_class:'NONE',
    integrity:{active_facts_only:true,retracted_facts_excluded:true,eligibility_does_not_register_competition:true,possible_outcome_not_verified_here:true}
  };

  const prior=evaluationByArea.get(row.area_evidence_id);
  if(!prior){
    snapshot.state_history=[{from:null,to:evaluationState,at:now,reason:'INITIAL_THRESHOLD_EVALUATION'}];
    ledger.evaluations.push(snapshot);
    evaluationByArea.set(row.area_evidence_id,snapshot);
    created++;
  }else{
    const before=prior.evaluation_state;
    const history=Array.isArray(prior.state_history)?prior.state_history:[];
    Object.assign(prior,snapshot,{state_history:history});
    if(before!==evaluationState){
      prior.state_history.push({from:before,to:evaluationState,at:now,reason:'ACTIVE_FACT_OR_AREA_STATE_CHANGED'});
      changed++;
    }
  }
}

ledger.updated_at=now;
ledger.summary={
  evaluations_total:ledger.evaluations.length,
  by_state:Object.fromEntries((ledger.states||[]).map(state=>[state,ledger.evaluations.filter(x=>x.evaluation_state===state).length])),
  created_this_run:created,
  state_changes_this_run:changed,
  eligible_evaluation_ids:ledger.evaluations.filter(x=>x.evaluation_state==='ELIGIBLE_FOR_REGISTRATION').map(x=>x.evaluation_id)
};
write(LEDGER,ledger);
console.log('POLITICAL_MAYHEM_COMPETITION_THRESHOLD_EVALUATION_OK',`evaluations=${ledger.evaluations.length}`,`created=${created}`,`changed=${changed}`,`eligible=${ledger.summary.by_state.ELIGIBLE_FOR_REGISTRATION||0}`,`gaps=${ledger.summary.by_state.EVIDENCE_GAP||0}`,`notMatch=${ledger.summary.by_state.NOT_A_MATCH||0}`);
