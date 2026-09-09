import fs from 'node:fs';

const AREAS='data/runtime/area-evidence-records.json';
const EVENTS='data/runtime/intelligence-events.json';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const uniq=xs=>[...new Set(xs.filter(Boolean))];
const human=s=>String(s??'').replaceAll('_',' ').toLowerCase();

function cueSummary(row){
  const cues=row.extracted_cues||{};
  const parts=[];
  if((cues.stage_terms||[]).length) parts.push(`stage: ${uniq(cues.stage_terms).join(', ')}`);
  if((cues.resistance_terms||[]).length) parts.push(`resistance language: ${uniq(cues.resistance_terms).join(', ')}`);
  if((cues.outcome_terms||[]).length) parts.push(`outcome language: ${uniq(cues.outcome_terms).join(', ')}`);
  if((cues.pressure_terms||[]).length) parts.push(`public-pressure language: ${uniq(cues.pressure_terms).join(', ')}`);
  return parts.join('; ');
}

const areas=read(AREAS);
const ledger=read(EVENTS);
ledger.events ||= [];
const eventIds=new Set(ledger.events.map(x=>x.event_id));
const latestStateByArea=new Map();
for(const event of ledger.events.filter(x=>x.area_evidence_id)){
  const prior=latestStateByArea.get(event.area_evidence_id);
  if(!prior||Date.parse(event.captured_at||0)>Date.parse(prior.captured_at||0)) latestStateByArea.set(event.area_evidence_id,event);
}

const now=new Date().toISOString();
let ingested=0,retracted=0,reactivated=0;
for(const row of areas.records||[]){
  const prior=latestStateByArea.get(row.area_evidence_id);
  if(row.routing_state==='SUBSTANTIVE_CONTENT_ROUTED'){
    const initialId=`INTEL-${row.area_evidence_id}`;
    const isReactivation=prior?.area_routing_state==='RETRACTED_ROUTING_NOISE';
    const eventId=isReactivation?`INTEL-REACT-${row.area_evidence_id}-${String(row.routed_at||now).replace(/[^0-9]/g,'').slice(0,14)}`:initialId;
    if(eventIds.has(eventId)||(!isReactivation&&prior?.area_routing_state==='SUBSTANTIVE_CONTENT_ROUTED')) continue;
    const actorIds=uniq(row.actor_ids||[]),partyIds=uniq(row.party_ids||[]);
    const cues=cueSummary(row);
    const action=isReactivation?'Reactivated':'Ingested';
    const claim=`${action} substantive ${human(row.competition_class)} evidence from ${row.record_title||row.record_url}.${cues?` Captured content includes ${cues}.`:''}`;
    const event={
      event_id:eventId,
      parent_event_id:row.signal_event_id||null,
      jurisdiction_id:row.jurisdiction_id,
      party_id:partyIds.length===1?partyIds[0]:null,
      actor_id:actorIds.length===1?actorIds[0]:null,
      party_ids:partyIds,
      actor_ids:actorIds,
      contest_id:null,
      cycle_id:null,
      competition_class:row.competition_class,
      area_evidence_id:row.area_evidence_id,
      detail_record_id:row.detail_record_id,
      detail_version_id:row.detail_version_id,
      source_snapshot_id:row.source_snapshot_id,
      record_url:row.record_url,
      captured_at:now,
      evidence_captured_at:row.evidence_captured_at,
      event_date:String(row.evidence_captured_at||now).slice(0,10),
      checkpoint:'SUBSTANTIVE_INFORMATION_INGESTION',
      event_type:isReactivation?'AREA_EVIDENCE_REACTIVATED':'AREA_EVIDENCE_INGESTED',
      area_routing_state:'SUBSTANTIVE_CONTENT_ROUTED',
      evidence_state:'VERIFIED',
      signal_state:'CONFIRMED_FACT',
      semantic_review_state:'PROMOTED',
      materiality_state:'UNKNOWN',
      source_class:row.source_class,
      source_id:row.source_id,
      claim,
      observed_behaviour:String(row.substantive_excerpt||'').slice(0,1800),
      extracted_cues:row.extracted_cues||{},
      entity_mentions:row.entity_mentions||{actors:[],teams:[]},
      position_state:row.position_state||'UNRESOLVED',
      resistance_state:row.resistance_state||'UNRESOLVED',
      outcome_state:row.outcome_state||'UNRESOLVED',
      inference:null,
      inference_class:'NONE',
      projection_effect:'NO_EFFECT',
      information_advantage:'NONE',
      frozen:false,
      integrity:{substantive_detail_lineage_required:true,routing_does_not_register_match:true,entity_mentions_do_not_establish_positions:true,no_projection_effect_without_registered_target:true}
    };
    ledger.events.push(event);eventIds.add(eventId);latestStateByArea.set(row.area_evidence_id,event);
    if(isReactivation) reactivated++; else ingested++;
  }else if(row.routing_state==='RETRACTED_ROUTING_NOISE'){
    if(!prior||prior.area_routing_state==='RETRACTED_ROUTING_NOISE') continue;
    const eventId=`INTEL-RETRACT-${row.area_evidence_id}`;
    if(eventIds.has(eventId)) continue;
    const event={
      event_id:eventId,
      parent_event_id:prior.event_id,
      jurisdiction_id:row.jurisdiction_id,
      party_id:null,
      actor_id:null,
      party_ids:[],
      actor_ids:[],
      contest_id:null,
      cycle_id:null,
      competition_class:row.competition_class,
      area_evidence_id:row.area_evidence_id,
      detail_record_id:row.detail_record_id,
      detail_version_id:row.detail_version_id,
      source_snapshot_id:row.source_snapshot_id,
      record_url:row.record_url,
      captured_at:now,
      evidence_captured_at:row.evidence_captured_at,
      event_date:String(now).slice(0,10),
      checkpoint:'SUBSTANTIVE_INFORMATION_INGESTION',
      event_type:'AREA_EVIDENCE_RETRACTED',
      area_routing_state:'RETRACTED_ROUTING_NOISE',
      evidence_state:'VERIFIED',
      signal_state:'OBSERVED',
      semantic_review_state:'CORRECTED',
      materiality_state:'IMMATERIAL',
      source_class:row.source_class,
      source_id:row.source_id,
      claim:`Retracted prior ${human(row.competition_class)} routing for ${row.record_title||row.record_url}: ${row.retraction_reason||'routing no longer satisfies bounded substantive-content rules'}`,
      observed_behaviour:null,
      inference:null,
      inference_class:'NONE',
      projection_effect:'NO_EFFECT',
      information_advantage:'NONE',
      frozen:false,
      integrity:{prior_event_retained:true,routing_correction_append_only:true,no_projection_effect:true}
    };
    ledger.events.push(event);eventIds.add(eventId);latestStateByArea.set(row.area_evidence_id,event);retracted++;
  }
}

ledger.captured_at=now;
write(EVENTS,ledger);
console.log('POLITICAL_MAYHEM_SUBSTANTIVE_INTELLIGENCE_OK',`ingested=${ingested}`,`retracted=${retracted}`,`reactivated=${reactivated}`,`events=${ledger.events.length}`);
