import fs from 'node:fs';

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const fail = [];
const assert = (condition, message) => { if (!condition) fail.push(message); };
const unique = xs => new Set(xs).size === xs.length;
const normaliseDivision = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const manifest = read('data/snapshot-manifest.json');
const requiredIntegrity = [
  'forward_first',
  'hindsight_changes_prohibited',
  'retroactive_signal_backfill_prohibited',
  'failed_projections_retained',
  'all_current_federal_parliamentarians_ingested',
  'party_roster_counts_reconcile_to_player_index',
  'independents_remain_standalone_players',
  'party_affiliation_not_silently_collapsed_into_coalition',
  'player_statistics_preserve_native_political_units',
  'synthetic_composite_player_score_prohibited',
  'missing_player_stat_data_is_not_zero',
  'federal_house_division_electoral_context_complete',
  'federal_house_2025_elected_candidate_stats_complete',
  'federal_house_current_player_candidate_specific_stats_complete',
  'current_house_replacements_do_not_inherit_predecessor_stats',
  'federal_house_candidate_specific_current_player_coverage_is_explicit',
  'other_first_preference_not_attributed_to_individual_players',
  'tpp_not_misrepresented_as_tcp',
  'election_day_party_preserved_for_historical_stats'
];
for (const key of requiredIntegrity) assert(manifest.integrity?.[key] === true, `integrity invariant missing: ${key}`);

for (const [name, entry] of Object.entries(manifest.canonical || {})) {
  assert(entry?.path && fs.existsSync(entry.path), `canonical dependency missing: ${name}`);
}
for (const [name, path] of Object.entries(manifest.runtime || {})) {
  assert(path && fs.existsSync(path), `runtime dependency missing: ${name}`);
}

const statRegistry = read(manifest.canonical.player_stat_registry?.path || 'data/player-stat-registry.json');
assert(statRegistry.rules?.no_synthetic_composite_player_score === true, 'player stat registry permits synthetic composite score');
assert(statRegistry.rules?.zero_requires_observed_zero === true, 'player stat registry permits unobserved zero');
assert(statRegistry.rules?.missing_data_is_not_zero === true, 'player stat registry conflates missing data with zero');
assert(statRegistry.rules?.source_lineage_required === true, 'player stat registry source lineage rule missing');
assert(statRegistry.rules?.aggregate_other_vote_must_not_be_attributed_to_an_individual_player === true, 'player stat registry permits OTH attribution to individual players');
assert(statRegistry.rules?.two_party_preferred_must_not_be_labelled_two_candidate_preferred_in_nonclassic_contests === true, 'player stat registry permits TPP/TCP conflation');
assert(statRegistry.rules?.historical_election_party_must_not_be_rewritten_by_current_affiliation === true, 'player stat registry permits current party to rewrite historical election party');
assert(statRegistry.rules?.current_member_replacement_must_not_inherit_predecessor_election_stats === true, 'player stat registry permits predecessor result inheritance');
for (const id of ['STRUCTURAL','FORWARD_INTELLIGENCE','ELECTORAL_PERFORMANCE','PARLIAMENTARY_ACTIVITY']) {
  assert((statRegistry.groups || []).some(g => g.group_id === id), `player stat group missing: ${id}`);
}
for (const group of statRegistry.groups || []) for (const stat of group.stats || []) {
  assert(stat.stat_id && stat.label && stat.unit && stat.source, `incomplete player stat definition in ${group.group_id || 'UNKNOWN_GROUP'}`);
}

const ingestion = read(manifest.runtime.ingestion_manifest);
assert(ingestion.mode === 'FORWARD_ONLY', 'ingestion mode is not FORWARD_ONLY');
assert(ingestion.rules?.evidence_must_be_knowable_at_capture_time === true, 'knowable-at-capture rule missing');
assert(ingestion.rules?.retroactive_insertion_into_prior_projection_prohibited === true, 'retroactive insertion prohibition missing');

