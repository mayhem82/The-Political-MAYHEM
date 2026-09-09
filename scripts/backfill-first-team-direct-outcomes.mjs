import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const firstTeam=require('../engine/first-team.js');

const HOUSE='data/runtime/federal-house-electoral-performance-v2.json';
const OUTCOMES='data/runtime/first-team-outcome-ledger.json';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const sha=s=>crypto.createHash('sha256').update(String(s)).digest('hex');

const house=read(HOUSE);
const ledger=read(OUTCOMES);
ledger.outcomes ||= [];
const existing=new Set(ledger.outcomes.map(x=>x.outcome_id));

const authoritative=(house.sources||[]).filter(x=>x.publisher==='Australian Electoral Commission'&&x.source_state==='PRIMARY_FINAL_RESULTS');
if(authoritative.length<2) throw new Error('FIRST_TEAM_BACKFILL_REQUIRES_AEC_FINAL_RESULTS');
if(!String(house.status||'').startsWith('COMPLETE_150_DIVISION_CONTEXT')) throw new Error('FIRST_TEAM_BACKFILL_REQUIRES_COMPLETE_150_DIVISION_CONTEXT');
if(!Array.isArray(house.division_results)||house.division_results.length!==150) throw new Error('FIRST_TEAM_BACKFILL_REQUIRES_150_DIVISIONS');

const outcomeId=`FTOUTCOME-${sha(`${house.snapshot_id}|2025 Federal Election|HOUSE`).slice(0,24)}`;
let added=0;
if(!existing.has(outcomeId)){
  const row={
    outcome_id:outcomeId,
    outcome_class:'ELECTION_RESULT',
    jurisdiction:'AUS-FED',
    decision_or_event_date:'2025-05-03',
    verified_result:'The 2025 federal election directly selected members for all 150 House of Representatives divisions. This record does not infer endorsement of any policy proposition beyond the electoral choices actually made.',
    population_scope:'Australian electors participating in the 2025 House of Representatives election, division by division',
    authoritative_source:true,
    authoritative_source_detail:authoritative.map(x=>({publisher:x.publisher,source_url:x.source_url,source_state:x.source_state,purpose:x.purpose})),
    source_lineage:{snapshot_id:house.snapshot_id,captured_at:house.captured_at,source_file:HOUSE},
    first_team_form_effect:'DIRECT_REPRESENTATIVE_SELECTION_RECORDED',
    mandate_expansion_prohibited:true
  };
  firstTeam.validateOutcomeRecord(row);
  ledger.outcomes.push(row);
  added=1;
}
ledger.generated_at=new Date().toISOString();
ledger.status=ledger.outcomes.length?'ACTIVE_APPEND_ONLY':'ACTIVE_APPEND_ONLY_EMPTY';
write(OUTCOMES,ledger);
console.log('POLITICAL_MAYHEM_FIRST_TEAM_BACKFILL_OK',`added=${added}`,`total=${ledger.outcomes.length}`);
