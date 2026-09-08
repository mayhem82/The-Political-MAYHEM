import fs from 'node:fs';

const REGISTRY='data/forward-signal-source-registry.json';
const POLICY='data/forward-signal-review-policy.json';
const EVENTS='data/runtime/intelligence-events.json';
const REVIEWS='data/runtime/signal-reviews.json';
const MANIFEST='data/runtime/forward-ingestion-manifest.json';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const compactTitle=s=>String(s??'').replace(/\s+/g,' ').trim();

const registry=read(REGISTRY);
const policy=read(POLICY);
const ledger=read(EVENTS);
const reviews=read(REVIEWS);
const manifest=read(MANIFEST);
ledger.events ||= [];
reviews.reviews ||= [];

const sourceById=new Map((registry.sources||[]).map(s=>[s.source_id,s]));
const existingReviewByChange=new Map(reviews.reviews.map(r=>[r.source_change_event_id,r]));
const existingEventIds=new Set(ledger.events.map(e=>e.event_id));
const now=new Date().toISOString();
let promoted=0;
let excluded=0;
let pendingUnstructured=0;

for(const change of ledger.events.filter(e=>e.event_type==='SOURCE_CHANGED')){
  if(existingReviewByChange.has(change.event_id)) continue;
  const source=sourceById.get(change.source_id);
  const policyId=source?.review_policy||change.review_policy||'REVIEW_UNSTRUCTURED_CHANGE';
  const delta=change.representation_delta||{};

  if(policyId!=='AUTO_PROMOTE_PUBLICATION_ADDITIONS'||delta.delta_type!=='STRUCTURED_RECORD_SET'){
    pendingUnstructured++;
    continue;
  }

  const added=Array.isArray(delta.records_added)?delta.records_added:[];
  const removed=Array.isArray(delta.records_removed)?delta.records_removed:[];
  const reviewId=`REV-${change.event_id}`;

  if(added.length){
    const signalEventId=`SIG-REV-${change.event_id}`;
    const titles=added.map(r=>compactTitle(r.title)).filter(Boolean);
    const preview=titles.slice(0,5).join('; ')+(titles.length>5?`; +${titles.length-5} more`: '');
    const claim=`${source?.name||change.source_id||'Monitored official source'} added ${added.length} structured publication record${added.length===1?'':'s'} to its forward-captured official index${preview?`: ${preview}`:'.'}`;
    const review={
      review_id:reviewId,
      source_change_event_id:change.event_id,
      decision:'PROMOTED_TO_SIGNAL',
      signal_event_id:signalEventId,
      contest_id:null,
      cycle_id:null,
      party_id:change.party_id??null,
      actor_id:change.actor_id??null,
      signal_state:'CONFIRMED_FACT',
      materiality_state:'UNKNOWN',
      claim,
      review_basis:'Deterministic structured-record comparison between consecutive forward snapshots. Promotion verifies only that the official monitored publication index added the listed record(s); it does not verify the substantive claims contained in those publications.',
      reviewed_at:now,
      reviewer_mode:'DETERMINISTIC_RULE',
      policy_id:policy.policy_id,
      policy_name:policyId,
      structured_evidence:{added_records:added,removed_records:removed,delta_hash:delta.delta_hash||null},
      integrity:{source_change_unchanged:true,review_append_only:true,no_projection_effect_by_default:true}
    };
    reviews.reviews.push(review);
    existingReviewByChange.set(change.event_id,review);

    if(!existingEventIds.has(signalEventId)){
      ledger.events.push({
        event_id:signalEventId,
        parent_event_id:change.event_id,
        review_id:reviewId,
        jurisdiction_id:change.jurisdiction_id,
        party_id:change.party_id??null,
        actor_id:change.actor_id??null,
        contest_id:null,
        cycle_id:null,
        source_snapshot_id:change.source_snapshot_id,
        record_id:added.length===1?(added[0].record_id||null):null,
        captured_at:now,
        event_date:change.event_date||null,
        checkpoint:'CONTINUOUS_FORWARD_SIGNAL_REVIEW',
        event_type:'SIGNAL_CREATED',
        evidence_state:'VERIFIED',
        signal_state:'CONFIRMED_FACT',
        semantic_review_state:'PROMOTED',
        materiality_state:'UNKNOWN',
        source_class:change.source_class,
        source_id:change.source_id,
        capture_mode:change.capture_mode||'PUBLICATION_FEED_HASH',
        claim,
        observed_behaviour:'One or more structured publication records appeared in the monitored official source index after the preceding forward snapshot.',
        publication_records_added:added,
        publication_records_removed:removed,
        inference:null,
        inference_class:'NONE',
        projection_effect:'NO_EFFECT',
        information_advantage:'NONE',
        frozen:false,
        integrity:{underlying_publication_claims_not_promoted_to_verified_fact:true,source_change_parent_retained:true,deterministic_review:true}
      });
      existingEventIds.add(signalEventId);
    }
    promoted++;
  }else if(removed.length){
    const review={
      review_id:reviewId,
      source_change_event_id:change.event_id,
      decision:'EXCLUDED_AS_NON_SIGNAL',
      signal_event_id:null,
      contest_id:null,
      cycle_id:null,
      party_id:change.party_id??null,
      actor_id:change.actor_id??null,
      signal_state:null,
      materiality_state:'IMMATERIAL',
      claim:'Structured publication-index change contained removals only. It is retained as a raw source change but is not automatically promoted into a political signal.',
      review_basis:'Deterministic review policy excludes removal-only index changes because disappearance from an index does not establish a political event, reversal or substantive fact.',
      reviewed_at:now,
      reviewer_mode:'DETERMINISTIC_RULE',
      policy_id:policy.policy_id,
      policy_name:policyId,
      structured_evidence:{added_records:[],removed_records:removed,delta_hash:delta.delta_hash||null},
      integrity:{source_change_unchanged:true,review_append_only:true,no_projection_effect_by_default:true}
    };
    reviews.reviews.push(review);
    existingReviewByChange.set(change.event_id,review);
    excluded++;
  }else{
    pendingUnstructured++;
  }
}

