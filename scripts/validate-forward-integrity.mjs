import fs from 'node:fs';

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const fail = [];
const assert = (condition, message) => { if (!condition) fail.push(message); };
const unique = xs => new Set(xs).size === xs.length;

const manifest = read('data/snapshot-manifest.json');
assert(manifest.integrity?.forward_first === true, 'forward_first invariant missing');
assert(manifest.integrity?.hindsight_changes_prohibited === true, 'hindsight prohibition missing');
assert(manifest.integrity?.retroactive_signal_backfill_prohibited === true, 'retroactive signal prohibition missing');
assert(manifest.integrity?.failed_projections_retained === true, 'failed projection retention missing');
assert(manifest.integrity?.all_current_federal_parliamentarians_ingested === true, 'complete federal player ingestion invariant missing');
assert(manifest.integrity?.party_roster_counts_reconcile_to_player_index === true, 'party/player reconciliation invariant missing');
assert(manifest.integrity?.independents_remain_standalone_players === true, 'standalone independent invariant missing');
assert(manifest.integrity?.party_affiliation_not_silently_collapsed_into_coalition === true, 'party affiliation/coalition separation invariant missing');

for (const [name, entry] of Object.entries(manifest.canonical || {})) {
  assert(entry?.path && fs.existsSync(entry.path), `canonical dependency missing: ${name}`);
}
for (const [name, path] of Object.entries(manifest.runtime || {})) {
  assert(path && fs.existsSync(path), `runtime dependency missing: ${name}`);
}

const ingestion = read(manifest.runtime.ingestion_manifest);
assert(ingestion.mode === 'FORWARD_ONLY', 'ingestion mode is not FORWARD_ONLY');
assert(ingestion.rules?.evidence_must_be_knowable_at_capture_time === true, 'knowable-at-capture rule missing');
assert(ingestion.rules?.retroactive_insertion_into_prior_projection_prohibited === true, 'retroactive insertion prohibition missing');

// Complete current federal player/team baseline.
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
assert(players.counts?.total_players === 226, `federal player count expected 226, got ${players.counts?.total_players}`);
assert(players.counts?.house === 150, `House player count expected 150, got ${players.counts?.house}`);
assert(players.counts?.senate === 76, `Senate player count expected 76, got ${players.counts?.senate}`);
assert(allPlayers.length === 226, `federal player index contains ${allPlayers.length}, expected 226`);
assert(allPlayers.filter(p => p.chamber === 'HOUSE').length === 150, 'player index House rows do not equal 150');
assert(allPlayers.filter(p => p.chamber === 'SENATE').length === 76, 'player index Senate rows do not equal 76');
assert(unique(playerIds), 'federal player actor IDs are not unique');
assert(players.counts?.party_affiliated === 214, `party-affiliated player count expected 214, got ${players.counts?.party_affiliated}`);
assert(players.counts?.independents === 12, `independent player count expected 12, got ${players.counts?.independents}`);
assert(partyPlayerIds.length === 214, `party-affiliated player rows expected 214, got ${partyPlayerIds.length}`);
assert(independentPlayers.length === 12, `standalone independent player rows expected 12, got ${independentPlayers.length}`);
assert(players.counts?.teams === 12, `party team count expected 12, got ${players.counts?.teams}`);
assert(partyTeams.length === 12, `party roster contains ${partyTeams.length} teams, expected 12`);
assert(!partyTeams.some(t => /independent/i.test(String(t.short_name || t.name || ''))), 'synthetic Independent party/team exists');
assert(rosterActors.length === 214, `party rosters contain ${rosterActors.length} players, expected 214`);
assert(unique(rosterIds), 'a party-affiliated player appears in multiple team rosters');
assert(independentRoster.length === 12, `party roster independent_actors expected 12, got ${independentRoster.length}`);
assert(unique(independentRoster.map(a => a.actor_id)), 'independent roster actor IDs are not unique');

const playerById = new Map(allPlayers.map(p => [p.actor_id, p]));
for (const actor of rosterActors) {
  const global = playerById.get(actor.actor_id);
  assert(Boolean(global), `roster actor missing from global player index: ${actor.actor_id}`);
  if (global) assert(global.party_id === actor.roster_party_id, `${actor.actor_id} team mismatch: roster=${actor.roster_party_id} global=${global.party_id}`);
}
for (const p of allPlayers.filter(p => p.party_id)) {
  assert(rosterIds.includes(p.actor_id), `party-affiliated global player missing from team roster: ${p.actor_id}`);
}
for (const p of independentPlayers) {
  assert(!rosterIds.includes(p.actor_id), `independent player incorrectly assigned to party team: ${p.actor_id}`);
  assert(independentRoster.some(a => a.actor_id === p.actor_id), `independent player missing standalone roster entry: ${p.actor_id}`);
}

const rosterCountSum = partyTeams.reduce((n,t)=>n + Number(t.player_count || 0), 0);
assert(rosterCountSum === 214, `team player_count sum is ${rosterCountSum}, expected 214`);
assert(roster.counts?.total_players === players.counts?.total_players, 'roster/player total count mismatch');
assert(roster.counts?.party_affiliated === players.counts?.party_affiliated, 'roster/player party-affiliated count mismatch');
assert(roster.counts?.independents === players.counts?.independents, 'roster/player independent count mismatch');

