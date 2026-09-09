import fs from 'node:fs';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const fail=[];
const assert=(ok,msg)=>{if(!ok) fail.push(msg)};
const uniq=xs=>new Set(xs).size===xs.length;
const validTime=v=>Number.isFinite(Date.parse(v));
const compact=s=>String(s??'').replace(/\s+/g,' ').trim();

const pipeline=read('data/political-information-ingestion-pipeline.json');
const ledger=read('data/runtime/contest-facts.json');
const areas=read('data/runtime/area-evidence-records.json');
const details=read('data/runtime/source-detail-snapshots.json');

assert(ledger.status==='ACTIVE','contest fact ledger is not ACTIVE');
const pipelineClasses=(pipeline.areas||[]).map(x=>x.competition_class).sort();
const supported=[...(ledger.supported_competition_classes||[])].sort();
assert(JSON.stringify(supported)===JSON.stringify(pipelineClasses),'contest fact layer does not support exactly the configured competition classes');
assert(uniq(ledger.fact_types||[]),'contest fact types are duplicated');

for(const rule of [
  'fact_requires_active_area_evidence','fact_requires_substantive_detail_lineage','fact_is_observation_not_inference',
  'fact_must_preserve_source_text','entity_identity_requires_resolved_area_entity','entity_mention_does_not_establish_position',
  'support_or_opposition_requires_explicit_source_language','resistance_cannot_be_inferred_from_generic_amendment_language',
  'possible_outcome_language_is_not_verified_outcome','fact_does_not_register_competition','fact_does_not_change_projection',
  'later_extraction_preserves_original_evidence_capture_time','facts_are_append_only_by_fact_id'
]) assert(ledger.rules?.[rule]===true,`contest fact rule missing: ${rule}`);

const allAreas=areas.records||[];
const areaById=new Map(allAreas.map(x=>[x.area_evidence_id,x]));
const activeAreas=allAreas.filter(x=>x.routing_state==='SUBSTANTIVE_CONTENT_ROUTED');
const detailByVersion=new Map((details.records||[]).map(x=>[x.detail_version_id,x]));
const allowedTypes=new Set(ledger.fact_types||[]);
const facts=ledger.facts||[];
assert(uniq(facts.map(x=>x.fact_id)),'contest fact IDs are not unique');

