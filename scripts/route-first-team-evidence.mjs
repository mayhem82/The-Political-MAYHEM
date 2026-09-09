import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const firstTeam=require('../engine/first-team.js');

const DETAILS='data/runtime/source-detail-snapshots.json';
const CLAIMS='data/runtime/first-team-claim-register.json';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const sha=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
const compact=s=>String(s??'').replace(/\s+/g,' ').trim();

function sentenceCandidates(text){
  return compact(text).split(/(?<=[.!?])\s+/).filter(Boolean);
}

function detectClaimSentences(record){
  const phrases=/\b(australians want|ordinary australians|the people have spoken|will of the people|public interest|we have a mandate|mandate from the people)\b/i;
  return sentenceCandidates(record.body_text||'').filter(s=>phrases.test(s));
}

const details=read(DETAILS);
const claims=read(CLAIMS);
claims.records ||= [];
const existing=new Set(claims.records.map(x=>x.claim_id));
let added=0;

for(const record of details.records||[]){
  for(const claimText of detectClaimSentences(record)){
    const claimClass=firstTeam.classifyPublicEvidence({claim_text:claimText});
    if(claimClass!=='POLITICAL_REPRESENTATION_CLAIM') continue;
    const claimId=`FTCLAIM-${sha(`${record.detail_version_id}|${claimText}`).slice(0,24)}`;
    if(existing.has(claimId)) continue;
    const row={
      claim_id:claimId,
      claim_text:claimText,
      speaker_or_source:record.resolved_title||record.record_title||record.source_id||'UNKNOWN_SOURCE',
      claim_time:record.published_at||record.captured_at,
      claim_class:claimClass,
      jurisdiction:record.jurisdiction_id||'UNKNOWN',
      population_scope:'CLAIMED_SCOPE_NOT_AUTOMATICALLY_VERIFIED',
      evidence_state:'VERIFIED_CLAIM_EXISTENCE',
      source_lineage:{
        detail_version_id:record.detail_version_id,
        detail_record_id:record.detail_record_id,
        source_id:record.source_id,
        source_snapshot_id:record.source_snapshot_id,
        source_change_event_id:record.source_change_event_id,
        review_id:record.review_id,
        record_url:record.record_url,
        captured_at:record.captured_at
      },
      first_team_effect:firstTeam.defaultFirstTeamEffect(claimClass),
      interpretation_state:'CLAIM_ONLY_NOT_FIRST_TEAM_STATE'
    };
    firstTeam.validateClaimRecord(row);
    claims.records.push(row);
    existing.add(claimId);
    added++;
  }
}

claims.generated_at=new Date().toISOString();
claims.status=claims.records.length?'ACTIVE_APPEND_ONLY':'ACTIVE_APPEND_ONLY_EMPTY';
write(CLAIMS,claims);
console.log('POLITICAL_MAYHEM_FIRST_TEAM_ROUTE_OK',`added=${added}`,`total=${claims.records.length}`);