const depthTeams = depth.teams || [];
assert(depthTeams.length === partyTeams.length, 'team squad-depth count does not match party roster count');
for (const t of depthTeams) {
  assert(t.coverage_percent === 100, `${t.party_id} federal squad coverage is not 100%`);
  assert(t.coverage_state === 'CURRENT_FEDERAL_PARLIAMENTARY_SQUAD_FULLY_INGESTED', `${t.party_id} squad not marked fully ingested`);
  assert(t.ingested_players === t.federal_parliamentary_squad, `${t.party_id} ingested/squad count mismatch`);
  const rosterTeam = partyTeams.find(x => x.party_id === t.party_id);
  assert(Boolean(rosterTeam), `${t.party_id} squad-depth team missing from party roster`);
  if (rosterTeam) assert(rosterTeam.player_count === t.federal_parliamentary_squad, `${t.party_id} roster/depth squad count mismatch`);
}
assert(depth.independent_players === 12, `squad-depth independent count expected 12, got ${depth.independent_players}`);

const playerFormIds = (form.player_form || []).map(x => x.actor_id);
assert(form.status === 'COMPLETE_CURRENT_FEDERAL_PLAYER_BASELINE', 'player form is not complete current federal baseline');
assert(playerFormIds.length === 226, `player form contains ${playerFormIds.length} players, expected 226`);
assert(unique(playerFormIds), 'player form actor IDs are not unique');
for (const id of playerIds) assert(playerFormIds.includes(id), `global player missing from player form: ${id}`);
for (const f of form.player_form || []) {
  const global = playerById.get(f.actor_id);
  assert(Boolean(global), `player form references unknown actor: ${f.actor_id}`);
  if (global) assert((f.party_id ?? null) === (global.party_id ?? null), `${f.actor_id} player form party mismatch`);
}
assert((form.team_form || []).length === 12, `team form contains ${(form.team_form || []).length} teams, expected 12`);

const projections = read(manifest.runtime.projection_ledger);
assert(projections.rules?.append_only === true, 'projection ledger not append-only');
assert(projections.rules?.frozen_projection_mutation_prohibited === true, 'frozen projection mutation prohibition missing');
for (const p of projections.projections || []) {
  assert(p.projection_id, 'projection missing projection_id');
  assert(p.contest_id, `${p.projection_id || 'projection'} missing contest_id`);
  assert(p.evidence_cutoff, `${p.projection_id || 'projection'} missing evidence_cutoff`);
  assert(Array.isArray(p.source_snapshot_ids), `${p.projection_id || 'projection'} missing source lineage`);
  if (p.projection_state === 'FROZEN' || p.projection_state === 'GRADED') {
    assert(p.integrity?.hindsight_changes_prohibited === true, `${p.projection_id} frozen without hindsight prohibition`);
    assert(p.integrity?.retroactive_signal_backfill_prohibited === true, `${p.projection_id} frozen without retroactive backfill prohibition`);
    assert(p.integrity?.frozen_at, `${p.projection_id} frozen without frozen_at`);
  }
  if (p.prior_projection_id) {
    assert((projections.projections || []).some(x => x.projection_id === p.prior_projection_id), `${p.projection_id} references missing prior projection`);
  }
}

const checkpoints = read(manifest.runtime.checkpoint_ledger);
assert(checkpoints.rules?.no_reconstruction_after_outcome === true, 'checkpoint hindsight reconstruction prohibition missing');
for (const contest of checkpoints.contests || []) {
  for (const cp of contest.checkpoints || []) {
    if (cp.capture_state === 'CAPTURED_LATE_PRE_OUTCOME') {
      assert(cp.captured_at && cp.outcome_time, `${cp.checkpoint_id || 'checkpoint'} late capture lacks timing evidence`);
      if (cp.captured_at && cp.outcome_time) assert(Date.parse(cp.captured_at) < Date.parse(cp.outcome_time), `${cp.checkpoint_id} late capture occurred after outcome`);
    }
    if (cp.capture_state === 'MISSED_NOT_CAPTURED') assert(!cp.source_snapshot_ids?.length, `${cp.checkpoint_id || 'checkpoint'} reconstructed despite MISSED_NOT_CAPTURED`);
  }
}

const outcomes = read(manifest.runtime.outcome_ledger);
for (const o of outcomes.outcomes || []) {
  assert(o.outcome_id && o.contest_id, 'outcome missing identity');
  if (o.verification_state === 'VERIFIED') assert(Array.isArray(o.source_snapshot_ids) && o.source_snapshot_ids.length > 0, `${o.outcome_id} verified without source snapshot`);
}

const audits = read(manifest.runtime.audit_ledger);
assert(audits.rules?.append_only === true, 'audit ledger not append-only');
for (const a of audits.audits || []) {
  assert(a.pre_outcome_evidence_only === true, `${a.audit_id || 'audit'} permits post-outcome causation`);
  assert(a.integrity?.frozen_projection_unchanged === true, `${a.audit_id || 'audit'} does not preserve frozen projection`);
  assert(a.integrity?.no_hindsight_rewrite === true, `${a.audit_id || 'audit'} permits hindsight rewrite`);
}

if (fail.length) {
  console.error('POLITICAL_MAYHEM_FORWARD_INTEGRITY_FAILED');
  for (const message of fail) console.error('- ' + message);
  process.exit(1);
}

console.log('POLITICAL_MAYHEM_FORWARD_INTEGRITY_PASS', manifest.snapshot_id, `players=${allPlayers.length}`, `teams=${partyTeams.length}`, `independents=${independentPlayers.length}`);
