import fs from 'node:fs';

const PIPELINE='data/political-information-ingestion-pipeline.json';
const SOURCES='data/forward-signal-source-registry.json';
const DETAILS='data/runtime/source-detail-snapshots.json';
const AREAS='data/runtime/area-evidence-records.json';
const COVERAGE='data/runtime/information-ingestion-coverage.json';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');

const pipeline=read(PIPELINE);
const registry=read(SOURCES);
const details=read(DETAILS);
const areaEvidence=read(AREAS);
const coverage=read(COVERAGE);
const jurisdictions=['AUS-FED','AUS-NSW','AUS-VIC','AUS-QLD','AUS-WA','AUS-SA','AUS-TAS','AUS-ACT','AUS-NT'];
const detailModes=new Set(pipeline.detail_capable_capture_modes||[]);
const activeSources=(registry.sources||[]).filter(x=>x.active);
const cells=[];
const gaps=[];
const now=new Date().toISOString();

for(const jurisdictionId of jurisdictions){
  const jurisdictionSources=activeSources.filter(x=>x.jurisdiction_id===jurisdictionId);
  for(const area of pipeline.areas||[]){
    const requirements=area.source_path_requirements||{};
    const groups=requirements.required_source_groups||[];
    const groupStates=groups.map(options=>{
      const matches=jurisdictionSources.filter(source=>options.includes(source.source_class));
      return {options,matches:matches.map(x=>x.watch_id),satisfied:matches.length>0};
    });
    const sourcePathComplete=groupStates.every(x=>x.satisfied);
    const relevantClasses=new Set([...(area.high_value_sources||[]),...groups.flat()]);
    const relevantSources=jurisdictionSources.filter(x=>relevantClasses.has(x.source_class));
    const detailCapable=relevantSources.filter(x=>detailModes.has(x.capture_mode));
    const evidenceRows=(areaEvidence.records||[]).filter(x=>x.jurisdiction_id===jurisdictionId&&x.competition_class===area.competition_class);
    const detailRows=(details.records||[]).filter(x=>x.jurisdiction_id===jurisdictionId);
    const missingGroups=groupStates.filter(x=>!x.satisfied).map(x=>x.options);
    let state='SUBSTANTIVE_EVIDENCE_ACTIVE';
    if(!sourcePathComplete) state='SOURCE_PATH_GAP';
    else if(requirements.automated_record_detail_path_required&&detailCapable.length===0) state='NO_AUTOMATED_DETAIL_PATH';
    else if(evidenceRows.length===0) state='INGESTION_PATH_READY_NO_SUBSTANTIVE_EVIDENCE';
    const cell={
      jurisdiction_id:jurisdictionId,
      competition_class:area.competition_class,
      state,
      configured_source_count:jurisdictionSources.length,
      relevant_source_count:relevantSources.length,
      detail_capable_source_count:detailCapable.length,
      detail_records_in_jurisdiction:detailRows.length,
      substantive_area_evidence_count:evidenceRows.length,
      required_source_groups:groupStates,
      missing_source_groups:missingGroups,
      relevant_watch_ids:relevantSources.map(x=>x.watch_id),
      detail_capable_watch_ids:detailCapable.map(x=>x.watch_id)
    };
    cells.push(cell);
    if(state!=='SUBSTANTIVE_EVIDENCE_ACTIVE'){
      gaps.push({
        jurisdiction_id:jurisdictionId,
        competition_class:area.competition_class,
        state,
        missing_source_groups:missingGroups,
        detail_capable_source_count:detailCapable.length,
        substantive_area_evidence_count:evidenceRows.length
      });
    }
  }
}

coverage.updated_at=now;
coverage.cells=cells;
coverage.gaps=gaps;
coverage.summary={
  jurisdictions:jurisdictions.length,
  competition_areas:(pipeline.areas||[]).length,
  total_cells:cells.length,
  substantive_evidence_active:cells.filter(x=>x.state==='SUBSTANTIVE_EVIDENCE_ACTIVE').length,
  ingestion_path_ready_no_substantive_evidence:cells.filter(x=>x.state==='INGESTION_PATH_READY_NO_SUBSTANTIVE_EVIDENCE').length,
  no_automated_detail_path:cells.filter(x=>x.state==='NO_AUTOMATED_DETAIL_PATH').length,
  source_path_gaps:cells.filter(x=>x.state==='SOURCE_PATH_GAP').length
};
write(COVERAGE,coverage);
console.log('POLITICAL_MAYHEM_INFORMATION_INGESTION_COVERAGE_OK',JSON.stringify(coverage.summary));
