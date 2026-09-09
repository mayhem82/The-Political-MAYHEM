import fs from 'node:fs';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const fail=[];
const assert=(condition,message)=>{if(!condition) fail.push(message)};
const unique=xs=>new Set(xs).size===xs.length;
const validTime=v=>Number.isFinite(Date.parse(v));

const pipeline=read('data/political-information-ingestion-pipeline.json');
const details=read('data/runtime/source-detail-snapshots.json');
const areas=read('data/runtime/area-evidence-records.json');
const reviews=read('data/runtime/signal-reviews.json');
const events=read('data/runtime/intelligence-events.json');

assert(details.status==='ACTIVE','source detail ledger is not ACTIVE');
assert(areas.status==='ACTIVE','area evidence ledger is not ACTIVE');
const validAreas=new Set((pipeline.areas||[]).map(x=>x.competition_class));
const reviewIds=new Set((reviews.reviews||[]).map(x=>x.review_id));
const eventIds=new Set((events.events||[]).map(x=>x.event_id));

const detailRows=details.records||[];
assert(unique(detailRows.map(x=>x.detail_version_id)),'detail version IDs are not unique');
assert(unique(detailRows.map(x=>x.detail_record_id)),'detail record IDs are duplicated before versioning support exists');
const detailByVersion=new Map(detailRows.map(x=>[x.detail_version_id,x]));
for(const row of detailRows){
  assert(Boolean(row.detail_record_id),`${row.detail_version_id}: detail_record_id missing`);
  assert(row.version===1,`${row.detail_version_id}: unsupported detail version`);
  assert(/^https?:\/\//.test(row.record_url||''),`${row.detail_version_id}: record_url invalid`);
  assert(validTime(row.captured_at),`${row.detail_version_id}: captured_at invalid`);
  assert(typeof row.content_hash==='string'&&row.content_hash.length===64,`${row.detail_version_id}: content_hash invalid`);
  assert(typeof row.body_text==='string'&&row.body_text.length>=40,`${row.detail_version_id}: substantive body missing`);
  assert(Number.isInteger(row.body_length)&&row.body_length>=row.body_text.length,`${row.detail_version_id}: body_length invalid`);
  assert(typeof row.body_complete==='boolean',`${row.detail_version_id}: body_complete missing`);
  if(!row.body_complete) assert(Boolean(row.truncation_reason),`${row.detail_version_id}: truncation reason missing`);
  assert(reviewIds.has(row.review_id),`${row.detail_version_id}: unknown review ${row.review_id}`);
  if(row.source_change_event_id) assert(eventIds.has(row.source_change_event_id),`${row.detail_version_id}: unknown source-change event ${row.source_change_event_id}`);
  if(row.signal_event_id) assert(eventIds.has(row.signal_event_id),`${row.detail_version_id}: unknown signal event ${row.signal_event_id}`);
  assert(row.inference===null&&row.inference_class==='NONE',`${row.detail_version_id}: detail capture contains inference`);
}

const attempts=details.attempts||[];
for(const attempt of attempts){
  assert(Boolean(attempt.detail_record_id),'detail acquisition attempt missing detail_record_id');
  assert(validTime(attempt.attempted_at),`${attempt.detail_record_id}: attempted_at invalid`);
  assert(['SUCCESS','FAILED'].includes(attempt.state),`${attempt.detail_record_id}: invalid attempt state ${attempt.state}`);
  if(attempt.state==='FAILED') assert(Boolean(attempt.error),`${attempt.detail_record_id}: failed attempt missing error`);
}

const intelligenceByArea=new Map();
for(const event of events.events||[]){
  if(!event.area_evidence_id) continue;
  if(!intelligenceByArea.has(event.area_evidence_id)) intelligenceByArea.set(event.area_evidence_id,[]);
  intelligenceByArea.get(event.area_evidence_id).push(event);
}

const areaRows=areas.records||[];
assert(unique(areaRows.map(x=>x.area_evidence_id)),'area evidence IDs are not unique');
for(const row of areaRows){
  assert(validAreas.has(row.competition_class),`${row.area_evidence_id}: unknown competition class ${row.competition_class}`);
  const detail=detailByVersion.get(row.detail_version_id);
  assert(Boolean(detail),`${row.area_evidence_id}: missing substantive detail ${row.detail_version_id}`);
  if(detail){
    assert(row.detail_record_id===detail.detail_record_id,`${row.area_evidence_id}: detail record lineage mismatch`);
    assert(row.record_url===detail.record_url,`${row.area_evidence_id}: record URL lineage mismatch`);
    assert(row.jurisdiction_id===detail.jurisdiction_id,`${row.area_evidence_id}: jurisdiction lineage mismatch`);
  }
  assert(validTime(row.evidence_captured_at),`${row.area_evidence_id}: evidence_captured_at invalid`);
  assert(validTime(row.routed_at),`${row.area_evidence_id}: routed_at invalid`);
  assert(['SUBSTANTIVE_CONTENT_ROUTED','RETRACTED_ROUTING_NOISE'].includes(row.routing_state),`${row.area_evidence_id}: invalid routing state ${row.routing_state}`);
  assert(Array.isArray(row.routing_hits)&&row.routing_hits.length>0,`${row.area_evidence_id}: routing hits missing`);
  assert(Array.isArray(row.actor_ids)&&Array.isArray(row.party_ids),`${row.area_evidence_id}: entity arrays missing`);
  assert(row.position_state==='UNRESOLVED',`${row.area_evidence_id}: ingestion must not infer a position`);
  assert(row.inference===null&&row.inference_class==='NONE',`${row.area_evidence_id}: routing contains inference`);
  if(row.routing_state==='RETRACTED_ROUTING_NOISE'){
    assert(validTime(row.retracted_at),`${row.area_evidence_id}: retracted route missing retracted_at`);
    assert(Boolean(row.retraction_reason),`${row.area_evidence_id}: retracted route missing reason`);
  }
  if(row.routing_state==='SUBSTANTIVE_CONTENT_ROUTED'){
    assert(['RESOLVED_EXPLICIT_CANONICAL_MENTIONS','NO_CANONICAL_ENTITY_MENTION_RESOLVED'].includes(row.entity_resolution_state),`${row.area_evidence_id}: entity resolution not completed`);
    assert(validTime(row.entity_resolved_at),`${row.area_evidence_id}: entity_resolved_at invalid`);
    assert(row.integrity?.entity_resolution_completed===true,`${row.area_evidence_id}: entity_resolution_completed integrity flag missing`);
    assert(row.integrity?.entity_mentions_not_yet_resolved===false,`${row.area_evidence_id}: stale unresolved entity flag remains`);
    assert(row.integrity?.actor_affiliation_not_treated_as_explicit_team_mention===true,`${row.area_evidence_id}: actor-affiliation/team boundary missing`);
    assert(row.integrity?.entity_mention_does_not_establish_position===true,`${row.area_evidence_id}: entity/position boundary missing`);
    assert(row.entity_mentions&&Array.isArray(row.entity_mentions.actors)&&Array.isArray(row.entity_mentions.teams),`${row.area_evidence_id}: entity_mentions structure missing`);
    const handoff=(intelligenceByArea.get(row.area_evidence_id)||[]).filter(event=>['AREA_EVIDENCE_INGESTED','AREA_EVIDENCE_REACTIVATED'].includes(event.event_type)&&event.area_routing_state==='SUBSTANTIVE_CONTENT_ROUTED');
    assert(handoff.length>0,`${row.area_evidence_id}: no substantive Intelligence handoff event`);
    const latest=handoff.sort((a,b)=>Date.parse(b.captured_at)-Date.parse(a.captured_at))[0];
    if(latest){
      assert(latest.competition_class===row.competition_class,`${row.area_evidence_id}: Intelligence competition class mismatch`);
      assert(latest.detail_version_id===row.detail_version_id,`${row.area_evidence_id}: Intelligence detail lineage mismatch`);
      assert(latest.source_snapshot_id===row.source_snapshot_id,`${row.area_evidence_id}: Intelligence source-snapshot lineage mismatch`);
      assert(latest.evidence_state==='VERIFIED',`${row.area_evidence_id}: substantive Intelligence event not VERIFIED`);
      assert(latest.projection_effect==='NO_EFFECT',`${row.area_evidence_id}: substantive ingestion must not move projection directly`);
      assert(latest.inference===null&&latest.inference_class==='NONE',`${row.area_evidence_id}: substantive Intelligence handoff contains inference`);
    }
    if(row.competition_class==='PUBLIC_PRESSURE') assert((row.extracted_cues?.pressure_terms||[]).length>0,`${row.area_evidence_id}: active PUBLIC_PRESSURE route lacks pressure cues`);
  }
}

if(fail.length){
  console.error('POLITICAL_MAYHEM_INFORMATION_INGESTION_RUNTIME_FAILED');
  for(const message of fail) console.error('- '+message);
  process.exit(1);
}
const active=areaRows.filter(x=>x.routing_state==='SUBSTANTIVE_CONTENT_ROUTED');
const retracted=areaRows.filter(x=>x.routing_state==='RETRACTED_ROUTING_NOISE');
console.log('POLITICAL_MAYHEM_INFORMATION_INGESTION_RUNTIME_PASS',`details=${detailRows.length}`,`active_area_records=${active.length}`,`retracted=${retracted.length}`,`intelligence_handoffs=${active.filter(row=>(intelligenceByArea.get(row.area_evidence_id)||[]).some(e=>['AREA_EVIDENCE_INGESTED','AREA_EVIDENCE_REACTIVATED'].includes(e.event_type))).length}`,`attempts=${attempts.length}`);
