# The Political MAYHEM — New Thread Bootstrap

Status: **ACTIVE REFERENCE**
Reference implementation: `mayhem82/TheNRLMAYHEM`
Target implementation: `mayhem82/The-Political-MAYHEM`

## Governing instruction

The Political MAYHEM is to be built as the political-domain duplicate of TheNRLMAYHEM.

Do not redesign the architecture from first principles. Read the NRL repository, reproduce its operating structure, data flow, provenance model, versioning discipline, failure retention, relationship mapping, live operation, audit behaviour and expansion logic, then translate the domain entities.

The default structural substitutions are:

- `TEAM` → `PARTY`
- `PLAYER` → `ACTOR`
- `MATCH` / `FIXTURE` → `POLITICAL_CONTEST` / `POLITICAL_EVENT`
- `SEASON` → `POLITICAL_CYCLE`
- `MATCH_RESULT` → `POLITICAL_OUTCOME`
- team state/form/performance → party state/form/performance
- player state/availability/form → actor state/availability/behaviour

Preserve all architecture that remains meaningful after those substitutions. Adapt only where politics genuinely requires a different domain object or mechanism.

## Exact new-thread opening

Paste this into the new thread:

`Explicitly reference mayhem82/TheNRLMAYHEM and mayhem82/The-Political-MAYHEM for this thread. Build The Political MAYHEM as the political-domain duplicate of TheNRLMAYHEM. Read the NRL repository architecture and current implementation first, then reproduce it in mayhem82/The-Political-MAYHEM with the primary substitutions teams → parties and players → actors, plus direct political equivalents for fixtures, seasons, results, form, availability, live state, grading, failure analysis, relationship mapping and public surfaces. Preserve the same continuously expanding MAYHEM operating model, temporal provenance, immutable projection history, result reconciliation, failure retention, calibration discipline, recursive analysis and Lattice Atlas relationship mapping. Treat retrospective discovery of historical evidence and ongoing capture of new evidence as co-equal evidence streams. Preserve both the source/event time and the MAYHEM discovery/capture time for every evidence item. A frozen prediction may claim only evidence demonstrably available before its evidence cutoff and freeze; evidence discovered later may improve historical understanding, failure analysis, relationship mapping, model rules and future projections but may never be retroactively credited to an earlier frozen prediction or used to rewrite its score. Do not import a political-domain deviation unless evidence shows the NRL structure cannot map cleanly. Never treat the repository as complete; use verified snapshots. Execute repository changes autonomously when requested and reread every write after persistence.`

## Build-order equivalence

Follow the same broad operating architecture as TheNRLMAYHEM, adapted to Political MAYHEM:

1. Canonical political-cycle and contest data model.
2. Party objects equivalent to team objects.
3. Actor objects equivalent to player objects.
4. Source registry and provenance rules.
5. Historical evidence discovery with explicit source/event time and discovery-time provenance.
6. Ongoing/live evidence capture with immutable capture lineage.
7. Current contest/event lifecycle handling and competition discovery.
8. Projection/tip generation and immutable capture.
9. Public/current projection surfaces.
10. Outcome verification.
11. Projection grading.
12. Failure audit and retained failed projections using the full timed evidence record.
13. Party intelligence equivalent to team intelligence.
14. Actor intelligence equivalent to player intelligence.
15. Calibration and source-performance learning from genuine contemporaneous prediction baselines.
16. Information-advantage and temporal evidence ledger.
17. Lattice Atlas relationship mapping and recursively expanding analysis.
18. Continuous re-ingestion, retrospective expansion and prospective capture without terminal completion.

Historical data being easier to obtain does not make it privileged, and live data being newer does not make it the only legitimate evidence. Both streams must retain temporal provenance.

## Temporal provenance rule

There is no forward-only experiment.

The evidence universe includes:

