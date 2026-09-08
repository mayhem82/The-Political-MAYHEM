import fs from 'node:fs';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const fail=[];
const assert=(ok,msg)=>{if(!ok)fail.push(msg)};
const unique=xs=>new Set(xs).size===xs.length;

const manifest=read('data/snapshot-manifest.json');
const players=read(manifest.runtime.federal_parliamentary_players);
const senate=read(manifest.runtime.federal_senate_electoral_performance);
const registry=read(manifest.canonical.player_stat_registry.path);
const current=(players.players||[]).filter(p=>p.chamber==='SENATE');
const records=senate.current_senator_records||[];
const unresolved=senate.unresolved_current_senators||[];
const historical=senate.historical_elected_not_current||[];
const currentIds=new Set(current.map(p=>p.actor_id));
const recordIds=records.map(r=>r.actor_id);
const unresolvedIds=unresolved.map(r=>r.actor_id);

for(const key of ['federal_senate_elected_record_coverage_is_explicit','federal_senate_group_vote_is_context_not_individual_primary','federal_senate_replacements_do_not_inherit_predecessor_stats','federal_senate_unresolved_replacements_are_explicit']){
  assert(manifest.integrity?.[key]===true,`Senate integrity invariant missing: ${key}`);
}
assert(registry.rules?.senate_group_first_preference_must_not_be_labelled_individual_primary_vote===true,'stat registry permits Senate group vote as individual primary');
assert(registry.rules?.senate_replacement_must_not_inherit_predecessor_election_stats===true,'stat registry permits Senate predecessor inheritance');
assert(senate.rules?.group_first_preference_is_team_context_not_individual_candidate_primary===true,'Senate runtime group-context rule missing');
assert(senate.rules?.below_the_line_candidate_vote_must_not_be_inferred_from_group_vote===true,'Senate runtime permits inferred BTL vote');
assert(senate.rules?.current_replacement_must_not_inherit_predecessor_election_stats===true,'Senate runtime permits replacement inheritance');
assert(senate.rules?.election_day_party_is_preserved===true,'Senate election-day party preservation missing');
assert(senate.rules?.missing_group_context_is_not_zero===true,'Senate runtime permits missing group context as zero');
assert(senate.rules?.current_senator_must_match_state_and_name_before_elected_record_attribution===true,'Senate attribution identity rule missing');

assert(current.length===76,`current Senate player count ${current.length}, expected 76`);
assert(senate.coverage?.current_senators===76,'Senate coverage current_senators must be 76');
assert(records.length===69,`matched current Senate elected records ${records.length}, expected 69`);
assert(unresolved.length===7,`unresolved current Senators ${unresolved.length}, expected 7`);
assert(senate.coverage?.current_senators_with_elected_record===records.length,'Senate matched-record coverage mismatch');
assert(senate.coverage?.current_senators_without_elected_record===unresolved.length,'Senate unresolved coverage mismatch');
assert(senate.coverage?.current_senators_with_group_vote_context===69,'Senate group-vote coverage must be 69');
assert(records.length+unresolved.length===76,'matched + unresolved Senate players must reconcile to 76');
assert(unique(recordIds),'Senate matched actor IDs are not unique');
assert(unique(unresolvedIds),'Senate unresolved actor IDs are not unique');
assert(!recordIds.some(id=>unresolvedIds.includes(id)),'Senate actor appears in both matched and unresolved sets');
for(const id of [...recordIds,...unresolvedIds]) assert(currentIds.has(id),`Senate electoral runtime references non-current Senator: ${id}`);
for(const p of current) assert(recordIds.includes(p.actor_id)||unresolvedIds.includes(p.actor_id),`current Senator absent from electoral reconciliation: ${p.actor_id}`);

const playerById=new Map(current.map(p=>[p.actor_id,p]));
for(const r of records){
  const p=playerById.get(r.actor_id);
  assert(Boolean(p),`matched Senate record missing current player: ${r.actor_id}`);
  if(p) assert(String(p.state||'').toUpperCase()===String(r.state||'').toUpperCase(),`${r.actor_id} Senate state mismatch`);
  assert([2022,2025].includes(r.election_year),`${r.actor_id} Senate record has unsupported election year ${r.election_year}`);
  assert(Number.isInteger(r.elected_order)&&r.elected_order>=1&&r.elected_order<=6,`${r.actor_id} invalid elected order ${r.elected_order}`);
  assert(typeof r.group_first_preference_percent==='number'&&r.group_first_preference_percent>=0&&r.group_first_preference_percent<=100,`${r.actor_id} missing/invalid group first-preference percent`);
  assert(typeof r.group_first_preference_votes==='number'&&r.group_first_preference_votes>=0,`${r.actor_id} missing/invalid group first-preference votes`);
  assert(typeof r.state_formal_votes==='number'&&r.state_formal_votes>0,`${r.actor_id} missing/invalid state formal votes`);
  assert(Array.isArray(r.source_refs)&&r.source_refs.length===2,`${r.actor_id} Senate source lineage incomplete`);
}

const y2025=records.filter(r=>r.election_year===2025).length;
const y2022=records.filter(r=>r.election_year===2022).length;
assert(y2025===39,`current 2025 Senate cohort ${y2025}, expected 39`);
assert(y2022===30,`current 2022 Senate cohort ${y2022}, expected 30`);
assert(senate.coverage?.current_matches_by_election_year?.['2025']===39,'2025 Senate cohort metadata mismatch');
assert(senate.coverage?.current_matches_by_election_year?.['2022']===30,'2022 Senate cohort metadata mismatch');
assert(historical.filter(r=>r.election_year===2025).length===1,'historical 2025 elected-not-current count must be 1');
assert(historical.filter(r=>r.election_year===2022).length===10,'historical 2022 elected-not-current count must be 10');
assert(historical.length===11,`historical Senate elected-not-current count ${historical.length}, expected 11`);

const sean='ACT-SEAN-BELL';
assert(unresolvedIds.includes(sean),'Sean Bell must remain unresolved to a direct 2025/2022 elected record');
assert(!recordIds.includes(sean),'Sean Bell must not inherit Warwick Stacey electoral record');
const stacey=historical.find(r=>r.election_year===2025&&String(r.state).toUpperCase()==='NSW'&&String(r.candidate_name).toLowerCase().includes('stacey'));
assert(Boolean(stacey),'Warwick Stacey 2025 historical elected record missing');
assert(stacey?.elected_order===6,'Warwick Stacey 2025 NSW elected order must remain 6');
assert(stacey?.election_party_code==='ON','Warwick Stacey 2025 party must remain One Nation');

for(const u of unresolved){
  assert(!records.some(r=>r.actor_id===u.actor_id),`${u.actor_id} unresolved Senator inherited a predecessor record`);
  assert(/not matched|not inherit/i.test(String(u.reason||'')),`${u.actor_id} unresolved reason does not preserve non-inheritance state`);
}

if(fail.length){
  console.error('FEDERAL_SENATE_ELECTORAL_INTEGRITY_FAILED');
  for(const m of fail)console.error('- '+m);
  process.exit(1);
}
console.log('FEDERAL_SENATE_ELECTORAL_INTEGRITY_PASS',`current=76`,`matched=${records.length}`,`unresolved=${unresolved.length}`,`cohort2025=${y2025}`,`cohort2022=${y2022}`,`historical=${historical.length}`);
