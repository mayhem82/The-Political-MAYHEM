import fs from 'node:fs';

const COVERAGE='data/runtime/information-ingestion-coverage.json';
const QUEUE='data/runtime/information-ingestion-source-queue.json';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');

const coverage=read(COVERAGE);
const queue=read(QUEUE);
const priority={SOURCE_PATH_GAP:1,NO_AUTOMATED_DETAIL_PATH:2,INGESTION_PATH_READY_NO_SUBSTANTIVE_EVIDENCE:3};
const actionFor=cell=>{
  if(cell.state==='SOURCE_PATH_GAP') return 'ADD_MISSING_SOURCE_CLASS_WATCH';
  if(cell.state==='NO_AUTOMATED_DETAIL_PATH') return 'ADD_OR_UPGRADE_DETAIL_CAPABLE_SOURCE';
  return 'BACKFILL_AVAILABLE_RECORDS_OR_WAIT_FOR_NEW_SUBSTANTIVE_RECORD';
};
const reasonFor=cell=>{
  if(cell.state==='SOURCE_PATH_GAP') return `Missing required source group(s): ${(cell.missing_source_groups||[]).map(g=>g.join(' OR ')).join('; ')}`;
  if(cell.state==='NO_AUTOMATED_DETAIL_PATH') return 'Required source classes exist, but none exposes an automated record-detail path.';
  return 'Source path and detail path exist, but no active substantive area evidence has yet been ingested.';
};

const items=(coverage.cells||[])
  .filter(cell=>cell.state!=='SUBSTANTIVE_EVIDENCE_ACTIVE')
  .map(cell=>({
    queue_id:`INGEST-${cell.jurisdiction_id}-${cell.competition_class}`,
    priority:priority[cell.state]||9,
    jurisdiction_id:cell.jurisdiction_id,
    competition_class:cell.competition_class,
    coverage_state:cell.state,
    action:actionFor(cell),
    reason:reasonFor(cell),
    missing_source_groups:cell.missing_source_groups||[],
    existing_relevant_watch_ids:cell.relevant_watch_ids||[],
    existing_detail_capable_watch_ids:cell.detail_capable_watch_ids||[],
    substantive_area_evidence_count:cell.substantive_area_evidence_count||0,
    completion_condition:'Coverage cell reaches SUBSTANTIVE_EVIDENCE_ACTIVE with retained substantive-detail lineage.',
    state:'OPEN'
  }))
  .sort((a,b)=>a.priority-b.priority||a.jurisdiction_id.localeCompare(b.jurisdiction_id)||a.competition_class.localeCompare(b.competition_class));

queue.updated_at=new Date().toISOString();
queue.items=items;
queue.summary={
  open_items:items.length,
  add_missing_source_class_watch:items.filter(x=>x.action==='ADD_MISSING_SOURCE_CLASS_WATCH').length,
  add_or_upgrade_detail_capable_source:items.filter(x=>x.action==='ADD_OR_UPGRADE_DETAIL_CAPABLE_SOURCE').length,
  backfill_or_wait:items.filter(x=>x.action==='BACKFILL_AVAILABLE_RECORDS_OR_WAIT_FOR_NEW_SUBSTANTIVE_RECORD').length,
  active_cells_not_queued:(coverage.cells||[]).filter(x=>x.state==='SUBSTANTIVE_EVIDENCE_ACTIVE').length
};
write(QUEUE,queue);
console.log('POLITICAL_MAYHEM_INFORMATION_SOURCE_QUEUE_OK',JSON.stringify(queue.summary));