const players = read(manifest.runtime.federal_parliamentary_players);
const roster = read(manifest.runtime.party_rosters);
const depth = read(manifest.runtime.team_squad_depth);
const form = read(manifest.runtime.team_player_form);
const allPlayers = players.players || [];
const partyTeams = roster.parties || [];
const independentRoster = roster.independent_actors || [];
const rosterActors = partyTeams.flatMap(t => (t.actors || []).map(a => ({...a, roster_party_id:t.party_id})));
const playerIds = allPlayers.map(p => p.actor_id);
const partyPlayerIds = allPlayers.filter(p => p.party_id).map(p => p.actor_id);
const independentPlayers = allPlayers.filter(p => !p.party_id);
const rosterIds = rosterActors.map(a => a.actor_id);

assert(players.status === 'COMPLETE_CURRENT_FEDERAL_PARLIAMENTARY_BASELINE', 'federal player index is not a complete current baseline');
assert(roster.status === 'COMPLETE_CURRENT_FEDERAL_PARLIAMENTARY_ROSTER', 'party roster is not a complete current federal roster');
assert(players.counts?.total_players === 226 && allPlayers.length === 226, 'federal player total must be 226');
assert(players.counts?.house === 150 && allPlayers.filter(p=>p.chamber==='HOUSE').length === 150, 'House player total must be 150');
assert(players.counts?.senate === 76 && allPlayers.filter(p=>p.chamber==='SENATE').length === 76, 'Senate player total must be 76');
assert(unique(playerIds), 'federal player actor IDs are not unique');
assert(players.counts?.party_affiliated === 214 && partyPlayerIds.length === 214, 'party-affiliated player total must be 214');
assert(players.counts?.independents === 12 && independentPlayers.length === 12, 'independent player total must be 12');
assert(players.counts?.teams === 12 && partyTeams.length === 12, 'federal party-team total must be 12');
assert(!partyTeams.some(t => /independent/i.test(String(t.short_name || t.name || ''))), 'synthetic Independent party/team exists');
assert(rosterActors.length === 214, `party rosters contain ${rosterActors.length} players, expected 214`);
assert(unique(rosterIds), 'a party-affiliated player appears in multiple team rosters');
assert(independentRoster.length === 12 && unique(independentRoster.map(a=>a.actor_id)), 'independent roster must contain 12 unique standalone actors');

const playerById = new Map(allPlayers.map(p => [p.actor_id, p]));
for (const actor of rosterActors) {
  const global = playerById.get(actor.actor_id);
  assert(Boolean(global), `roster actor missing from global player index: ${actor.actor_id}`);
  if (global) assert(global.party_id === actor.roster_party_id, `${actor.actor_id} team mismatch: roster=${actor.roster_party_id} global=${global.party_id}`);
}
for (const p of allPlayers.filter(p=>p.party_id)) assert(rosterIds.includes(p.actor_id), `party-affiliated global player missing from team roster: ${p.actor_id}`);
for (const p of independentPlayers) {
  assert(!rosterIds.includes(p.actor_id), `independent player incorrectly assigned to party team: ${p.actor_id}`);
  assert(independentRoster.some(a=>a.actor_id===p.actor_id), `independent player missing standalone roster entry: ${p.actor_id}`);
}
const rosterCountSum = partyTeams.reduce((n,t)=>n+Number(t.player_count||0),0);
assert(rosterCountSum===214, `team player_count sum is ${rosterCountSum}, expected 214`);
assert(roster.counts?.total_players===players.counts?.total_players, 'roster/player total count mismatch');
assert(roster.counts?.party_affiliated===players.counts?.party_affiliated, 'roster/player party-affiliated count mismatch');
assert(roster.counts?.independents===players.counts?.independents, 'roster/player independent count mismatch');

const depthTeams = depth.teams || [];
assert(depthTeams.length===partyTeams.length, 'team squad-depth count does not match party roster count');
for (const t of depthTeams) {
  assert(t.coverage_percent===100, `${t.party_id} federal squad coverage is not 100%`);
  assert(t.coverage_state==='CURRENT_FEDERAL_PARLIAMENTARY_SQUAD_FULLY_INGESTED', `${t.party_id} squad not marked fully ingested`);
  assert(t.ingested_players===t.federal_parliamentary_squad, `${t.party_id} ingested/squad count mismatch`);
  const rosterTeam=partyTeams.find(x=>x.party_id===t.party_id);
  assert(Boolean(rosterTeam), `${t.party_id} squad-depth team missing from party roster`);
  if(rosterTeam) assert(rosterTeam.player_count===t.federal_parliamentary_squad, `${t.party_id} roster/depth squad count mismatch`);
}
assert(depth.independent_players===12, `squad-depth independent count expected 12, got ${depth.independent_players}`);

