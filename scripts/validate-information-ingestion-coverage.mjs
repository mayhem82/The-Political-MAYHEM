import fs from 'node:fs';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const fail=[];
const assert=(ok,msg)=>{if(!ok) fail.push(msg)};
const unique=xs=>new Set(xs).size===xs.length;

const pipeline=read('data/political-information-ingestion-pipeline.json');
const coverage=read('data/runtime/information-ingestion-coverage.json');
const areas=read('data/runtime/area-evidence-records.json');
const jurisdictions=['AUS-FED','AUS-NSW','AUS-VIC','AUS-QLD','AUS-WA','AUS-SA','AUS-TAS','AUS-ACT','AUS-NT'];
const classes=(pipeline.areas||[]).map(x=>x.competition_class);
const states=new Set(['SOURCE_PATH_GAP','NO_AUTOMATED_DETAIL_PATH','INGESTION_PATH_READY_NO_SUBSTANTIVE_EVIDENCE','SUBSTANTIVE_EVIDENCE_ACTIVE']);

assert(coverage.status==='ACTIVE','information ingestion coverage ledger is not ACTIVE');
assert(coverage.rules?.coverage_is_jurisdiction_by_competition_area===true,'coverage matrix rule missing');
assert(coverage.rules?.generic_jurisdiction_source_count_does_not_equal_area_coverage===true,'generic-source-count boundary missing');
assert(coverage.rules?.source_gap_is_not_interpreted_as_no_competition===true,'source-gap/no-competition boundary missing');

const cells=coverage.cells||[];
assert(cells.length===jurisdictions.length*classes.length,`coverage must contain ${jurisdictions.length*classes.length} cells, found ${cells.length}`);
const keys=cells.map(x=>`${x.jurisdiction_id}|${x.competition_class}`);
assert(unique(keys),'coverage contains duplicate jurisdiction/area cells');
for(const jurisdiction of jurisdictions) for(const cls of classes) assert(keys.includes(`${jurisdiction}|${cls}`),`coverage missing ${jurisdiction}|${cls}`);

const activeAreaRows=(areas.records||[]).filter(x=>x.routing_state==='SUBSTANTIVE_CONTENT_ROUTED');
for(const cell of cells){
  assert(jurisdictions.includes(cell.jurisdiction_id),`unknown coverage jurisdiction ${cell.jurisdiction_id}`);
  assert(classes.includes(cell.competition_class),`${cell.jurisdiction_id}: unknown competition class ${cell.competition_class}`);
  assert(states.has(cell.state),`${cell.jurisdiction_id}|${cell.competition_class}: invalid state ${cell.state}`);
  assert(Number.isInteger(cell.configured_source_count)&&cell.configured_source_count>=0,`${cell.jurisdiction_id}|${cell.competition_class}: configured_source_count invalid`);
  assert(Number.isInteger(cell.relevant_source_count)&&cell.relevant_source_count>=0,`${cell.jurisdiction_id}|${cell.competition_class}: relevant_source_count invalid`);
  assert(Number.isInteger(cell.detail_capable_source_count)&&cell.detail_capable_source_count>=0,`${cell.jurisdiction_id}|${cell.competition_class}: detail_capable_source_count invalid`);
  assert(Array.isArray(cell.required_source_groups)&&cell.required_source_groups.length>0,`${cell.jurisdiction_id}|${cell.competition_class}: required_source_groups missing`);
  assert(Array.isArray(cell.missing_source_groups),`${cell.jurisdiction_id}|${cell.competition_class}: missing_source_groups missing`);
  const actualActive=activeAreaRows.filter(x=>x.jurisdiction_id===cell.jurisdiction_id&&x.competition_class===cell.competition_class).length;
  assert(cell.substantive_area_evidence_count===actualActive,`${cell.jurisdiction_id}|${cell.competition_class}: coverage says ${cell.substantive_area_evidence_count} active evidence rows but ledger has ${actualActive}`);
  if(cell.state==='SOURCE_PATH_GAP') assert(cell.missing_source_groups.length>0,`${cell.jurisdiction_id}|${cell.competition_class}: SOURCE_PATH_GAP without missing source group`);
  if(cell.state==='NO_AUTOMATED_DETAIL_PATH'){
    assert(cell.missing_source_groups.length===0,`${cell.jurisdiction_id}|${cell.competition_class}: detail-path gap also has unresolved source group`);
    assert(cell.detail_capable_source_count===0,`${cell.jurisdiction_id}|${cell.competition_class}: NO_AUTOMATED_DETAIL_PATH but detail-capable source exists`);
  }
  if(cell.state==='INGESTION_PATH_READY_NO_SUBSTANTIVE_EVIDENCE'){
    assert(cell.missing_source_groups.length===0,`${cell.jurisdiction_id}|${cell.competition_class}: ready state has source gap`);
    assert(cell.detail_capable_source_count>0,`${cell.jurisdiction_id}|${cell.competition_class}: ready state has no detail-capable source`);
    assert(actualActive===0,`${cell.jurisdiction_id}|${cell.competition_class}: ready-no-evidence state has active evidence`);
  }
  if(cell.state==='SUBSTANTIVE_EVIDENCE_ACTIVE'){
    assert(cell.missing_source_groups.length===0,`${cell.jurisdiction_id}|${cell.competition_class}: active evidence state has source gap`);
    assert(cell.detail_capable_source_count>0,`${cell.jurisdiction_id}|${cell.competition_class}: active evidence state has no detail-capable source`);
    assert(actualActive>0,`${cell.jurisdiction_id}|${cell.competition_class}: active state has no active evidence`);
  }
}

const gaps=coverage.gaps||[];
const expectedGapKeys=new Set(cells.filter(x=>x.state!=='SUBSTANTIVE_EVIDENCE_ACTIVE').map(x=>`${x.jurisdiction_id}|${x.competition_class}`));
const actualGapKeys=new Set(gaps.map(x=>`${x.jurisdiction_id}|${x.competition_class}`));
assert(expectedGapKeys.size===actualGapKeys.size&&[...expectedGapKeys].every(x=>actualGapKeys.has(x)),'coverage gap list does not match non-active cells');

if(fail.length){
  console.error('POLITICAL_MAYHEM_INFORMATION_INGESTION_COVERAGE_FAILED');
  for(const msg of fail) console.error('- '+msg);
  process.exit(1);
}
console.log('POLITICAL_MAYHEM_INFORMATION_INGESTION_COVERAGE_PASS',`cells=${cells.length}`,`active=${cells.filter(x=>x.state==='SUBSTANTIVE_EVIDENCE_ACTIVE').length}`,`gaps=${gaps.length}`);
