'use strict';

const CONFLICT_TYPES=['FACTUAL','TEMPORAL','NUMERIC','ATTRIBUTION','POSITION','PROMISE_ACTION','SOURCE_DISAGREEMENT','POLLING','OUTCOME','OTHER'];
const RESOLUTION_STATES=['OPEN','RESOLVED','UNRESOLVED','PARTIALLY_RESOLVED'];

function valueOf(record){
  if(Object.prototype.hasOwnProperty.call(record,'claim_value')) return record.claim_value;
  return record.claim;
}

function sourceOf(record){
  return record.source_snapshot_id||null;
}

function detectPairConflicts(a,b){
  if(!a||!b||!a.claim_key||!b.claim_key||a.claim_key!==b.claim_key) return [];
  const sourceA=sourceOf(a),sourceB=sourceOf(b);
  if(!sourceA||!sourceB||sourceA===sourceB) return [];
  if(JSON.stringify(valueOf(a))===JSON.stringify(valueOf(b))) return [];
  return ['SOURCE_DISAGREEMENT'];
}

function makeConflict(type,a,b,{created_at=new Date().toISOString()}={}){
  if(!CONFLICT_TYPES.includes(type)) throw new Error('INVALID_CONFLICT_TYPE');
  if(!a?.record_id||!b?.record_id) throw new Error('CONFLICT_RECORD_IDS_REQUIRED');
  const sourceSnapshotIds=[sourceOf(a),sourceOf(b)].filter(Boolean);
  if(new Set(sourceSnapshotIds).size<2) throw new Error('TWO_DISTINCT_CONFLICT_SOURCES_REQUIRED');
  const created=Date.parse(created_at);
  if(!Number.isFinite(created)) throw new Error('CONFLICT_CREATED_AT_INVALID');
  const shared=(key)=>a[key]&&b[key]&&a[key]===b[key]?a[key]:null;
  return {
    conflict_id:`${type}:${a.record_id}:${b.record_id}`,
    contest_id:shared('contest_id'),
    cycle_id:shared('cycle_id'),
    actor_id:shared('actor_id'),
    party_id:shared('party_id'),
    created_at:new Date(created).toISOString(),
    conflict_type:type,
    claim_a:valueOf(a),
    claim_b:valueOf(b),
    source_snapshot_ids:[...new Set(sourceSnapshotIds)],
    resolution_state:'OPEN',
    resolved_to:null,
    resolved_by_source_snapshot_ids:[],
    resolved_at:null,
    resolution_event_id:null,
    resolution_basis:null,
    projection_effect:'NO_EFFECT',
    original_claims_preserved:true
  };
}

function resolveConflict(conflict,{resolved_to,source_snapshot_ids,resolved_at,event_id,resolution_basis,projection_effect='NO_EFFECT'}){
  if(!conflict||!RESOLUTION_STATES.includes(conflict.resolution_state)) throw new Error('INVALID_CONFLICT');
  if(conflict.resolution_state==='RESOLVED') throw new Error('CONFLICT_ALREADY_RESOLVED');
  if(resolved_to===undefined||resolved_to===null) throw new Error('RESOLVED_TO_REQUIRED');
  if(!Array.isArray(source_snapshot_ids)||source_snapshot_ids.length===0) throw new Error('RESOLUTION_SOURCE_EVIDENCE_REQUIRED');
  if(!event_id||!resolution_basis) throw new Error('RESOLUTION_EVIDENCE_REQUIRED');
  const resolved=Date.parse(resolved_at);
  if(!Number.isFinite(resolved)) throw new Error('RESOLVED_AT_INVALID');
  const projectionEffects=['NO_EFFECT','CONFIDENCE_CHANGE','RANKING_CHANGE','OUTCOME_SELECTION_CHANGE','ABSTAIN_INSUFFICIENT_EVIDENCE'];
  if(!projectionEffects.includes(projection_effect)) throw new Error('INVALID_PROJECTION_EFFECT');
  return {
    ...conflict,
    resolution_state:'RESOLVED',
    resolved_to,
    resolved_by_source_snapshot_ids:[...new Set(source_snapshot_ids)],
    resolved_at:new Date(resolved).toISOString(),
    resolution_event_id:event_id,
    resolution_basis,
    projection_effect,
    original_claims_preserved:true
  };
}

function detectAll(records){
  const conflicts=[];
  for(let i=0;i<records.length;i++){
    for(let j=i+1;j<records.length;j++){
      for(const type of detectPairConflicts(records[i],records[j])){
        conflicts.push(makeConflict(type,records[i],records[j]));
      }
    }
  }
  return conflicts;
}

module.exports={CONFLICT_TYPES,RESOLUTION_STATES,detectPairConflicts,makeConflict,resolveConflict,detectAll};
