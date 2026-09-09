import fs from 'node:fs';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const fail=[];
const assert=(condition,message)=>{if(!condition) fail.push(message)};
const unique=xs=>new Set(xs).size===xs.length;

const pipeline=read('data/political-information-ingestion-pipeline.json');
const classes=read('data/political-competition-class-registry.json');

assert(pipeline.status==='ACTIVE','information ingestion pipeline is not ACTIVE');
for(const rule of [
  'source_index_change_is_not_substantive_evidence',
  'record_title_is_not_substitute_for_record_body',
  'underlying_record_must_be_acquired_when_publicly_accessible',
  'detail_capture_must_preserve_temporal_provenance',
  'retrospective_and_ongoing_discovery_are_both_valid',
  'later_discovery_cannot_be_credited_to_an_earlier_frozen_tip',
  'observation_remains_distinct_from_inference',
  'area_routing_may_be_multi_label',
  'entity_resolution_must_not_invent_identity',
  'competition_threshold_evaluation_occurs_after_substantive_ingestion',
  'failed_detail_acquisition_remains_explicit',
  'institutional_self_reporting_alone_does_not_prove_public_gain'
]) assert(pipeline.rules?.[rule]===true,`missing pipeline rule: ${rule}`);

const stages=pipeline.stages||[];
assert(stages.length===13,`expected 13 ingestion stages, found ${stages.length}`);
assert(unique(stages.map(x=>x.stage_id)),'ingestion stage IDs are not unique');
for(let i=1;i<=13;i++) assert(stages.some(x=>x.stage===i),`ingestion stage ${i} missing`);
for(const required of [
  'SOURCE_DISCOVERY','SOURCE_CAPTURE','RECORD_DETECTION','RECORD_DETAIL_ACQUISITION',
  'DETAIL_EVIDENCE_PRESERVATION','INFORMATION_NORMALISATION','AREA_ROUTING',
  'ENTITY_RESOLUTION','CONTEST_FACT_EXTRACTION','COMPETITION_THRESHOLD_EVALUATION',
  'INTELLIGENCE_WRITE','MATCH_DISCOVERY_OR_UPDATE','OUTCOME_VERIFICATION'
]) assert(stages.some(x=>x.stage_id===required),`ingestion stage missing: ${required}`);

for(const output of ['detail_snapshots','area_evidence','intelligence_events','competition_discovery','registered_matches','verified_outcomes']){
  assert(Boolean(pipeline.runtime_outputs?.[output]),`runtime output missing: ${output}`);
}

const classIds=new Set((classes.classes||[]).map(x=>x.competition_class));
const areas=pipeline.areas||[];
const areaIds=areas.map(x=>x.competition_class);
assert(unique(areaIds),'ingestion area classes are duplicated');
assert(areas.length===classIds.size,`ingestion pipeline covers ${areas.length} areas but competition registry has ${classIds.size}`);
for(const classId of classIds) assert(areaIds.includes(classId),`ingestion pipeline missing competition area ${classId}`);
for(const area of areas){
  assert(classIds.has(area.competition_class),`unknown ingestion competition area ${area.competition_class}`);
  assert(Array.isArray(area.required_information)&&area.required_information.length>=3,`${area.competition_class}: required_information incomplete`);
  assert(Array.isArray(area.high_value_sources)&&area.high_value_sources.length>=2,`${area.competition_class}: high_value_sources incomplete`);
  assert(Array.isArray(area.substantive_record_types)&&area.substantive_record_types.length>=3,`${area.competition_class}: substantive_record_types incomplete`);
}

const publicPressure=areas.find(x=>x.competition_class==='PUBLIC_PRESSURE');
assert(publicPressure?.required_information?.includes('defined public demand'),'PUBLIC_PRESSURE must ingest a defined public demand');
assert(publicPressure?.required_information?.includes('measurable concession/reversal/outcome'),'PUBLIC_PRESSURE must ingest measurable public outcome evidence');
assert(publicPressure?.required_information?.includes('causal evidence before claiming pressure forced the outcome'),'PUBLIC_PRESSURE must preserve causation boundary');

if(fail.length){
  console.error('POLITICAL_MAYHEM_INFORMATION_INGESTION_PIPELINE_FAILED');
  for(const message of fail) console.error('- '+message);
  process.exit(1);
}
console.log('POLITICAL_MAYHEM_INFORMATION_INGESTION_PIPELINE_PASS',`stages=${stages.length}`,`areas=${areas.length}`);