for(const fact of facts){
  const area=areaById.get(fact.area_evidence_id);
  assert(Boolean(area),`${fact.fact_id}: parent area evidence missing`);
  const detail=detailByVersion.get(fact.detail_version_id);
  assert(Boolean(detail),`${fact.fact_id}: detail version missing`);
  assert(allowedTypes.has(fact.fact_type),`${fact.fact_id}: invalid fact type ${fact.fact_type}`);
  assert(['OBSERVED_SOURCE_TEXT','RETRACTED_EXTRACTION_NOISE'].includes(fact.fact_state),`${fact.fact_id}: invalid fact state ${fact.fact_state}`);
  assert(typeof fact.evidence_text==='string'&&fact.evidence_text.length>0,`${fact.fact_id}: evidence text missing`);
  assert(typeof fact.evidence_match==='string'&&fact.evidence_match.length>0,`${fact.fact_id}: evidence match missing`);
  assert(validTime(fact.evidence_captured_at),`${fact.fact_id}: evidence capture time invalid`);
  assert(validTime(fact.extracted_at),`${fact.fact_id}: extracted_at invalid`);
  assert(fact.inference===null&&fact.inference_class==='NONE',`${fact.fact_id}: inference entered fact layer`);
  assert(fact.projection_effect==='NO_EFFECT',`${fact.fact_id}: fact affects projection`);
  if(area){
    assert(fact.competition_class===area.competition_class,`${fact.fact_id}: competition class lineage mismatch`);
    assert(fact.jurisdiction_id===area.jurisdiction_id,`${fact.fact_id}: jurisdiction lineage mismatch`);
    assert(fact.detail_record_id===area.detail_record_id,`${fact.fact_id}: detail record lineage mismatch`);
    assert(fact.detail_version_id===area.detail_version_id,`${fact.fact_id}: detail version lineage mismatch`);
    assert(fact.source_snapshot_id===area.source_snapshot_id,`${fact.fact_id}: source snapshot lineage mismatch`);
    assert(fact.evidence_captured_at===area.evidence_captured_at,`${fact.fact_id}: evidence capture time changed during extraction`);
    for(const actorId of fact.actor_ids||[]) assert((area.actor_ids||[]).includes(actorId),`${fact.fact_id}: actor ${actorId} was not resolved in parent area evidence`);
    for(const partyId of fact.party_ids||[]) assert((area.party_ids||[]).includes(partyId),`${fact.fact_id}: team ${partyId} was not resolved in parent area evidence`);
  }
  if(detail) assert(compact(detail.body_text).includes(compact(fact.evidence_text)),`${fact.fact_id}: preserved evidence text not found in substantive source body`);

  if(fact.fact_state==='OBSERVED_SOURCE_TEXT'){
    assert(area?.routing_state==='SUBSTANTIVE_CONTENT_ROUTED',`${fact.fact_id}: active fact references inactive area evidence`);
  }else{
    assert(validTime(fact.retracted_at),`${fact.fact_id}: retracted fact missing retracted_at`);
    assert(Boolean(fact.retraction_reason),`${fact.fact_id}: retracted fact missing reason`);
    assert(Array.isArray(fact.fact_state_history)&&fact.fact_state_history.some(x=>x.to==='RETRACTED_EXTRACTION_NOISE'),`${fact.fact_id}: retracted fact lacks append-only state history`);
  }

  if(['EXPLICIT_SUPPORT_POSITION','EXPLICIT_OPPOSITION_POSITION'].includes(fact.fact_type)){
    assert((fact.actor_ids||[]).length+(fact.party_ids||[]).length>0,`${fact.fact_id}: explicit position lacks resolved entity`);
    assert(fact.position_state===(fact.fact_type==='EXPLICIT_SUPPORT_POSITION'?'SUPPORTING':'OPPOSING'),`${fact.fact_id}: explicit position state mismatch`);
  }else assert(fact.position_state==='UNRESOLVED',`${fact.fact_id}: non-position fact inferred a position`);
  if(fact.fact_type==='MATERIAL_RESISTANCE'){
    assert(fact.resistance_state==='EXPLICIT_RESISTANCE_LANGUAGE',`${fact.fact_id}: material resistance not explicitly marked`);
    assert(!/^amend(?:ment)?$/i.test(compact(fact.evidence_match)),`${fact.fact_id}: generic amendment language used as material resistance`);
  }
  if(fact.fact_type==='POSSIBLE_OUTCOME_STATE') assert(fact.outcome_verification_state==='REQUIRES_SEPARATE_VERIFICATION',`${fact.fact_id}: possible outcome bypassed verification`);
}

const activeFacts=facts.filter(x=>x.fact_state==='OBSERVED_SOURCE_TEXT');
const retractedFacts=facts.filter(x=>x.fact_state==='RETRACTED_EXTRACTION_NOISE');
if(activeFacts.length>0){
  for(const area of activeAreas) assert(activeFacts.some(x=>x.area_evidence_id===area.area_evidence_id),`${area.area_evidence_id}: active area evidence produced no active contest facts`);
}

if(fail.length){
  console.error('POLITICAL_MAYHEM_CONTEST_FACT_INTEGRITY_FAILED');
  for(const msg of fail) console.error('- '+msg);
  process.exit(1);
}
console.log('POLITICAL_MAYHEM_CONTEST_FACT_INTEGRITY_PASS',`areas=${activeAreas.length}`,`activeFacts=${activeFacts.length}`,`retractedFacts=${retractedFacts.length}`,`classes=${supported.length}`);
