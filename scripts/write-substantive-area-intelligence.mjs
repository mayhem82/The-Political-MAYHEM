import fs from 'node:fs';
import crypto from 'node:crypto';

const AREAS='data/runtime/area-evidence-records.json';
const FACTS='data/runtime/contest-facts.json';
const THRESHOLDS='data/runtime/competition-threshold-evaluations.json';
const EVENTS='data/runtime/intelligence-events.json';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const uniq=xs=>[...new Set(xs.filter(Boolean))];
const human=s=>String(s??'').replaceAll('_',' ').toLowerCase();
const sha=s=>crypto.createHash('sha256').update(String(s)).digest('hex');

function cueSummary(row){
  const cues=row.extracted_cues||{};
  const parts=[];
  if((cues.stage_terms||[]).length) parts.push(`stage: ${uniq(cues.stage_terms).join(', ')}`);
  if((cues.resistance_terms||[]).length) parts.push(`resistance language: ${uniq(cues.resistance_terms).join(', ')}`);
  if((cues.outcome_terms||[]).length) parts.push(`outcome language: ${uniq(cues.outcome_terms).join(', ')}`);
  if((cues.pressure_terms||[]).length) parts.push(`public-pressure language: ${uniq(cues.pressure_terms).join(', ')}`);
  return parts.join('; ');
}

function thresholdText(evaluation){
  if(!evaluation) return 'Threshold evaluation unavailable.';
  const state=human(evaluation.evaluation_state);
  const blockers=evaluation.blockers||[];
  if(evaluation.evaluation_state==='EVIDENCE_GAP') return `Registration threshold state: ${state}. Missing requirements: ${blockers.map(human).join(', ')||'unspecified evidence gap'}.`;
  if(evaluation.evaluation_state==='REVIEW_REQUIRED') return `Registration threshold state: ${state}. Review requirements: ${blockers.map(human).join(', ')||'manual review required'}.`;
  if(evaluation.evaluation_state==='ELIGIBLE_FOR_REGISTRATION') return 'Registration threshold state: eligible for registration. No competition was automatically registered.';
  if(evaluation.evaluation_state==='NOT_A_MATCH') return 'Registration threshold state: not a match because the parent area routing is retracted.';
  return `Registration threshold state: ${state}.`;
}

const areas=read(AREAS);
const factsLedger=read(FACTS);
const thresholdLedger=read(THRESHOLDS);
const ledger=read(EVENTS);
ledger.events ||= [];

const activeFactsByArea=new Map();
for(const fact of factsLedger.facts||[]){
  if(fact.fact_state!=='OBSERVED_SOURCE_TEXT') continue;
  if(!activeFactsByArea.has(fact.area_evidence_id)) activeFactsByArea.set(fact.area_evidence_id,[]);
  activeFactsByArea.get(fact.area_evidence_id).push(fact);
}
for(const rows of activeFactsByArea.values()) rows.sort((a,b)=>a.fact_id.localeCompare(b.fact_id));
const thresholdByArea=new Map((thresholdLedger.evaluations||[]).map(x=>[x.area_evidence_id,x]));

const eventIds=new Set(ledger.events.map(x=>x.event_id));
const latestStateByArea=new Map();
for(const event of ledger.events.filter(x=>x.area_evidence_id)){
  const prior=latestStateByArea.get(event.area_evidence_id);
  if(!prior||Date.parse(event.captured_at||0)>Date.parse(prior.captured_at||0)) latestStateByArea.set(event.area_evidence_id,event);
}

