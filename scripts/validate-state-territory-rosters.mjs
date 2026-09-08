import fs from 'node:fs';

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const fail = [];
const assert = (condition, message) => { if (!condition) fail.push(message); };
const unique = xs => new Set(xs).size === xs.length;

const data = read('data/runtime/state-territory-parliamentary-players.json');
const competitions = read('data/runtime/political-competitions.json');
const manifest = read('data/runtime/forward-ingestion-manifest.json');

assert(data.rules?.jurisdictions_remain_distinct === true, 'jurisdiction separation rule missing');
assert(data.rules?.independents_are_standalone_players === true, 'standalone independent rule missing');
assert(data.rules?.no_synthetic_independent_team === true, 'synthetic-independent prohibition missing');

const completed = data.coverage?.completed_jurisdictions || [];
assert(completed.includes('AUS-ACT'), 'ACT not marked complete');
assert(completed.includes('AUS-NT'), 'NT not marked complete');
assert(data.coverage?.completed_player_count === 50, `state/territory completed player count expected 50, got ${data.coverage?.completed_player_count}`);

for (const j of data.jurisdictions || []) {
  const players = j.players || [];
  const teamPlayers = players.filter(p => p.party_id);
  const independents = players.filter(p => !p.party_id);
  const teamCount = (j.teams || []).reduce((n,t) => n + Number(t.player_count || 0), 0);
  assert(players.length === j.counts?.total_players, `${j.competition_id} player total mismatch`);
  assert(teamPlayers.length === j.counts?.party_affiliated, `${j.competition_id} party-affiliated count mismatch`);
  assert(independents.length === j.counts?.independents, `${j.competition_id} independent count mismatch`);
  assert(teamCount === teamPlayers.length, `${j.competition_id} team counts do not reconcile to party players`);
  assert(unique(players.map(p => p.actor_id)), `${j.competition_id} actor IDs are not unique`);
  assert(players.every(p => p.jurisdiction_id === j.competition_id), `${j.competition_id} contains cross-jurisdiction player`);
  assert(independents.every(p => p.party === 'Independent'), `${j.competition_id} standalone independent label mismatch`);
  assert(!((j.teams || []).some(t => /independent/i.test(t.name))), `${j.competition_id} has synthetic Independent team`);
  assert(j.integrity?.official_total_reconciled === true, `${j.competition_id} total not reconciled to official source`);
  assert(j.integrity?.official_party_breakdown_reconciled === true, `${j.competition_id} party breakdown not reconciled to official source`);
  assert(j.integrity?.all_current_players_ingested === true, `${j.competition_id} not marked complete`);

  const competition = (competitions.competitions || []).find(c => c.competition_id === j.competition_id);
  assert(Boolean(competition), `${j.competition_id} missing from political competitions registry`);
  if (competition) {
    assert(competition.ingestion_state === 'CURRENT_PARLIAMENTARY_ROSTER_INGESTED', `${j.competition_id} competition ingestion state mismatch`);
    assert(competition.ingested_player_count === players.length, `${j.competition_id} competition player count mismatch`);
  }
}

const act = (data.jurisdictions || []).find(j => j.competition_id === 'AUS-ACT');
const nt = (data.jurisdictions || []).find(j => j.competition_id === 'AUS-NT');
assert(act?.counts?.total_players === 25, 'ACT expected 25 players');
assert(act?.teams?.find(t => t.party_id === 'AUS-ACT-LAB')?.player_count === 10, 'ACT Labor expected 10');
assert(act?.teams?.find(t => t.party_id === 'AUS-ACT-LIB')?.player_count === 8, 'ACT Liberals expected 8');
assert(act?.teams?.find(t => t.party_id === 'AUS-ACT-GRN')?.player_count === 4, 'ACT Greens expected 4');
assert(act?.counts?.independents === 3, 'ACT independents expected 3');

assert(nt?.counts?.total_players === 25, 'NT expected 25 players');
assert(nt?.teams?.find(t => t.party_id === 'AUS-NT-CLP')?.player_count === 17, 'NT CLP expected 17');
assert(nt?.teams?.find(t => t.party_id === 'AUS-NT-LAB')?.player_count === 5, 'NT Labor expected 5');
assert(nt?.counts?.independents === 3, 'NT independents expected 3');

assert(manifest.structural_data_loaded?.state_and_territory_player_rosters === '2_OF_8_COMPLETE', 'ingestion manifest state/territory roster status mismatch');
assert(manifest.structural_data_loaded?.state_and_territory_players_ingested === 50, 'ingestion manifest state/territory player count mismatch');
assert((manifest.queues?.jurisdiction_ingestion || []).length === 6, 'remaining jurisdiction ingestion queue expected 6');

if (fail.length) {
  console.error('POLITICAL_MAYHEM_STATE_TERRITORY_ROSTER_INTEGRITY_FAILED');
  for (const message of fail) console.error('- ' + message);
  process.exit(1);
}

console.log('POLITICAL_MAYHEM_STATE_TERRITORY_ROSTER_INTEGRITY_PASS', `jurisdictions=${completed.length}`, `players=${data.coverage.completed_player_count}`);
