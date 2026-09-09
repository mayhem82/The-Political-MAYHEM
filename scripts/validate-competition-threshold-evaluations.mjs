import fs from 'node:fs';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const fail=[];
const assert=(ok,msg)=>{if(!ok) fail.push(msg)};
const uniq=xs=>new Set(xs).size===xs.length;
const validTime=v=>Number.isFinite(Date.parse(v));

const ledger=read('data/runtime/competition-threshold-evaluations.json');
const factsLedger=read('data/runtime/contest-facts.json');
const areas=read('data/runtime/area-evidence-records.json');
const classes=read('data/political-competition-class-registry.json');

assert(ledger.status==='ACTIVE','threshold evaluation ledger is not ACTIVE');
assert(uniq(ledger.states||[]),'threshold states are duplicated');
for(const state of ['NOT_A_MATCH','EVIDENCE_GAP','REVIEW_REQUIRED','ELIGIBLE_FOR_REGISTRATION']) assert((ledger.states||[]).includes(state),`threshold state missing: ${state}`);
for(const rule of [
  'evaluation_requires_area_evidence_lineage','only_active_contest_facts_can_satisfy_threshold','retracted_area_routes_evaluate_as_not_a_match',
  'absence_of_fact_is_a_blocker_not_negative_evidence','material_resistance_requires_active_material_resistance_fact',
  'supporting_side_requires_explicit_position_evidence','opposing_side_requires_explicit_position_evidence','same_entity_on_both_sides_requires_review',
  'possible_outcome_state_does_not_verify_outcome','eligibility_does_not_register_a_competition','evaluation_does_not_change_projection','evaluation_state_changes_are_append_only'
]) assert(ledger.rules?.[rule]===true,`threshold rule missing: ${rule}`);

const classById=new Map((classes.classes||[]).map(x=>[x.competition_class,x]));
const thresholdClasses=Object.keys(ledger.thresholds||{}).sort();
const registryClasses=[...classById.keys()].sort();
assert(JSON.stringify(thresholdClasses)===JSON.stringify(registryClasses),'threshold policy does not cover exactly the competition registry classes');
for(const [classId,policy] of Object.entries(ledger.thresholds||{})){
  assert(Boolean(policy.threshold_id),`${classId}: threshold_id missing`);
  assert(Array.isArray(policy.required_fact_types),`${classId}: required_fact_types missing`);
  assert(Array.isArray(policy.required_conditions),`${classId}: required_conditions missing`);
  const canonical=classById.get(classId)?.registration_threshold;
  if(canonical) assert(policy.threshold_id===canonical,`${classId}: threshold_id does not match canonical registration threshold`);
}

const areaById=new Map((areas.records||[]).map(x=>[x.area_evidence_id,x]));
const activeFacts=(factsLedger.facts||[]).filter(x=>x.fact_state==='OBSERVED_SOURCE_TEXT');
const activeFactById=new Map(activeFacts.map(x=>[x.fact_id,x]));
const evaluations=ledger.evaluations||[];
assert(uniq(evaluations.map(x=>x.evaluation_id)),'threshold evaluation IDs are not unique');
assert(uniq(evaluations.map(x=>x.area_evidence_id)),'more than one current threshold evaluation exists for an area');

