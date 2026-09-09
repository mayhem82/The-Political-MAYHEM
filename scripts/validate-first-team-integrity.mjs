import fs from 'node:fs';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const firstTeam=require('../engine/first-team.js');
const claimControl=JSON.parse(fs.readFileSync('data/first-team-claim-control.json','utf8'));
const claimRegister=JSON.parse(fs.readFileSync('data/runtime/first-team-claim-register.json','utf8'));
const outcomeLedger=JSON.parse(fs.readFileSync('data/runtime/first-team-outcome-ledger.json','utf8'));
const fail=[];
const assert=(c,m)=>{if(!c)fail.push(m)};

assert(claimRegister.subject_entity_id==='AUS-PEOPLE','claim register subject is not AUS-PEOPLE');
assert(outcomeLedger.subject_entity_id==='AUS-PEOPLE','outcome ledger subject is not AUS-PEOPLE');
assert(JSON.stringify(firstTeam.CLAIM_CLASSES)===JSON.stringify((claimControl.claim_classes||[]).map(x=>x.class)),'engine claim classes diverge from canonical claim control');
assert(Array.isArray(claimRegister.records),'claim register records missing');
assert(Array.isArray(outcomeLedger.outcomes),'outcome ledger outcomes missing');

for(const row of claimRegister.records){
  try{firstTeam.validateClaimRecord(row);}catch(err){fail.push(`${row.claim_id||'UNKNOWN'} ${err.message}`);}
}
for(const row of outcomeLedger.outcomes){
  try{firstTeam.validateOutcomeRecord(row);}catch(err){fail.push(`${row.outcome_id||'UNKNOWN'} ${err.message}`);}
}

assert(firstTeam.classifyPublicEvidence({claim:'Australians want lower taxes'})==='POLITICAL_REPRESENTATION_CLAIM','representation phrase not classified');
assert(firstTeam.classifyPublicEvidence({event_type:'POLL'})==='SAMPLED_PUBLIC_OPINION','poll not classified');
assert(firstTeam.classifyPublicEvidence({event_type:'REFERENDUM_RESULT'})==='DIRECT_PUBLIC_DECISION','referendum result not classified');
assert(firstTeam.defaultFirstTeamEffect('SAMPLED_PUBLIC_OPINION')==='NARROW_OPINION_EVIDENCE_ONLY','poll default effect incorrect');
assert(firstTeam.mayMoveFirstTeamForm('SAMPLED_PUBLIC_OPINION')===false,'poll can move First Team form');
assert(firstTeam.mayMoveFirstTeamForm('DIRECT_PUBLIC_DECISION',{authoritatively_verified:true})===true,'verified direct decision cannot move First Team form');
assert(firstTeam.mayMoveFirstTeamForm('DIRECT_PUBLIC_DECISION',{authoritatively_verified:false})===false,'unverified direct decision can move First Team form');

let pollBlocked=false;
try{firstTeam.validateClaimRecord({claim_id:'T1',claim_text:'poll',speaker_or_source:'test',claim_time:'2026-09-09',claim_class:'SAMPLED_PUBLIC_OPINION',jurisdiction:'AUS',population_scope:'sample',evidence_state:'VERIFIED',source_lineage:['S1'],first_team_effect:'DIRECT_DECISION_RECORDED'});}catch(err){pollBlocked=err.message==='POLL_CANNOT_BECOME_DIRECT_DECISION';}
assert(pollBlocked,'poll-to-direct-decision substitution not blocked');

let rhetoricBlocked=false;
try{firstTeam.validateClaimRecord({claim_id:'T2',claim_text:'Australians want X',speaker_or_source:'test',claim_time:'2026-09-09',claim_class:'POLITICAL_REPRESENTATION_CLAIM',jurisdiction:'AUS',population_scope:'claimed national',evidence_state:'UNVERIFIED',source_lineage:['S2'],first_team_effect:'DIRECT_DECISION_RECORDED'});}catch(err){rhetoricBlocked=err.message==='PROXY_CANNOT_MOVE_FIRST_TEAM_FORM';}
assert(rhetoricBlocked,'rhetoric-to-public-decision substitution not blocked');

if(fail.length){
  console.error('POLITICAL_MAYHEM_FIRST_TEAM_INTEGRITY_FAILED');
  for(const message of fail) console.error('- '+message);
  process.exit(1);
}
console.log('POLITICAL_MAYHEM_FIRST_TEAM_INTEGRITY_PASS',`claims=${claimRegister.records.length}`,`outcomes=${outcomeLedger.outcomes.length}`,'proxySubstitution=BLOCKED');