- historical evidence discovered retrospectively;
- evidence captured while the system is live;
- evidence discovered after a prediction freeze;
- evidence discovered after an outcome;
- verified outcomes and later explanatory evidence.

Each item keeps its own source/event time and its MAYHEM discovery or capture time.

A projection made and frozen at time `T` may be scored only from evidence demonstrably available to MAYHEM by its recorded evidence cutoff at or before `T`.

Evidence discovered after `T` remains valid evidence. It may change later projections, reveal missed mechanisms, alter relationship maps, improve model rules, or explain why an earlier prediction succeeded or failed. It cannot be inserted into that earlier prediction's frozen evidentiary lineage or used to rewrite its score.

Anti-hindsight therefore protects the integrity of frozen predictions; it does not prohibit retrospective discovery or retrospective analysis.

## Political signal expansion

The political implementation must preserve the same unbounded analytical-distribution principle used in TheNRLMAYHEM.

Every new observation can be analysed across as many defensible independent paths as the evidence supports. Relationships remain mapped continuously rather than being forced through a terminal investigative gate structure.

Political signals include ordinary predictive variables and signals that alter the psychological conditions of actors.

For those actor-response signals, preserve distinct provenance for:

- originating observable event;
- directly observable actor behaviour;
- actor statement, if any;
- inferred psychological condition;
- response by other actors or parties;
- downstream structural/political effect;
- subsequent projection impact;
- eventual outcome.

Never store an inferred psychological state as if it were an observed fact.

## Duplicate-first adaptation rule

When implementing a feature, first ask:

**What is the exact NRL MAYHEM equivalent?**

Replicate that structure first. Then replace NRL domain entities with political equivalents.

Only create a new political mechanism when no faithful equivalent exists or the political domain contains an additional mechanism that materially affects the intelligence system.

Examples:

- team page → party page
- player page → actor page
- team dossier → party dossier
- player dossier → actor dossier
- match prediction → political-contest projection
- match lifecycle → political-contest lifecycle
- final score/result → verified political outcome
- team lists → candidate/office-holder/party-actor state where applicable
- injuries/suspensions/late withdrawals → actor absence, resignation, disqualification, withdrawal, replacement, eligibility or other politically relevant availability state
- ladder/competition progression → polling/seat/contest/progression structure appropriate to the political cycle

The substitutions do not authorize arbitrary political assumptions. Political mechanisms must still be evidenced.

## Context boundary

Both repositories are public GitHub infrastructure but are not general conversational context.

Use or reference them in a thread only when the user explicitly references The Political MAYHEM, TheNRLMAYHEM, a MAYHEM implementation, or directs the thread to one of these repositories.

A new-thread bootstrap instruction naming the repositories constitutes that explicit reference for that thread.

## Nonpartisan boundary

The Political MAYHEM may analyse and forecast political outcomes, actor behaviour, party behaviour, polling, institutional responses and political relationships.

It must remain descriptive and nonpartisan. It is not to become a voter-persuasion, demographic-targeting or campaign-manipulation engine.

## Atomic commit discipline

Repository implementation must advance in small, independently verifiable steps.

For normal build work:

1. make one atomic change or one tightly coupled change-set;
2. commit it immediately;
3. reread the persisted file or files and verify the new SHA;
4. run only the smallest relevant validation needed for that step;
5. only then begin the next step.

Do not bundle unrelated runtime data, UI, manifest, workflow and documentation changes into one oversized write sequence. Prefer several small commits over one broad commit, even when all changes belong to the same feature.

If a step fails, preserve the last verified commit as the restart point. Do not continue stacking dependent writes on top of an unverified change.

## Persistence rule

Repository writes are not assumed successful merely because a write was attempted.

After every material write:

1. reread the persisted file;
2. verify the content and current SHA;
3. distinguish repository persistence from any later public-render deployment;
4. report persistence failure explicitly if the write did not survive.

Never declare the system complete. It is an expanding intelligence system with verified snapshots.
