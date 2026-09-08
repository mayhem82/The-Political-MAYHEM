import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const normalize=require('../engine/normalize.js');
const fail=[];
const assert=(condition,message)=>{if(!condition)fail.push(message)};

const input={
  record_id:'OBS-001',
  party_id:'AUS-VIC-ALP',
  actor_id:'ACTOR-001',
  contest_id:'AUS-VIC-SE2026-GOVERNMENT',
  party_name:'  Australian   Labor Party  ',
  actor_name:'  Example   Actor ',
  jurisdiction:'  Victoria ',
  source_name:'  Victorian   Electoral Commission ',
  source_class:'official election authority',
  classification:'verified',
  captured_at:'2026-09-09T06:00:00+10:00'
};
const frozen=JSON.stringify(input);
const row=normalize.normalizeObservation(input);

assert(row.party_id===input.party_id,'party_id was rewritten');
assert(row.actor_id===input.actor_id,'actor_id was rewritten');
assert(row.contest_id===input.contest_id,'contest_id was rewritten');
assert(row.party_name==='Australian Labor Party','party display text not normalized');
assert(row.actor_name==='Example Actor','actor display text not normalized');
assert(row.jurisdiction==='Victoria','jurisdiction text not normalized');
assert(row.source_name==='Victorian Electoral Commission','source name not normalized');
assert(row.source_class==='OFFICIAL_ELECTION_AUTHORITY','source class not normalized');
assert(row.evidence_state==='VERIFIED','evidence state not normalized');
assert(row.captured_at==='2026-09-08T20:00:00.000Z','capture time not normalized to ISO instant');
assert(JSON.stringify(input)===frozen,'input observation mutated');
assert(normalize.evidenceState('not-a-state')==='UNKNOWN','invalid evidence state did not fall back to UNKNOWN');
assert(normalize.key('  A / B  ')==='a-b','key normalization failed');

let missingBlocked=false;
try{normalize.normalizeObservation({});}catch(err){missingBlocked=err?.message==='CAPTURE_TIME_REQUIRED';}
assert(missingBlocked,'missing capture time was not rejected');
let invalidBlocked=false;
try{normalize.normalizeObservation({captured_at:'not-a-time'});}catch(err){invalidBlocked=err?.message==='CAPTURE_TIME_INVALID';}
assert(invalidBlocked,'invalid capture time was not rejected');

if(fail.length){
  console.error('POLITICAL_MAYHEM_NORMALIZE_ENGINE_INTEGRITY_FAILED');
  for(const message of fail) console.error('- '+message);
  process.exit(1);
}
console.log('POLITICAL_MAYHEM_NORMALIZE_ENGINE_INTEGRITY_PASS','ids=UNCHANGED','evidence=VERIFIED','captureTime=ISO');