const now=new Date().toISOString();
let ingested=0,retracted=0,reactivated=0,enriched=0,retractionEnriched=0;
for(const row of areas.records||[]){
  const prior=latestStateByArea.get(row.area_evidence_id);
  if(row.routing_state==='SUBSTANTIVE_CONTENT_ROUTED'){
    const facts=activeFactsByArea.get(row.area_evidence_id)||[];
    const evaluation=thresholdByArea.get(row.area_evidence_id)||null;
    const contestFactIds=facts.map(x=>x.fact_id);
    const contestFactTypes=uniq(facts.map(x=>x.fact_type)).sort();
    const thresholdBlockers=[...(evaluation?.blockers||[])].sort();
    const supportingEntities=[...(evaluation?.supporting_entities||[])].sort();
    const opposingEntities=[...(evaluation?.opposing_entities||[])].sort();
    const signature=sha(JSON.stringify({
      contest_fact_ids:contestFactIds,
      threshold_evaluation_id:evaluation?.evaluation_id||null,
      threshold_state:evaluation?.evaluation_state||null,
      threshold_blockers:thresholdBlockers,
      supporting_entities:supportingEntities,
      opposing_entities:opposingEntities
    }));

    const isReactivation=prior?.area_routing_state==='RETRACTED_ROUTING_NOISE';
    const isInitial=!prior;
    const needsEnrichment=!isInitial&&!isReactivation&&prior?.area_routing_state==='SUBSTANTIVE_CONTENT_ROUTED'&&prior.intelligence_signature!==signature;
    if(!isInitial&&!isReactivation&&!needsEnrichment) continue;

    const eventType=isReactivation?'AREA_EVIDENCE_REACTIVATED':needsEnrichment?'AREA_EVIDENCE_INTELLIGENCE_ENRICHED':'AREA_EVIDENCE_INGESTED';
    const eventId=isReactivation
      ?`INTEL-REACT-${row.area_evidence_id}-${signature.slice(0,16)}`
      :needsEnrichment
        ?`INTEL-ENRICH-${row.area_evidence_id}-${signature.slice(0,16)}`
        :`INTEL-${row.area_evidence_id}`;
    if(eventIds.has(eventId)) continue;

    const actorIds=uniq(row.actor_ids||[]),partyIds=uniq(row.party_ids||[]);
    const cues=cueSummary(row);
    const action=isReactivation?'Reactivated':needsEnrichment?'Enriched':'Ingested';
    const claim=`${action} substantive ${human(row.competition_class)} evidence from ${row.record_title||row.record_url}.${cues?` Captured content includes ${cues}.`:''} ${thresholdText(evaluation)}`;
    const event={
      event_id:eventId,
      parent_event_id:prior?.event_id||row.signal_event_id||null,
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
      checkpoint:needsEnrichment?'SUBSTANTIVE_INTELLIGENCE_ENRICHMENT':'SUBSTANTIVE_INFORMATION_INGESTION',
      event_type:eventType,
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
      contest_fact_ids:contestFactIds,
      contest_fact_types:contestFactTypes,
      threshold_evaluation_id:evaluation?.evaluation_id||null,
      threshold_state:evaluation?.evaluation_state||null,
      threshold_blockers:thresholdBlockers,
      supporting_entities:supportingEntities,
      opposing_entities:opposingEntities,
      registration_action:'NO_AUTOMATIC_REGISTRATION',
      intelligence_signature:signature,
      inference:null,
      inference_class:'NONE',
      projection_effect:'NO_EFFECT',
      information_advantage:'NONE',
      frozen:false,
      integrity:{
        substantive_detail_lineage_required:true,
        active_contest_fact_lineage_required:true,
        threshold_evaluation_lineage_required:true,
        routing_does_not_register_match:true,
        threshold_eligibility_does_not_register_match:true,
        entity_mentions_do_not_establish_positions:true,
        retracted_facts_excluded:true,
        no_projection_effect_without_registered_target:true
      }
    };
    ledger.events.push(event);eventIds.add(eventId);latestStateByArea.set(row.area_evidence_id,event);
    if(isReactivation) reactivated++; else if(needsEnrichment) enriched++; else ingested++;
  }else if(row.routing_state==='RETRACTED_ROUTING_NOISE'){
    if(!prior) continue;
    const facts=activeFactsByArea.get(row.area_evidence_id)||[];
    const evaluation=thresholdByArea.get(row.area_evidence_id)||null;
    const contestFactIds=facts.map(x=>x.fact_id);
    const contestFactTypes=uniq(facts.map(x=>x.fact_type)).sort();
    const thresholdBlockers=[...(evaluation?.blockers||[])].sort();
    const supportingEntities=[...(evaluation?.supporting_entities||[])].sort();
    const opposingEntities=[...(evaluation?.opposing_entities||[])].sort();
    const signature=sha(JSON.stringify({
      routing_state:'RETRACTED_ROUTING_NOISE',
      contest_fact_ids:contestFactIds,
      threshold_evaluation_id:evaluation?.evaluation_id||null,
      threshold_state:evaluation?.evaluation_state||null,
      threshold_blockers:thresholdBlockers,
      supporting_entities:supportingEntities,
      opposing_entities:opposingEntities
    }));
    const needsRetractionEnrichment=prior.area_routing_state==='RETRACTED_ROUTING_NOISE'&&prior.intelligence_signature!==signature;
    if(prior.area_routing_state==='RETRACTED_ROUTING_NOISE'&&!needsRetractionEnrichment) continue;

    const retractionKey=String(row.retracted_at||now).replace(/[^0-9]/g,'').slice(0,14);
    const eventType=needsRetractionEnrichment?'AREA_EVIDENCE_RETRACTION_ENRICHED':'AREA_EVIDENCE_RETRACTED';
    const eventId=needsRetractionEnrichment
      ?`INTEL-RETRACT-ENRICH-${row.area_evidence_id}-${signature.slice(0,16)}`
      :`INTEL-RETRACT-${row.area_evidence_id}-${retractionKey}`;
    if(eventIds.has(eventId)) continue;
    const claim=needsRetractionEnrichment
      ?`Enriched retracted ${human(row.competition_class)} evidence lineage for ${row.record_title||row.record_url}. ${thresholdText(evaluation)}`
      :`Retracted prior ${human(row.competition_class)} routing for ${row.record_title||row.record_url}: ${row.retraction_reason||'routing no longer satisfies bounded substantive-content rules'}. ${thresholdText(evaluation)}`;
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
      checkpoint:needsRetractionEnrichment?'SUBSTANTIVE_INTELLIGENCE_ENRICHMENT':'SUBSTANTIVE_INFORMATION_INGESTION',
      event_type:eventType,
      area_routing_state:'RETRACTED_ROUTING_NOISE',
      evidence_state:'VERIFIED',
      signal_state:'OBSERVED',
      semantic_review_state:'CORRECTED',
      materiality_state:'IMMATERIAL',
      source_class:row.source_class,
      source_id:row.source_id,
      claim,
      observed_behaviour:null,
      contest_fact_ids:contestFactIds,
      contest_fact_types:contestFactTypes,
      threshold_evaluation_id:evaluation?.evaluation_id||null,
      threshold_state:evaluation?.evaluation_state||null,
      threshold_blockers:thresholdBlockers,
      supporting_entities:supportingEntities,
      opposing_entities:opposingEntities,
      registration_action:'NO_AUTOMATIC_REGISTRATION',
      intelligence_signature:signature,
      inference:null,
      inference_class:'NONE',
      projection_effect:'NO_EFFECT',
      information_advantage:'NONE',
      frozen:false,
      integrity:{
        prior_event_retained:true,
        routing_correction_append_only:true,
        threshold_evaluation_lineage_required:true,
        retraction_propagates_not_a_match:true,
        retracted_facts_excluded:true,
        no_projection_effect:true
      }
    };
    ledger.events.push(event);eventIds.add(eventId);latestStateByArea.set(row.area_evidence_id,event);
    if(needsRetractionEnrichment) retractionEnriched++; else retracted++;
  }
}

ledger.captured_at=now;
write(EVENTS,ledger);
console.log('POLITICAL_MAYHEM_SUBSTANTIVE_INTELLIGENCE_OK',`ingested=${ingested}`,`enriched=${enriched}`,`retracted=${retracted}`,`retractionEnriched=${retractionEnriched}`,`reactivated=${reactivated}`,`events=${ledger.events.length}`);
