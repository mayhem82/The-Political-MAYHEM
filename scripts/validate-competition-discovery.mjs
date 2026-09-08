import fs from 'node:fs';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const fail=[];
const assert=(condition,message)=>{if(!condition)fail.push(message)};
const unique=values=>new Set(values).size===values.length;
const validTime=value=>Number.isFinite(Date.parse(value));

const ledger=read('data/runtime/competition-discovery-candidates.json');
const classes=read('data/political-competition-class-registry.json');
const cycleClasses=read('data/political-cycle-class-registry.json');
const cycles=read('data/runtime/political-cycles.json');
const contests=read('data/runtime/political-contests.json');
const snapshots=read('data/runtime/source-snapshots.json');
const events=read('data/runtime/intelligence-events.json');
const reviews=read('data/runtime/signal-reviews.json');

const jurisdictions=['AUS-FED','AUS-NSW','AUS-VIC','AUS-QLD','AUS-WA','AUS-SA','AUS-TAS','AUS-ACT','AUS-NT'];
const jurisdictionSet=new Set(jurisdictions);
const requiredRules=[
  'source_activity_is_not_automatically_a_competition',
  'empty_registered_contest_ledger_does_not_mean_quiet',
  'candidate_is_not_a_registered_contest',
  'discovery_is_forward_only',
  'candidate_requires_source_lineage',
  'candidate_requires_reviewed_or_verified_signal',
  'promotion_requires_registered_competition_class',
  'promotion_requires_registered_cycle',
  'promotion_requires_class_threshold_evidence',
  'rejection_is_retained',
  'cross_jurisdiction_inference_is_prohibited',
  'all_nine_fields_must_record_screening_state'
];

assert(ledger.status==='ACTIVE','competition discovery ledger is not ACTIVE');
assert(ledger.scope==='ALL_NINE_POLITICAL_FIELDS','competition discovery scope is not all nine political fields');
for(const rule of requiredRules) assert(ledger.rules?.[rule]===true,`competition discovery invariant missing: ${rule}`);

const candidateStates=new Set(ledger.candidate_states||[]);
for(const state of ['REVIEW_REQUIRED','EVIDENCE_GAP','ELIGIBLE_FOR_REGISTRATION','REGISTERED','REJECTED_NOT_COMPETITION']) assert(candidateStates.has(state),`candidate state missing: ${state}`);
const screeningStates=new Set(ledger.screening_states||[]);
for(const state of ['NOT_YET_SCREENED','SCREENED']) assert(screeningStates.has(state),`screening state missing: ${state}`);
const families=new Set(ledger.competition_families||[]);
for(const family of ['ELECTION','LEGISLATION','LEADERSHIP','CONFIDENCE_SUPPLY','BUDGET','PROCEDURAL','POLICY_ENACTMENT']) assert(families.has(family),`competition family missing: ${family}`);

const screening=ledger.jurisdiction_screening||[];
assert(screening.length===9,`jurisdiction screening must contain exactly 9 records, found ${screening.length}`);
assert(unique(screening.map(x=>x.jurisdiction_id)),'jurisdiction screening contains duplicate jurisdiction IDs');
for(const jurisdiction of jurisdictions) assert(screening.some(x=>x.jurisdiction_id===jurisdiction),`jurisdiction screening missing ${jurisdiction}`);
for(const row of screening){
  assert(jurisdictionSet.has(row.jurisdiction_id),`unknown jurisdiction screening record ${row.jurisdiction_id}`);
  assert(screeningStates.has(row.screening_state),`${row.jurisdiction_id}: invalid screening_state`);
  assert(Number.isInteger(row.signals_examined)&&row.signals_examined>=0,`${row.jurisdiction_id}: signals_examined invalid`);
  assert(Number.isInteger(row.candidates_detected)&&row.candidates_detected>=0,`${row.jurisdiction_id}: candidates_detected invalid`);
  if(row.screening_state==='SCREENED') assert(validTime(row.last_screened_at),`${row.jurisdiction_id}: SCREENED without valid last_screened_at`);
  if(row.screening_state==='NOT_YET_SCREENED') assert(row.last_screened_at===null,`${row.jurisdiction_id}: NOT_YET_SCREENED must have null last_screened_at`);
}