const playerFormIds=(form.player_form||[]).map(x=>x.actor_id);
assert(form.status==='COMPLETE_CURRENT_FEDERAL_PLAYER_BASELINE', 'player form is not complete current federal baseline');
assert(playerFormIds.length===226 && unique(playerFormIds), 'player form must contain 226 unique players');
for(const id of playerIds) assert(playerFormIds.includes(id), `global player missing from player form: ${id}`);
for(const f of form.player_form||[]){
  const global=playerById.get(f.actor_id);
  assert(Boolean(global), `player form references unknown actor: ${f.actor_id}`);
  if(global) assert((f.party_id??null)===(global.party_id??null), `${f.actor_id} player form party mismatch`);
}
assert((form.team_form||[]).length===12, `team form contains ${(form.team_form||[]).length} teams, expected 12`);

const electoral=read(manifest.runtime.federal_house_electoral_performance);
assert(electoral.status==='COMPLETE_150_DIVISION_CONTEXT_AND_2025_ELECTED_CANDIDATE_STATS_WITH_CURRENT_MEMBER_RECONCILIATION', 'federal House electoral snapshot not marked complete for candidate reconciliation');
assert(electoral.rules?.other_column_must_not_be_attributed_to_any_individual_candidate===true, 'electoral runtime permits OTH attribution to an individual');
assert(electoral.rules?.tpp_is_division_context_not_tcp_for_non_classic_contests===true, 'electoral runtime permits TPP/TCP conflation');
assert(electoral.rules?.current_party_affiliation_must_not_rewrite_election_day_party===true, 'electoral runtime permits current affiliation to rewrite historical party');
assert(electoral.rules?.current_member_replacement_must_not_inherit_predecessor_election_stats===true, 'electoral runtime permits replacement inheritance');
assert(electoral.rules?.missing_candidate_specific_result_is_not_zero===true, 'electoral runtime permits missing candidate result to become zero');
assert(electoral.rules?.surname_reconciliation_requires_terminal_name_token_match===true, 'winner/current-member name reconciliation rule missing');

const electoralFields=electoral.fields||[];
const eix=Object.fromEntries(electoralFields.map((f,i)=>[f,i]));
const divisionRows=electoral.division_results||[];
assert(electoralFields.length===10, `electoral field count expected 10, got ${electoralFields.length}`);
assert(divisionRows.length===150, `federal House division electoral rows expected 150, got ${divisionRows.length}`);
assert(unique(divisionRows.map(r=>normaliseDivision(r[eix.division]))), 'federal House electoral division names are not unique');
assert(electoral.coverage?.division_context_records===150 && electoral.coverage?.division_context_total===150, 'electoral division-context coverage must be 150/150');
const divisionNames=new Set(divisionRows.map(r=>normaliseDivision(r[eix.division])));
const housePlayers=allPlayers.filter(p=>p.chamber==='HOUSE');
for(const p of housePlayers) assert(divisionNames.has(normaliseDivision(p.division)), `current House player division missing electoral context: ${p.actor_id} ${p.division}`);

