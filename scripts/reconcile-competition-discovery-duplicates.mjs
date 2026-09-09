import fs from 'node:fs';

const PATH='data/runtime/competition-discovery-candidates.json';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const uniq=xs=>[...new Set(xs.filter(Boolean))];
const validTime=v=>Number.isFinite(Date.parse(v));

const ledger=read(PATH);
ledger.candidates ||= [];
const now=new Date().toISOString();
const active=c=>c.candidate_state!=='REJECTED_NOT_COMPETITION';
const rank=c=>c.candidate_state==='REGISTERED'?0:1;
const compare=(a,b)=>rank(a)-rank(b)||(validTime(a.detected_at)?Date.parse(a.detected_at):Number.MAX_SAFE_INTEGER)-(validTime(b.detected_at)?Date.parse(b.detected_at):Number.MAX_SAFE_INTEGER)||String(a.candidate_id).localeCompare(String(b.candidate_id));

const byAreaFamily=new Map();
for(const candidate of ledger.candidates){
  if(!active(candidate)) continue;
  for(const areaId of uniq(candidate.area_evidence_ids||[])){
    const key=`${candidate.competition_family}|${areaId}`;
    if(!byAreaFamily.has(key)) byAreaFamily.set(key,[]);
    byAreaFamily.get(key).push(candidate);
  }
}

let rejected=0;
for(const [key,group] of byAreaFamily){
  if(group.length<2) continue;
  const [canonical,...others]=[...group].sort(compare);
  const canonicalAreas=new Set(canonical.area_evidence_ids||[]);
  for(const duplicate of others){
    if(!active(duplicate)) continue;
    const duplicateAreas=uniq(duplicate.area_evidence_ids||[]);
    if(duplicateAreas.length===0||!duplicateAreas.every(areaId=>canonicalAreas.has(areaId))) continue;
    const from=duplicate.candidate_state;
    duplicate.candidate_state='REJECTED_NOT_COMPETITION';
    duplicate.duplicate_of_candidate_id=canonical.candidate_id;
    duplicate.registration_blockers=uniq([...(duplicate.registration_blockers||[]),'DUPLICATE_SUBSTANTIVE_CANDIDATE_REPRESENTATION']);
    duplicate.evidence_summary=`Retained duplicate discovery representation. Its substantive area lineage is already represented by canonical candidate ${canonical.candidate_id}; this record is not a distinct Political MAYHEM competition.`;
    duplicate.state_history ||= [];
    duplicate.state_history.push({from,to:'REJECTED_NOT_COMPETITION',at:now,reason:'DUPLICATE_SUBSTANTIVE_CANDIDATE_REPRESENTATION_RECONCILED'});
    rejected++;
  }
}

ledger.last_duplicate_reconciliation_at=now;
ledger.last_duplicate_reconciliation={rejected,active_area_family_keys:[...byAreaFamily.keys()].length};
write(PATH,ledger);
console.log('POLITICAL_MAYHEM_COMPETITION_DISCOVERY_DUPLICATE_RECONCILIATION_OK',`rejected=${rejected}`,`areaFamilyKeys=${byAreaFamily.size}`);
