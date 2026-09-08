import fs from 'node:fs';

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const fail = [];
const assert = (condition, message) => { if (!condition) fail.push(message); };
const unique = xs => new Set(xs).size === xs.length;

const data = read('data/runtime/state-territory-parliamentary-players.json');
const qld = read('data/runtime/queensland-parliamentary-players.json');
const competitions = read('data/runtime/political-competitions.json');
const manifest = read('data/runtime/forward-ingestion-manifest.json');

assert(data.rules?.jurisdictions_remain_distinct === true, 'jurisdiction separation rule missing');
assert(data.rules?.independents_are_standalone_players === true, 'standalone independent rule missing');
assert(data.rules?.no_synthetic_independent_team === true, 'synthetic-independent prohibition missing');

const baseCompleted = data.coverage?.completed_jurisdictions || [];
assert(baseCompleted.includes('AUS-ACT'), 'ACT not marked complete');
assert(baseCompleted.includes('AUS-NT'), 'NT not marked complete');
assert(data.coverage?.completed_player_count === 50, `ACT/NT player count expected 50, got ${data.coverage?.completed_player_count}`);

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

// Queensland uses a compact field-indexed player representation to keep the public runtime small.
assert(qld.competition_id === 'AUS-QLD', 'Queensland competition ID mismatch');
assert(qld.status === 'COMPLETE_CURRENT_PARLIAMENTARY_ROSTER', 'Queensland roster not marked complete');
assert(qld.source?.publisher === 'Queensland Parliament', 'Queensland primary source publisher mismatch');
assert(qld.source?.source_reported_total === 93, 'Queensland source-reported total expected 93');
assert(Array.isArray(qld.player_fields) && qld.player_fields.join('|') === 'actor_id|name|electorate|party_abbreviation', 'Queensland compact player fields changed');
const qldRows = qld.players || [];
assert(qldRows.length === 93, `Queensland player rows expected 93, got ${qldRows.length}`);
assert(unique(qldRows.map(r => r[0])), 'Queensland actor IDs are not unique');
const qldPartyCounts = qldRows.reduce((m,r)=>(m[r[3]]=(m[r[3]]||0)+1,m),{});
assert(qldPartyCounts.LNP === 53, `Queensland LNP expected 53, got ${qldPartyCounts.LNP}`);
assert(qldPartyCounts.ALP === 36, `Queensland Labor expected 36, got ${qldPartyCounts.ALP}`);
assert(qldPartyCounts.KAP === 2, `Queensland KAP expected 2, got ${qldPartyCounts.KAP}`);
assert(qldPartyCounts.GRN === 1, `Queensland Greens expected 1, got ${qldPartyCounts.GRN}`);
assert(qldPartyCounts.IND === 1, `Queensland independent expected 1, got ${qldPartyCounts.IND}`);
assert((qld.teams || []).reduce((n,t)=>n+Number(t.player_count||0),0) === 92, 'Queensland party team counts expected 92');
assert(!(qld.teams || []).some(t => /independent/i.test(t.name)), 'Queensland has synthetic Independent team');
assert(qld.integrity?.official_total_reconciled === true, 'Queensland total not reconciled');
assert(qld.integrity?.official_party_breakdown_reconciled === true, 'Queensland party breakdown not reconciled');
const qldCompetition = (competitions.competitions || []).find(c => c.competition_id === 'AUS-QLD');
assert(qldCompetition?.ingestion_state === 'CURRENT_PARLIAMENTARY_ROSTER_INGESTED', 'Queensland competition ingestion state mismatch');
assert(qldCompetition?.ingested_player_count === 93, 'Queensland competition player count mismatch');

assert(competitions.ingestion_progress?.state_territory_jurisdictions_with_complete_current_player_rosters === 3, 'competition progress expected 3/8 complete');
assert(competitions.ingestion_progress?.state_territory_players_ingested === 143, 'competition progress expected 143 state/territory players');
assert((competitions.ingestion_progress?.remaining_jurisdictions || []).length === 5, 'competition progress expected 5 remaining jurisdictions');
assert(manifest.structural_data_loaded?.state_and_territory_player_rosters === '3_OF_8_COMPLETE', 'ingestion manifest state/territory roster status mismatch');
assert(manifest.structural_data_loaded?.state_and_territory_players_ingested === 143, 'ingestion manifest state/territory player count mismatch');
assert((manifest.queues?.jurisdiction_ingestion || []).length === 5, 'remaining jurisdiction ingestion queue expected 5');
assert((manifest.queues?.jurisdiction_evidence_activation || []).includes('AUS-QLD'), 'Queensland evidence activation not queued');

const allCurrentIds=[...(data.jurisdictions||[]).flatMap(j=>(j.players||[]).map(p=>`${j.competition_id}:${p.actor_id}`)),...qldRows.map(r=>`AUS-QLD:${r[0]}`)];
assert(unique(allCurrentIds), 'state/territory jurisdiction-qualified actor IDs are not unique');

if (fail.length) {
  console.error('POLITICAL_MAYHEM_STATE_TERRITORY_ROSTER_INTEGRITY_FAILED');
  for (const message of fail) console.error('- ' + message);
  process.exit(1);
}

console.log('POLITICAL_MAYHEM_STATE_TERRITORY_ROSTER_INTEGRITY_PASS', 'jurisdictions=3', 'players=143', 'ACT=25', 'NT=25', 'QLD=93');
