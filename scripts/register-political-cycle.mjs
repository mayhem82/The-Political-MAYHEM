import fs from 'node:fs';

const inputPath = process.argv[2];
if (!inputPath) throw new Error('usage: node scripts/register-political-cycle.mjs <cycle-input.json>');
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
const validTime = (v, label) => { const n=Date.parse(v); if(!Number.isFinite(n)) throw new Error(`${label} must be a valid date-time`); return n; };
const validDate = (v, label) => { if(v==null) return null; if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(`${v}T00:00:00Z`))) throw new Error(`${label} must be YYYY-MM-DD`); return v; };

const ledgerPath='data/runtime/political-cycles.json';
const snapshotsPath='data/runtime/source-snapshots.json';
const ledger=read(ledgerPath);
const snapshots=new Map((read(snapshotsPath).snapshots||[]).map(x=>[x.snapshot_id,x]));
const input=read(inputPath);
const now=new Date().toISOString();

if(!input.cycle_id) throw new Error('cycle_id is required');
if((ledger.cycles||[]).some(x=>x.cycle_id===input.cycle_id)) throw new Error(`cycle_id already exists: ${input.cycle_id}`);
if(!input.jurisdiction) throw new Error('jurisdiction is required');
if(!input.cycle_type) throw new Error('cycle_type is required');
const status=input.status||'ACTIVE';
if(!['PLANNED','ACTIVE'].includes(status)) throw new Error('new cycle status must be PLANNED or ACTIVE');
validDate(input.start_date??null,'start_date'); validDate(input.end_date??null,'end_date');
if(input.start_date&&input.end_date&&input.end_date<input.start_date) throw new Error('end_date cannot precede start_date');
if(!Array.isArray(input.source_snapshot_ids)||input.source_snapshot_ids.length===0) throw new Error('source_snapshot_ids is required');
for(const id of input.source_snapshot_ids){ const s=snapshots.get(id); if(!s) throw new Error(`unknown source snapshot ${id}`); if(validTime(s.captured_at,`${id}.captured_at`)>Date.now()) throw new Error(`source snapshot ${id} has future captured_at`); }

const cycle={
  cycle_id:input.cycle_id,
  jurisdiction:input.jurisdiction,
  cycle_type:input.cycle_type,
  name:input.name||input.cycle_id,
  status,
  start_date:input.start_date??null,
  end_date:input.end_date??null,
  contest_ids:[],
  source_refs:[...new Set(input.source_snapshot_ids)],
  created_at:now,
  updated_at:now,
  lifecycle_history:[{from:null,to:status,at:now,reason:'REGISTERED_FROM_CONTEMPORANEOUS_SOURCE_SNAPSHOTS'}]
};
ledger.cycles ||= [];
ledger.cycles.push(cycle);
ledger.updated_at=now;
write(ledgerPath,ledger);
console.log(`POLITICAL_CYCLE_REGISTERED ${cycle.cycle_id} status=${status} sources=${cycle.source_refs.length}`);
