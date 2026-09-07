# The Political MAYHEM — New Thread Bootstrap

Status: **ACTIVE REFERENCE**
Reference implementation: `mayhem82/TheNRLMAYHEM`
Target implementation: `mayhem82/The-Political-MAYHEM`

## Governing instruction

The Political MAYHEM is to be built as the political-domain duplicate of TheNRLMAYHEM.

Do not redesign the architecture from first principles. Read the NRL repository, reproduce its operating structure, data flow, provenance model, versioning discipline, failure retention, relationship mapping, live/forward operation, audit behaviour and expansion logic, then translate the domain entities.

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

`Explicitly reference mayhem82/TheNRLMAYHEM and mayhem82/The-Political-MAYHEM for this thread. Build The Political MAYHEM as the political-domain duplicate of TheNRLMAYHEM. Read the NRL repository architecture and current implementation first, then reproduce it in mayhem82/The-Political-MAYHEM with the primary substitutions teams → parties and players → actors, plus direct political equivalents for fixtures, seasons, results, form, availability, live state, grading, failure analysis, relationship mapping and public surfaces. Preserve the same continuously expanding MAYHEM operating model, temporal provenance, immutable projection history, result reconciliation, failure retention, calibration discipline, recursive analysis and Lattice Atlas relationship mapping. Build forward/live tipping first. Do not build the retroactive ingestion and retrospective signal-mining layer until a genuine forward baseline has formed. When retro analysis is later added, it may append better current projections from the genuine time of discovery forward but may never rewrite earlier projections. Do not import a political-domain deviation unless evidence shows the NRL structure cannot map cleanly. Never treat the repository as complete; use verified snapshots. Execute repository changes autonomously when requested and reread every write after persistence.`

## Build-order equivalence

Follow the same broad build order as TheNRLMAYHEM:

1. Canonical political-cycle and contest data model.
2. Party objects equivalent to team objects.
3. Actor objects equivalent to player objects.
4. Source registry and provenance rules.
5. Current contest/event lifecycle handling.
6. Forward evidence ingestion.
7. Projection/tip generation and immutable capture.
8. Public/current projection surfaces.
9. Outcome verification.
10. Projection grading.
11. Failure audit and retained failed projections.
12. Party intelligence equivalent to team intelligence.
13. Actor intelligence equivalent to player intelligence.
14. Calibration and source-performance learning from genuine contemporaneous evidence.
15. Information-advantage and temporal evidence ledger.
16. Lattice Atlas relationship mapping and recursively expanding analysis.
17. Genuine forward baseline accumulation.
18. Retroactive ingestion and retrospective single-signal / multidimensional discovery built last.

Do not move retroactive analysis ahead of the forward architecture merely because historical data is easier to obtain.

## Forward-first rule

The forward system must exist before the historical discovery engine so the architecture acquires a genuine uncontaminated baseline.

A projection made at time `T` may use only evidence genuinely knowable at `T`.

Later evidence creates a later projection version. It does not rewrite the earlier version.

When the retro layer is eventually introduced, a relationship discovered at time `R` may influence projections from `R` onward. It cannot be inserted retrospectively into predictions made before `R`.

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

## Persistence rule

Repository writes are not assumed successful merely because a write was attempted.

After every material write:

1. reread the persisted file;
2. verify the content and current SHA;
3. distinguish repository persistence from any later public-render deployment;
4. report persistence failure explicitly if the write did not survive.

Never declare the system complete. It is an expanding intelligence system with verified snapshots.
