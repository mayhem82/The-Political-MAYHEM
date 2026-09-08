import fs from 'node:fs';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const fail=[];
const assert=(condition,message)=>{if(!condition)fail.push(message)};
const unique=values=>new Set(values).size===values.length;

const registry=read('data/political-competition-class-registry.json');
const contests=read('data/runtime/political-contests.json');
const snapshots=read('data/runtime/source-snapshots.json');
const snapshotIds=new Set((snapshots.snapshots||[]).map(x=>x.snapshot_id));

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

const legislativeTypes=new Set(['BILL_PASSAGE_WITH_RESISTANCE','MOTION_PASSAGE_WITH_RESISTANCE','PARLIAMENTARY_MEASURE_WITH_RESISTANCE']);
const legislativeOutcomes=new Set(['PASSED','DEFEATED','WITHDRAWN','LAPSED']);
const measureTypes=new Set(['BILL','MOTION','OTHER_PARLIAMENTARY_MEASURE']);

const validateSide=(contest,sideName)=>{
  const side=contest[sideName];
  assert(Boolean(side),`${contest.contest_id}: ${sideName} missing`);
  if(!side) return [];
  const parties=Array.isArray(side.party_ids)?side.party_ids:[];
  const actors=Array.isArray(side.actor_ids)?side.actor_ids:[];
  const refs=Array.isArray(side.source_snapshot_ids)?side.source_snapshot_ids:[];
  assert(parties.length+actors.length>0,`${contest.contest_id}: ${sideName} has no players or teams`);
  assert(unique(parties),`${contest.contest_id}: ${sideName} party_ids contain duplicates`);
  assert(unique(actors),`${contest.contest_id}: ${sideName} actor_ids contain duplicates`);
  assert(refs.length>0,`${contest.contest_id}: ${sideName} requires source snapshots`);
  assert(unique(refs),`${contest.contest_id}: ${sideName} source snapshots contain duplicates`);
  for(const ref of refs){
    assert(snapshotIds.has(ref),`${contest.contest_id}: ${sideName} references unknown snapshot ${ref}`);
    assert((contest.source_refs||[]).includes(ref),`${contest.contest_id}: ${sideName} snapshot ${ref} missing from contest source_refs`);
  }
  return refs;
};

for(const contest of contests.contests||[]){
  assert(Boolean(contest.competition_class),`${contest.contest_id}: competition_class missing`);
  assert(byId.has(contest.competition_class),`${contest.contest_id}: unregistered competition class ${contest.competition_class}`);
  assert(Array.isArray(contest.source_refs)&&contest.source_refs.length>0,`${contest.contest_id}: source lineage missing`);

  if(contest.competition_class==='LEGISLATIVE'){
    assert(legislativeTypes.has(contest.contest_type),`${contest.contest_id}: invalid legislative contest_type`);
    assert(measureTypes.has(contest.measure?.measure_type),`${contest.contest_id}: legislative measure_type invalid`);
    assert(Boolean(contest.measure?.title),`${contest.contest_id}: legislative measure title missing`);
    assert(Boolean(contest.objective?.supporting_side),`${contest.contest_id}: supporting objective missing`);
    assert(Boolean(contest.objective?.opposing_side),`${contest.contest_id}: opposing objective missing`);
    assert(Boolean(contest.current_stage),`${contest.contest_id}: current_stage missing`);
    validateSide(contest,'supporting_side');
    validateSide(contest,'opposing_side');
    const resistanceRefs=Array.isArray(contest.material_resistance?.source_snapshot_ids)?contest.material_resistance.source_snapshot_ids:[];
    assert(contest.material_resistance?.state==='EVIDENCED',`${contest.contest_id}: material resistance is not evidenced`);
    assert(resistanceRefs.length>0,`${contest.contest_id}: material resistance requires source snapshots`);
    assert(unique(resistanceRefs),`${contest.contest_id}: material resistance source snapshots contain duplicates`);
    for(const ref of resistanceRefs){
      assert(snapshotIds.has(ref),`${contest.contest_id}: material resistance references unknown snapshot ${ref}`);
      assert((contest.source_refs||[]).includes(ref),`${contest.contest_id}: resistance snapshot ${ref} missing from contest source_refs`);
    }
    assert(contest.integrity?.material_resistance_required===true,`${contest.contest_id}: material-resistance integrity rule missing`);
    assert(contest.integrity?.side_positions_require_source_lineage===true,`${contest.contest_id}: side-lineage integrity rule missing`);
    assert(contest.integrity?.outcome_requires_verification===true,`${contest.contest_id}: outcome-verification integrity rule missing`);
    assert(contest.integrity?.player_position_changes_require_forward_evidence===true,`${contest.contest_id}: forward player-position rule missing`);
    if(contest.status==='VERIFIED_OUTCOME') assert(legislativeOutcomes.has(contest.verified_outcome),`${contest.contest_id}: verified legislative outcome invalid`);
  }
}

if(fail.length){
  console.error('POLITICAL_MAYHEM_COMPETITION_CLASS_INTEGRITY_FAILED');
  for(const message of fail) console.error('- '+message);
  process.exit(1);
}
console.log('POLITICAL_MAYHEM_COMPETITION_CLASS_INTEGRITY_PASS',`classes=${classes.length}`,`contests=${(contests.contests||[]).length}`,`legislative=${(contests.contests||[]).filter(x=>x.competition_class==='LEGISLATIVE').length}`,'sport=POLITICAL_MAYHEM','legislativeThreshold=MATERIAL_RESISTANCE_EVIDENCED');
