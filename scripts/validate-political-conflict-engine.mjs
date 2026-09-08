import fs from 'node:fs';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const conflicts=require('../engine/conflicts.js');
const schema=JSON.parse(fs.readFileSync('schema/contradiction.schema.json','utf8'));
const fail=[];
const assert=(condition,message)=>{if(!condition)fail.push(message)};

const schemaConflictTypes=schema.properties?.conflict_type?.enum||[];
const schemaResolutionStates=schema.properties?.resolution_state?.enum||[];
assert(JSON.stringify(conflicts.CONFLICT_TYPES)===JSON.stringify(schemaConflictTypes),'conflict-type vocabulary does not match contradiction schema');
assert(JSON.stringify(conflicts.RESOLUTION_STATES)===JSON.stringify(schemaResolutionStates),'resolution-state vocabulary does not match contradiction schema');

const common={
  claim_key:'government_formation_outcome',
  contest_id:'AUS-VIC-SE2026-GOVERNMENT',
  cycle_id:'AUS-VIC-SE2026',
  actor_id:'ACTOR-001',
  party_id:'AUS-VIC-ALP'
};
const a={...common,record_id:'CLAIM-A',source_snapshot_id:'SNAP-A',claim_value:'OUTCOME-A'};
const b={...common,record_id:'CLAIM-B',source_snapshot_id:'SNAP-B',claim_value:'OUTCOME-B'};
const sameValue={...b,record_id:'CLAIM-C',claim_value:'OUTCOME-A'};
const sameSource={...b,record_id:'CLAIM-D',source_snapshot_id:'SNAP-A'};
const differentKey={...b,record_id:'CLAIM-E',claim_key:'different_claim'};
const registryOnly={...b,record_id:'CLAIM-F',source_snapshot_id:null,source_id:'SOURCE-B'};

assert(JSON.stringify(conflicts.detectPairConflicts(a,b))===JSON.stringify(['SOURCE_DISAGREEMENT']),'cross-source disagreement not detected');
assert(conflicts.detectPairConflicts(a,sameValue).length===0,'equal claims incorrectly conflict');
assert(conflicts.detectPairConflicts(a,sameSource).length===0,'same snapshot incorrectly conflicts');
assert(conflicts.detectPairConflicts(a,differentKey).length===0,'different claim keys incorrectly conflict');
assert(conflicts.detectPairConflicts(a,registryOnly).length===0,'registry source ID incorrectly accepted as snapshot lineage');

const createdAt='2026-09-09T06:30:00+10:00';
const conflict=conflicts.makeConflict('SOURCE_DISAGREEMENT',a,b,{created_at:createdAt});
assert(conflict.conflict_id==='SOURCE_DISAGREEMENT:CLAIM-A:CLAIM-B','conflict ID incorrect');
assert(conflict.contest_id===common.contest_id&&conflict.cycle_id===common.cycle_id,'contest/cycle lineage not preserved');
assert(conflict.actor_id===common.actor_id&&conflict.party_id===common.party_id,'actor/party lineage not preserved');
assert(conflict.claim_a==='OUTCOME-A'&&conflict.claim_b==='OUTCOME-B','original claims not preserved');
assert(JSON.stringify(conflict.source_snapshot_ids)===JSON.stringify(['SNAP-A','SNAP-B']),'source snapshot lineage incorrect');
assert(conflict.resolution_state==='OPEN','new conflict not OPEN');
assert(conflict.projection_effect==='NO_EFFECT','new conflict affects projection by default');
assert(conflict.original_claims_preserved===true,'original-claims invariant missing');
assert(conflict.created_at==='2026-09-08T20:30:00.000Z','created_at not normalized to ISO instant');

let invalidTypeBlocked=false;
try{conflicts.makeConflict('NOT_A_TYPE',a,b,{created_at:createdAt});}catch(err){invalidTypeBlocked=err?.message==='INVALID_CONFLICT_TYPE';}
assert(invalidTypeBlocked,'invalid conflict type was not rejected');
let registryLineageBlocked=false;
try{conflicts.makeConflict('SOURCE_DISAGREEMENT',a,registryOnly,{created_at:createdAt});}catch(err){registryLineageBlocked=err?.message==='TWO_DISTINCT_CONFLICT_SOURCES_REQUIRED';}
assert(registryLineageBlocked,'conflict creation accepted registry source ID as evidence snapshot');

const resolved=conflicts.resolveConflict(conflict,{
  resolved_to:'OUTCOME-A',
  source_snapshot_ids:['SNAP-RESOLUTION','SNAP-RESOLUTION'],
  resolved_at:'2026-09-09T07:00:00+10:00',
  event_id:'EVENT-RESOLUTION-001',
  resolution_basis:'Later verified source resolves the disagreement.'
});
assert(resolved.resolution_state==='RESOLVED','resolution state not RESOLVED');
assert(resolved.resolved_to==='OUTCOME-A','resolved value missing');
assert(JSON.stringify(resolved.resolved_by_source_snapshot_ids)===JSON.stringify(['SNAP-RESOLUTION']),'resolution evidence snapshots not deduplicated');
assert(resolved.resolution_event_id==='EVENT-RESOLUTION-001','resolution event lineage missing');
assert(resolved.projection_effect==='NO_EFFECT','resolution changed projection without explicit instruction');
assert(resolved.claim_a===conflict.claim_a&&resolved.claim_b===conflict.claim_b,'resolution mutated original claims');
assert(resolved.original_claims_preserved===true,'resolution lost original-claims invariant');

let repeatBlocked=false;
try{conflicts.resolveConflict(resolved,{resolved_to:'OUTCOME-B',source_snapshot_ids:['SNAP-X'],resolved_at:'2026-09-09T08:00:00+10:00',event_id:'EVENT-X',resolution_basis:'test'});}catch(err){repeatBlocked=err?.message==='CONFLICT_ALREADY_RESOLVED';}
assert(repeatBlocked,'already resolved conflict was resolved again');
let invalidEffectBlocked=false;
try{conflicts.resolveConflict(conflict,{resolved_to:'OUTCOME-A',source_snapshot_ids:['SNAP-X'],resolved_at:'2026-09-09T08:00:00+10:00',event_id:'EVENT-X',resolution_basis:'test',projection_effect:'INVALID'});}catch(err){invalidEffectBlocked=err?.message==='INVALID_PROJECTION_EFFECT';}
assert(invalidEffectBlocked,'invalid projection effect was not rejected');
let evidenceBlocked=false;
try{conflicts.resolveConflict(conflict,{resolved_to:'OUTCOME-A',source_snapshot_ids:[],resolved_at:'2026-09-09T08:00:00+10:00',event_id:'EVENT-X',resolution_basis:'test'});}catch(err){evidenceBlocked=err?.message==='RESOLUTION_SOURCE_EVIDENCE_REQUIRED';}
assert(evidenceBlocked,'resolution without source evidence was not rejected');

const all=conflicts.detectAll([a,b,sameValue,differentKey]);
assert(all.length===2,'detectAll did not return the expected pairwise disagreements');
assert(all.every(x=>x.conflict_type==='SOURCE_DISAGREEMENT'),'detectAll inferred unsupported conflict types');

if(fail.length){
  console.error('POLITICAL_MAYHEM_CONFLICT_ENGINE_INTEGRITY_FAILED');
  for(const message of fail) console.error('- '+message);
  process.exit(1);
}
console.log('POLITICAL_MAYHEM_CONFLICT_ENGINE_INTEGRITY_PASS','types=10','resolutionStates=4','autoDetection=SOURCE_DISAGREEMENT_ONLY','projectionDefault=NO_EFFECT');