const candidateSpecific=electoral.candidate_specific_results||[];
const historicalWinners=electoral.historical_2025_winners_not_current_members||[];
const general2025=candidateSpecific.filter(x=>x.event==='2025 Federal Election');
const laterEvents=candidateSpecific.filter(x=>x.event!=='2025 Federal Election');
assert(electoral.coverage?.elected_2025_candidate_records===150, '2025 elected-candidate record coverage must be 150');
assert(electoral.coverage?.elected_2025_candidate_expected===150, '2025 elected-candidate expected total must be 150');
assert(general2025.length+historicalWinners.length===150, `2025 current+historical winner reconciliation is ${general2025.length+historicalWinners.length}, expected 150`);
assert(electoral.coverage?.candidate_specific_2025_current_players===general2025.length, '2025 current-player candidate coverage metadata mismatch');
assert(electoral.coverage?.historical_2025_winners_not_current_members===historicalWinners.length, 'historical-winner coverage metadata mismatch');
assert(electoral.coverage?.later_event_candidate_specific_records===laterEvents.length, 'later-event candidate coverage metadata mismatch');
assert(electoral.coverage?.candidate_specific_records===candidateSpecific.length, 'candidate-specific record total metadata mismatch');
assert(unique(candidateSpecific.map(x=>`${x.actor_id}|${x.event}`)), 'candidate-specific actor/event identities are not unique');
for(const x of candidateSpecific) assert(playerIds.includes(x.actor_id), `candidate-specific electoral record references unknown current federal player: ${x.actor_id}`);
for(const x of general2025){
  const p=playerById.get(x.actor_id);
  assert(p?.chamber==='HOUSE', `2025 candidate-specific record is not a current House player: ${x.actor_id}`);
  if(p) assert(normaliseDivision(p.division)===normaliseDivision(x.division), `${x.actor_id} 2025 electoral division does not match current division reconciliation`);
}
for(const h of historicalWinners){
  assert(h.event==='2025 Federal Election', `historical winner is not a 2025 general-election record: ${h.candidate_name||h.division}`);
  if(h.current_actor_id) assert(!general2025.some(x=>x.actor_id===h.current_actor_id&&normaliseDivision(x.division)===normaliseDivision(h.division)), `replacement inherited predecessor result: ${h.current_actor_id} ${h.division}`);
}
const currentCandidateIds=new Set(candidateSpecific.map(x=>x.actor_id));
assert(currentCandidateIds.size===150, `current House players with candidate-specific electoral stats expected 150, got ${currentCandidateIds.size}`);
for(const p of housePlayers) assert(currentCandidateIds.has(p.actor_id), `current House player missing candidate-specific electoral stats: ${p.actor_id}`);
assert(electoral.coverage?.current_players_with_any_candidate_specific_stats===150, 'current House candidate-specific coverage metadata must be 150');
assert(electoral.coverage?.current_players_without_any_candidate_specific_stats===0, 'current House candidate-specific unresolved count must be zero');
assert((electoral.unresolved_current_house_players||[]).length===0, 'current House candidate-specific unresolved list is not empty');

assert(electoral.current_player_election_party_overrides?.['ACT-BARNABY-JOYCE']?.election_party_code==='NP', 'Barnaby Joyce 2025 election-party override must remain Nationals');
assert(electoral.current_player_election_party_overrides?.['ACT-DAVID-FARLEY']?.election_party_code===null, 'David Farley must not inherit a 2025 general-election party code');
assert(!general2025.some(x=>x.actor_id==='ACT-DAVID-FARLEY'), 'David Farley incorrectly carries Sussan Ley 2025 Farrer statistics');
const farrerHistorical=historicalWinners.find(x=>normaliseDivision(x.division)==='farrer');
assert(farrerHistorical?.candidate_name?.toLowerCase().includes('ley'), 'Farrer 2025 historical winner must remain Sussan Ley');
assert(farrerHistorical?.current_actor_id==='ACT-DAVID-FARLEY', 'Farrer replacement reconciliation must point to David Farley');
const farley=candidateSpecific.find(x=>x.actor_id==='ACT-DAVID-FARLEY');
assert(farley?.event==='2026 Farrer By-election'&&farley?.tcp_percent===57.55, 'David Farley by-election result mismatch');
const adelaide=divisionRows.find(r=>r[eix.division]==='Adelaide');
assert(adelaide?.[eix.alp_first_preference_percent]===46.49, 'Adelaide ALP first preference must equal AEC final 46.49');
assert(adelaide?.[eix.tpp_alp_percent]===69.07, 'Adelaide ALP TPP must equal AEC final 69.07');
const bradfield=candidateSpecific.find(x=>x.actor_id==='ACT-NICOLETTE-BOELE');
assert(bradfield?.primary_vote_percent===27.01&&bradfield?.tcp_percent===50.01, 'Nicolette Boele candidate-specific result mismatch');

