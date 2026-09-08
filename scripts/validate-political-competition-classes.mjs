import fs from 'node:fs';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const fail=[];
const assert=(condition,message)=>{if(!condition)fail.push(message)};
const unique=values=>new Set(values).size===values.length;

const registry=read('data/political-competition-class-registry.json');
const contests=read('data/runtime/political-contests.json');

assert(registry.status==='ACTIVE','competition class registry is not ACTIVE');
assert(registry.model==='POLITICAL_MAYHEM_SPORT','competition class registry is not Political MAYHEM sport model');
assert(registry.rules?.political_mayhem_is_the_sport===true,'Political MAYHEM sport invariant missing');
assert(registry.rules?.competition_class_is_not_jurisdiction===true,'competition class/jurisdiction separation missing');
assert(registry.rules?.one_player_may_participate_in_multiple_competitions===true,'multi-competition player rule missing');
assert(registry.rules?.one_player_may_participate_in_multiple_competition_classes===true,'multi-class player rule missing');
assert(registry.rules?.parliamentary_roster_membership_does_not_define_complete_competition_slate===true,'roster/competition-slate separation missing');
assert(registry.rules?.contest_registration_requires_evidence_lineage===true,'contest evidence-lineage requirement missing');
assert(registry.rules?.competition_outcome_requires_verification===true,'verified-outcome requirement missing');

const classes=registry.classes||[];
const classIds=classes.map(x=>x.competition_class);
assert(classes.length>=2,'expected at least electoral and legislative competition classes');
assert(unique(classIds),'competition class IDs are not unique');
const byId=new Map(classes.map(x=>[x.competition_class,x]));
assert(byId.has('ELECTORAL'),'ELECTORAL competition class missing');
assert(byId.has('LEGISLATIVE'),'LEGISLATIVE competition class missing');

for(const c of classes){
  assert(Boolean(c.public_label),`${c.competition_class||'UNKNOWN'} public_label missing`);
  assert(Boolean(c.definition),`${c.competition_class||'UNKNOWN'} definition missing`);
  assert(Boolean(c.competition_object),`${c.competition_class||'UNKNOWN'} competition_object missing`);
  assert(Boolean(c.participant_model),`${c.competition_class||'UNKNOWN'} participant_model missing`);
}

const legislative=byId.get('LEGISLATIVE');
if(legislative){
  assert(legislative.registration_threshold==='MATERIAL_RESISTANCE_EVIDENCED','legislative contests must require evidenced material resistance');
  const events=new Set(legislative.match_events||[]);
  for(const required of ['INTRODUCTION','AMENDMENT','COMMITTEE_STAGE','CROSSBENCH_NEGOTIATION','PROCEDURAL_MOVE','DIVISION_OR_VOTE','WITHDRAWAL']){
    assert(events.has(required),`legislative match event missing: ${required}`);
  }
  const outcomes=new Set(legislative.verified_outcomes||[]);
  for(const required of ['PASSED','DEFEATED','WITHDRAWN','LAPSED']){
    assert(outcomes.has(required),`legislative verified outcome missing: ${required}`);
  }
  assert(legislative.integrity?.proposal_without_material_resistance_is_not_automatically_a_competition===true,'uncontested proposal exclusion missing');
  assert(legislative.integrity?.support_or_opposition_requires_source_lineage===true,'legislative side lineage requirement missing');
  assert(legislative.integrity?.vote_or_passage_status_requires_verification===true,'legislative outcome verification requirement missing');
  assert(legislative.integrity?.player_position_may_change_only_from_forward_evidence===true,'legislative forward-position rule missing');
}

for(const contest of contests.contests||[]){
  assert(Boolean(contest.competition_class),`${contest.contest_id}: competition_class missing`);
  assert(byId.has(contest.competition_class),`${contest.contest_id}: unregistered competition class ${contest.competition_class}`);
  assert(Array.isArray(contest.source_refs)&&contest.source_refs.length>0,`${contest.contest_id}: source lineage missing`);
}

if(fail.length){
  console.error('POLITICAL_MAYHEM_COMPETITION_CLASS_INTEGRITY_FAILED');
  for(const message of fail) console.error('- '+message);
  process.exit(1);
}
console.log('POLITICAL_MAYHEM_COMPETITION_CLASS_INTEGRITY_PASS',`classes=${classes.length}`,`contests=${(contests.contests||[]).length}`,'sport=POLITICAL_MAYHEM','legislativeThreshold=MATERIAL_RESISTANCE_EVIDENCED');