reviews.updated_at=now;
reviews.policy_id=policy.policy_id;
reviews.rules ||= {};
reviews.rules.deterministic_publication_addition_review_enabled=true;
reviews.rules.deterministic_review_verifies_publication_activity_not_underlying_claims=true;
ledger.captured_at=now;
const rawChanges=ledger.events.filter(e=>e.event_type==='SOURCE_CHANGED');
const reviewedIds=new Set(reviews.reviews.map(r=>r.source_change_event_id));
manifest.updated_at=now;
manifest.live_evidence_ingestion ||= {};
manifest.live_evidence_ingestion.intelligence_events_ingested=ledger.events.length;
manifest.live_evidence_ingestion.source_changes_ingested=rawChanges.length;
manifest.live_evidence_ingestion.signals_ingested=ledger.events.filter(e=>e.event_type==='SIGNAL_CREATED').length;
manifest.live_evidence_ingestion.signal_reviews_ingested=reviews.reviews.length;
manifest.live_evidence_ingestion.pending_signal_reviews=rawChanges.filter(e=>!reviewedIds.has(e.event_id)).length;
manifest.live_evidence_ingestion.deterministic_publication_signals=ledger.events.filter(e=>e.event_type==='SIGNAL_CREATED'&&e.integrity?.deterministic_review===true).length;
manifest.status='LIVE_INGESTION_ACTIVE_STRUCTURED_CAPTURE_AND_DETERMINISTIC_SIGNAL_REVIEW';
write(EVENTS,ledger);
write(REVIEWS,reviews);
write(MANIFEST,manifest);
console.log(`FORWARD_SIGNAL_REVIEW_OK promoted=${promoted} excluded=${excluded} total_reviews=${reviews.reviews.length} total_signals=${ledger.events.filter(e=>e.event_type==='SIGNAL_CREATED').length} pending=${manifest.live_evidence_ingestion.pending_signal_reviews} unstructured_pending_seen=${pendingUnstructured}`);