const projections=read(manifest.runtime.projection_ledger);
assert(projections.rules?.append_only===true, 'projection ledger not append-only');
assert(projections.rules?.frozen_projection_mutation_prohibited===true, 'frozen projection mutation prohibition missing');
for(const p of projections.projections||[]){
  assert(p.projection_id, 'projection missing projection_id');
  assert(p.contest_id, `${p.projection_id||'projection'} missing contest_id`);
  assert(p.evidence_cutoff, `${p.projection_id||'projection'} missing evidence_cutoff`);
  assert(Array.isArray(p.source_snapshot_ids), `${p.projection_id||'projection'} missing source lineage`);
  if(p.projection_state==='FROZEN'||p.projection_state==='GRADED'){
    assert(p.integrity?.hindsight_changes_prohibited===true, `${p.projection_id} frozen without hindsight prohibition`);
    assert(p.integrity?.retroactive_signal_backfill_prohibited===true, `${p.projection_id} frozen without retroactive backfill prohibition`);
    assert(p.integrity?.frozen_at, `${p.projection_id} frozen without frozen_at`);
  }
  if(p.prior_projection_id) assert((projections.projections||[]).some(x=>x.projection_id===p.prior_projection_id), `${p.projection_id} references missing prior projection`);
}

const checkpoints=read(manifest.runtime.checkpoint_ledger);
assert(checkpoints.rules?.no_reconstruction_after_outcome===true, 'checkpoint hindsight reconstruction prohibition missing');
for(const contest of checkpoints.contests||[]) for(const cp of contest.checkpoints||[]){
  if(cp.capture_state==='CAPTURED_LATE_PRE_OUTCOME'){
    assert(cp.captured_at&&cp.outcome_time, `${cp.checkpoint_id||'checkpoint'} late capture lacks timing evidence`);
    if(cp.captured_at&&cp.outcome_time) assert(Date.parse(cp.captured_at)<Date.parse(cp.outcome_time), `${cp.checkpoint_id} late capture occurred after outcome`);
  }
  if(cp.capture_state==='MISSED_NOT_CAPTURED') assert(!cp.source_snapshot_ids?.length, `${cp.checkpoint_id||'checkpoint'} reconstructed despite MISSED_NOT_CAPTURED`);
}

const outcomes=read(manifest.runtime.outcome_ledger);
for(const o of outcomes.outcomes||[]){
  assert(o.outcome_id&&o.contest_id, 'outcome missing identity');
  if(o.verification_state==='VERIFIED') assert(Array.isArray(o.source_snapshot_ids)&&o.source_snapshot_ids.length>0, `${o.outcome_id} verified without source snapshot`);
}

const audits=read(manifest.runtime.audit_ledger);
assert(audits.rules?.append_only===true, 'audit ledger not append-only');
for(const a of audits.audits||[]){
  assert(a.pre_outcome_evidence_only===true, `${a.audit_id||'audit'} permits post-outcome causation`);
  assert(a.integrity?.frozen_projection_unchanged===true, `${a.audit_id||'audit'} does not preserve frozen projection`);
  assert(a.integrity?.no_hindsight_rewrite===true, `${a.audit_id||'audit'} permits hindsight rewrite`);
}

if(fail.length){
  console.error('POLITICAL_MAYHEM_FORWARD_INTEGRITY_FAILED');
  for(const message of fail) console.error('- '+message);
  process.exit(1);
}

console.log('POLITICAL_MAYHEM_FORWARD_INTEGRITY_PASS',manifest.snapshot_id,`players=${allPlayers.length}`,`teams=${partyTeams.length}`,`independents=${independentPlayers.length}`,`playerStatGroups=${(statRegistry.groups||[]).length}`,`houseElectoralDivisions=${divisionRows.length}`,`candidateSpecificCurrent=${currentCandidateIds.size}`,`historical2025Winners=${historicalWinners.length}`);