for(const e of evaluations){
  const area=areaById.get(e.area_evidence_id);
  assert(Boolean(area),`${e.evaluation_id}: parent area evidence missing`);
  const policy=ledger.thresholds?.[e.competition_class];
  assert(Boolean(policy),`${e.evaluation_id}: threshold policy missing`);
  assert((ledger.states||[]).includes(e.evaluation_state),`${e.evaluation_id}: invalid state ${e.evaluation_state}`);
  assert(validTime(e.evaluated_at),`${e.evaluation_id}: evaluated_at invalid`);
  assert(Array.isArray(e.state_history)&&e.state_history.length>0,`${e.evaluation_id}: state history missing`);
  assert(e.registration_action==='NO_AUTOMATIC_REGISTRATION',`${e.evaluation_id}: automatic registration action detected`);
  assert(e.projection_effect==='NO_EFFECT',`${e.evaluation_id}: threshold evaluation affects projection`);
  assert(e.inference===null&&e.inference_class==='NONE',`${e.evaluation_id}: threshold evaluation contains inference`);
  if(area){
    assert(e.competition_class===area.competition_class,`${e.evaluation_id}: competition class lineage mismatch`);
    assert(e.jurisdiction_id===area.jurisdiction_id,`${e.evaluation_id}: jurisdiction lineage mismatch`);
    assert(e.detail_record_id===area.detail_record_id,`${e.evaluation_id}: detail record lineage mismatch`);
    assert(e.detail_version_id===area.detail_version_id,`${e.evaluation_id}: detail version lineage mismatch`);
    assert(e.source_snapshot_id===area.source_snapshot_id,`${e.evaluation_id}: source snapshot lineage mismatch`);
  }
  for(const factId of e.active_fact_ids||[]){
    const fact=activeFactById.get(factId);
    assert(Boolean(fact),`${e.evaluation_id}: active_fact_id ${factId} is not an active fact`);
    if(fact) assert(fact.area_evidence_id===e.area_evidence_id,`${e.evaluation_id}: fact ${factId} belongs to another area`);
  }
  const activeTypes=new Set((e.active_fact_ids||[]).map(id=>activeFactById.get(id)?.fact_type).filter(Boolean));
  const computedMissing=(policy?.required_fact_types||[]).filter(type=>!activeTypes.has(type)).sort();
  assert(JSON.stringify([...(e.missing_fact_types||[])].sort())===JSON.stringify(computedMissing),`${e.evaluation_id}: missing fact types do not reconcile`);

  if(e.evaluation_state==='NOT_A_MATCH'){
    assert(area?.routing_state==='RETRACTED_ROUTING_NOISE',`${e.evaluation_id}: NOT_A_MATCH parent route is still active`);
    assert((e.blockers||[]).includes('AREA_ROUTING_RETRACTED_AS_NOISE'),`${e.evaluation_id}: NOT_A_MATCH reason missing`);
  }else{
    assert(area?.routing_state==='SUBSTANTIVE_CONTENT_ROUTED',`${e.evaluation_id}: active threshold state references retracted area`);
  }
  if(e.evaluation_state==='EVIDENCE_GAP') assert((e.missing_fact_types||[]).length>0||(e.condition_results||[]).some(x=>x.state==='MISSING'),`${e.evaluation_id}: EVIDENCE_GAP has no missing requirement`);
  if(e.evaluation_state==='REVIEW_REQUIRED') assert((e.condition_results||[]).some(x=>x.state==='REVIEW_REQUIRED'),`${e.evaluation_id}: REVIEW_REQUIRED has no review condition`);
  if(e.evaluation_state==='ELIGIBLE_FOR_REGISTRATION'){
    assert((e.blockers||[]).length===0,`${e.evaluation_id}: eligible evaluation has blockers`);
    assert((e.missing_fact_types||[]).length===0,`${e.evaluation_id}: eligible evaluation lacks required facts`);
    assert((e.condition_results||[]).every(x=>x.state==='SATISFIED'),`${e.evaluation_id}: eligible evaluation has unsatisfied condition`);
    if((policy?.required_fact_types||[]).includes('MATERIAL_RESISTANCE')) assert(activeTypes.has('MATERIAL_RESISTANCE'),`${e.evaluation_id}: eligible threshold lacks material resistance fact`);
    if((policy?.required_fact_types||[]).includes('EXPLICIT_SUPPORT_POSITION')) assert(activeTypes.has('EXPLICIT_SUPPORT_POSITION'),`${e.evaluation_id}: eligible threshold lacks explicit support fact`);
    if((policy?.required_fact_types||[]).includes('EXPLICIT_OPPOSITION_POSITION')) assert(activeTypes.has('EXPLICIT_OPPOSITION_POSITION'),`${e.evaluation_id}: eligible threshold lacks explicit opposition fact`);
  }
}

if(evaluations.length>0){
  for(const area of areas.records||[]) assert(evaluations.some(x=>x.area_evidence_id===area.area_evidence_id),`${area.area_evidence_id}: area has no threshold evaluation`);
}

if(fail.length){
  console.error('POLITICAL_MAYHEM_COMPETITION_THRESHOLD_INTEGRITY_FAILED');
  for(const msg of fail) console.error('- '+msg);
  process.exit(1);
}
console.log('POLITICAL_MAYHEM_COMPETITION_THRESHOLD_INTEGRITY_PASS',`evaluations=${evaluations.length}`,`eligible=${evaluations.filter(x=>x.evaluation_state==='ELIGIBLE_FOR_REGISTRATION').length}`,`gaps=${evaluations.filter(x=>x.evaluation_state==='EVIDENCE_GAP').length}`,`notMatch=${evaluations.filter(x=>x.evaluation_state==='NOT_A_MATCH').length}`);
