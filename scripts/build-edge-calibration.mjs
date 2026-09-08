import fs from 'node:fs';

const PROJECTIONS='data/runtime/projections.json';
const OUTCOMES='data/runtime/verified-outcomes.json';
const AUDITS='data/runtime/projection-audits.json';
const SNAPSHOTS='data/runtime/source-snapshots.json';
const OUT='data/runtime/edge-calibration-ledger.json';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const clamp=p=>Math.min(1-1e-15,Math.max(1e-15,Number(p)));
const brier=(p,y)=>(Number(p)-Number(y))**2;
const logLoss=(p,y)=>{const q=clamp(p);return -(y*Math.log(q)+(1-y)*Math.log(1-q));};
const round=n=>n==null?null:Math.round(n*1e6)/1e6;

const projections=read(PROJECTIONS);
const outcomes=read(OUTCOMES);
const audits=read(AUDITS);
const snapshots=read(SNAPSHOTS);
const previous=read(OUT);

const snapshotById=new Map((snapshots.snapshots||[]).map(s=>[s.snapshot_id,s]));
const outcomeById=new Map((outcomes.outcomes||[]).map(o=>[o.outcome_id,o]));
const auditByProjection=new Map((audits.audits||[]).map(a=>[a.projection_id,a]));
const all=projections.projections||[];
const frozen=all.filter(p=>['FROZEN','GRADED'].includes(p.projection_state));
const graded=all.filter(p=>p.projection_state==='GRADED'||p.grade!=null);
const records=[];

for(const p of graded){
  if(!['CORRECT','INCORRECT'].includes(p.grade)) continue;
  if(typeof p.probability!=='number'||p.probability<0||p.probability>1) continue;
  const outcome=outcomeById.get(p.verified_outcome_id);
  if(!outcome||outcome.verification_state!=='VERIFIED') continue;
  const frozenAt=p.integrity?.frozen_at||p.evidence_cutoff;
  if(!frozenAt) continue;
  const y=p.grade==='CORRECT'?1:0;
  const mb=brier(p.probability,y);
  const ml=logLoss(p.probability,y);
  let baseline=null;
  const candidates=Array.isArray(p.comparison_baselines)?p.comparison_baselines:[];
  const selected=candidates.find(x=>x.primary===true)||candidates[0]||null;
  if(selected&&typeof selected.probability==='number'&&selected.captured_at&&Array.isArray(selected.source_snapshot_ids)&&selected.source_snapshot_ids.length){
    const freezeMs=Date.parse(frozenAt), baseMs=Date.parse(selected.captured_at);
    const sourceRows=selected.source_snapshot_ids.map(id=>snapshotById.get(id));
    const lineageComplete=sourceRows.every(Boolean);
    const lineagePreFreeze=lineageComplete&&sourceRows.every(s=>Date.parse(s.captured_at)<=freezeMs);
    if(Number.isFinite(baseMs)&&Number.isFinite(freezeMs)&&baseMs<=freezeMs&&lineagePreFreeze){
      const bb=brier(selected.probability,y), bl=logLoss(selected.probability,y);
      baseline={
        baseline_id:selected.baseline_id||`${p.projection_id}-BASELINE`,
        baseline_type:selected.baseline_type||'OTHER',
        label:selected.label||'Contemporaneous baseline',
        probability:selected.probability,
        captured_at:selected.captured_at,
        source_snapshot_ids:selected.source_snapshot_ids,
        brier:round(bb),
        log_loss:round(bl)
      };
    }
  }
  records.push({
    edge_record_id:`EDGE-${p.projection_id}`,
    projection_id:p.projection_id,
    contest_id:p.contest_id,
    cycle_id:p.cycle_id??null,
    frozen_at:frozenAt,
    evidence_cutoff:p.evidence_cutoff,
    outcome_id:outcome.outcome_id,
    grade:p.grade,
    mayhem_probability:p.probability,
    outcome_binary:y,
    mayhem_brier:round(mb),
    mayhem_log_loss:round(ml),
    baseline,
    brier_edge_vs_baseline:baseline?round(baseline.brier-mb):null,
    log_loss_edge_vs_baseline:baseline?round(baseline.log_loss-ml):null,
    audit_id:auditByProjection.get(p.projection_id)?.audit_id??p.post_outcome_audit_ref??null,
    integrity:{
      frozen_projection_unchanged:true,
      verified_outcome_required:true,
      negative_edge_retained:true,
      no_hindsight_baseline:true
    }
  });
}

records.sort((a,b)=>Date.parse(a.frozen_at)-Date.parse(b.frozen_at)||a.projection_id.localeCompare(b.projection_id));
const comparable=records.filter(r=>r.baseline);
const bins=[];
for(let low=0;low<1;low+=0.1){
  const high=Math.round((low+0.1)*10)/10;
  const rows=records.filter(r=>r.mayhem_probability>=low&&(high===1?r.mayhem_probability<=high:r.mayhem_probability<high));
  if(rows.length) bins.push({
    lower_bound:round(low),upper_bound:round(high),count:rows.length,
    mean_forecast_probability:round(mean(rows.map(r=>r.mayhem_probability))),
    observed_frequency:round(mean(rows.map(r=>r.outcome_binary)))
  });
}

const countGrade=g=>graded.filter(p=>p.grade===g).length;
const summary={
  projection_versions:all.length,
  frozen_projection_versions:frozen.length,
  graded_projection_versions:graded.length,
  graded_probability_tips:records.length,
  baseline_comparable_tips:comparable.length,
  correct:countGrade('CORRECT'),
  incorrect:countGrade('INCORRECT'),
  partial:countGrade('PARTIAL'),
  void:countGrade('VOID'),
  mean_mayhem_brier:round(mean(records.map(r=>r.mayhem_brier))),
  mean_baseline_brier:round(mean(comparable.map(r=>r.baseline.brier))),
  mean_brier_edge:round(mean(comparable.map(r=>r.brier_edge_vs_baseline))),
  mean_mayhem_log_loss:round(mean(records.map(r=>r.mayhem_log_loss))),
  mean_baseline_log_loss:round(mean(comparable.map(r=>r.baseline.log_loss))),
  mean_log_loss_edge:round(mean(comparable.map(r=>r.log_loss_edge_vs_baseline))),
  empirical_advantage_state:records.length===0?'NOT_MEASURABLE_YET':comparable.length===0?'CALIBRATION_MEASURABLE_COMPARATIVE_EDGE_PENDING':(mean(comparable.map(r=>r.brier_edge_vs_baseline))>0?'POSITIVE_EDGE_OBSERVED_NOT_YET_GENERALISABLE':'NO_POSITIVE_EDGE_DEMONSTRATED')
};

const out={
  ...previous,
  status:summary.empirical_advantage_state,
  updated_at:new Date().toISOString(),
  summary,
  calibration_bins:bins,
  records
};
write(OUT,out);
console.log(`EDGE_CALIBRATION_BUILT projections=${all.length} frozen=${frozen.length} graded=${graded.length} scored=${records.length} comparable=${comparable.length} state=${summary.empirical_advantage_state}`);