const classById=new Map((classes.classes||[]).map(x=>[x.competition_class,x]));
const cycleClassById=new Map((cycleClasses.classes||[]).map(x=>[x.cycle_class,x]));
const cycleById=new Map((cycles.cycles||[]).map(x=>[x.cycle_id,x]));
const contestById=new Map((contests.contests||[]).map(x=>[x.contest_id,x]));
const snapshotIds=new Set((snapshots.snapshots||[]).map(x=>x.snapshot_id));
const eventById=new Map((events.events||[]).map(x=>[x.event_id,x]));
const reviewById=new Map((reviews.reviews||[]).map(x=>[x.review_id,x]));
const candidates=ledger.candidates||[];
assert(unique(candidates.map(x=>x.candidate_id)),'competition discovery candidate IDs are not unique');

const familyClassExpectation={ELECTION:'ELECTORAL',LEGISLATION:'LEGISLATIVE'};

for(const candidate of candidates){
  assert(Boolean(candidate.candidate_id),'competition discovery candidate missing candidate_id');
  assert(jurisdictionSet.has(candidate.jurisdiction_id),`${candidate.candidate_id}: invalid jurisdiction ${candidate.jurisdiction_id}`);
  assert(families.has(candidate.competition_family),`${candidate.candidate_id}: invalid competition_family`);
  assert(typeof candidate.subject==='string'&&candidate.subject.trim().length>0,`${candidate.candidate_id}: subject missing`);
  assert(candidateStates.has(candidate.candidate_state),`${candidate.candidate_id}: invalid candidate_state`);
  assert(validTime(candidate.detected_at),`${candidate.candidate_id}: detected_at invalid`);

  const proposedClass=candidate.proposed_competition_class;
  if(proposedClass!==null){
    assert(classById.has(proposedClass),`${candidate.candidate_id}: proposed class ${proposedClass} is not registered`);
    const expected=familyClassExpectation[candidate.competition_family];
    if(expected) assert(proposedClass===expected,`${candidate.candidate_id}: ${candidate.competition_family} must propose ${expected}`);
  }

  const proposedCycle=candidate.proposed_cycle_id;
  if(proposedCycle!==null){
    const cycle=cycleById.get(proposedCycle);
    assert(Boolean(cycle),`${candidate.candidate_id}: proposed cycle ${proposedCycle} is not registered`);
    if(cycle&&proposedClass){
      const cycleClass=cycleClassById.get(cycle.cycle_class);
      assert(new Set(cycleClass?.allowed_competition_classes||[]).has(proposedClass),`${candidate.candidate_id}: proposed class ${proposedClass} incompatible with cycle ${proposedCycle}`);
    }
  }

  const refs=Array.isArray(candidate.source_snapshot_ids)?candidate.source_snapshot_ids:[];
  assert(refs.length>0,`${candidate.candidate_id}: source_snapshot_ids required`);
  assert(unique(refs),`${candidate.candidate_id}: duplicate source_snapshot_ids`);
  for(const ref of refs) assert(snapshotIds.has(ref),`${candidate.candidate_id}: unknown source snapshot ${ref}`);

  const signalIds=Array.isArray(candidate.signal_event_ids)?candidate.signal_event_ids:[];
  assert(signalIds.length>0,`${candidate.candidate_id}: signal_event_ids required`);
  assert(unique(signalIds),`${candidate.candidate_id}: duplicate signal_event_ids`);
  for(const eventId of signalIds){
    const event=eventById.get(eventId);
    assert(Boolean(event),`${candidate.candidate_id}: unknown signal event ${eventId}`);
    if(!event) continue;
    assert(event.event_type!=='SOURCE_CHANGED',`${candidate.candidate_id}: raw SOURCE_CHANGED event cannot create a competition candidate`);
    assert(event.jurisdiction_id===candidate.jurisdiction_id,`${candidate.candidate_id}: cross-jurisdiction signal ${eventId}`);
    const reviewedOrVerified=event.evidence_state==='VERIFIED'||event.semantic_review_state==='PROMOTED'||event.signal_state==='CONFIRMED_FACT';
    assert(reviewedOrVerified,`${candidate.candidate_id}: signal ${eventId} is neither reviewed nor verified`);
    if(event.source_snapshot_id) assert(refs.includes(event.source_snapshot_id),`${candidate.candidate_id}: signal ${eventId} source snapshot missing from candidate lineage`);
  }

  const reviewIds=Array.isArray(candidate.review_ids)?candidate.review_ids:[];
  assert(unique(reviewIds),`${candidate.candidate_id}: duplicate review_ids`);
  for(const reviewId of reviewIds){
    const review=reviewById.get(reviewId);
    assert(Boolean(review),`${candidate.candidate_id}: unknown review ${reviewId}`);
    if(review?.signal_event_id) assert(signalIds.includes(review.signal_event_id),`${candidate.candidate_id}: review ${reviewId} signal not in candidate signal_event_ids`);
  }

  assert(typeof candidate.evidence_summary==='string'&&candidate.evidence_summary.trim().length>0,`${candidate.candidate_id}: evidence_summary missing`);
  const blockers=Array.isArray(candidate.registration_blockers)?candidate.registration_blockers:[];
  assert(unique(blockers),`${candidate.candidate_id}: duplicate registration blockers`);
  assert(Array.isArray(candidate.state_history)&&candidate.state_history.length>0,`${candidate.candidate_id}: state_history required`);

  if(candidate.candidate_state==='ELIGIBLE_FOR_REGISTRATION'){
    assert(Boolean(proposedClass),`${candidate.candidate_id}: eligible candidate lacks proposed competition class`);
    assert(Boolean(proposedCycle),`${candidate.candidate_id}: eligible candidate lacks proposed cycle`);
    assert(blockers.length===0,`${candidate.candidate_id}: eligible candidate still has registration blockers`);
    assert(candidate.linked_contest_id===null,`${candidate.candidate_id}: eligible candidate already linked to contest`);
  }

  if(candidate.candidate_state==='REGISTERED'){
    const contest=contestById.get(candidate.linked_contest_id);
    assert(Boolean(contest),`${candidate.candidate_id}: REGISTERED candidate lacks valid linked contest`);
    if(contest){
      assert(contest.jurisdiction===candidate.jurisdiction_id||contest.jurisdiction_id===candidate.jurisdiction_id,`${candidate.candidate_id}: linked contest jurisdiction mismatch`);
      if(proposedClass) assert(contest.competition_class===proposedClass,`${candidate.candidate_id}: linked contest class mismatch`);
      if(proposedCycle) assert(contest.cycle_id===proposedCycle,`${candidate.candidate_id}: linked contest cycle mismatch`);
      assert(refs.some(ref=>(contest.source_refs||[]).includes(ref)),`${candidate.candidate_id}: linked contest has no shared source lineage`);
    }
  }else{
    assert(candidate.linked_contest_id===null,`${candidate.candidate_id}: unregistered candidate must not have linked_contest_id`);
  }

  if(['REVIEW_REQUIRED','EVIDENCE_GAP','REJECTED_NOT_COMPETITION'].includes(candidate.candidate_state)) assert(blockers.length>0,`${candidate.candidate_id}: ${candidate.candidate_state} requires a recorded blocker or reason`);
}

for(const row of screening){
  const actual=candidates.filter(x=>x.jurisdiction_id===row.jurisdiction_id).length;
  assert(row.candidates_detected===actual,`${row.jurisdiction_id}: candidates_detected=${row.candidates_detected} but ledger contains ${actual}`);
}

if(fail.length){
  console.error('POLITICAL_MAYHEM_COMPETITION_DISCOVERY_INTEGRITY_FAILED');
  for(const message of fail) console.error('- '+message);
  process.exit(1);
}
console.log('POLITICAL_MAYHEM_COMPETITION_DISCOVERY_INTEGRITY_PASS',`candidates=${candidates.length}`,`screened=${screening.filter(x=>x.screening_state==='SCREENED').length}/9`,`registered=${candidates.filter(x=>x.candidate_state==='REGISTERED').length}`);
