# The Political MAYHEM Architecture

Status: **EXPANDING — NEVER COMPLETE**
Reference implementation: `mayhem82/TheNRLMAYHEM`

## Governing principle

The Political MAYHEM is the political-domain duplicate of TheNRLMAYHEM.

Its architecture should remain structurally equivalent wherever the political domain permits. The first translation layer is direct:

- NRL team → political party
- NRL player → political actor
- NRL match/fixture → political contest/event
- NRL season → political cycle
- NRL match result → political outcome
- NRL team intelligence → party intelligence
- NRL player intelligence → actor intelligence
- NRL team availability/form → party state/form
- NRL player availability/form → actor availability/state/behaviour

Politics-specific mechanisms are added only when no faithful NRL-domain equivalent exists or when the political domain contains additional causal structure that must be represented.

## Sport legibility translation layer

Sport is the canonical public translation layer for political legibility.

This does not make politics literally sport and does not weaken the political evidence model. The underlying architecture remains political-domain native, provenance-controlled and auditable. The sport layer sits above that architecture and translates the changing political environment into a grammar that is already widely understood: teams, players, form, selection, rivalries, fixtures, live state, tipping, outcomes and post-event review.

**Sport for legibility. Evidence architecture for truth control.**

The public problem being addressed is state reconstruction. Conventional political information arrives fragmented across speeches, polling, policy announcements, parliamentary events, campaigns, personalities, institutions and elections. The Political MAYHEM should expose the current competitive state directly rather than requiring the user to reconstruct it.

The canonical public translation includes:

- party → team;
- political actor → player;
- party leadership → captain / leadership group;
- party political form → team form;
- actor political form → player form;
- candidate or role change → selection change;
- actor eligibility, withdrawal, resignation or incapacity → availability state;
- defined outcome-bearing political target → fixture / match;
- political cycle → season;
- persistent competitive relationship → rivalry;
- coalition, preference or confidence-and-supply arrangement → tactical alliance;
- electorate, jurisdiction, chamber or institutional context → venue / field context;
- verified political outcome → result;
- selected outcome → MAYHEM tip;
- attached probability/confidence → tip confidence;
- target evidence cutoff → close / freeze point;
- outcome verification and failure analysis → post-match review.

The complete translation specification is maintained in `docs/SPORT-LEGIBILITY-TRANSLATION-LAYER.md`.

## Continuous operating model

The Political MAYHEM has no COMPLETE state. It has verified snapshots.

Its operating loop is:

**INGEST → ANALYSE → MAP RELATIONSHIPS → PROJECT → PRESERVE → RECONCILE → LEARN → RE-INGEST EXPANDED STATE → ANALYSE AGAIN**

New evidence, actors, parties, contests, sources, contradictions, failures, signals, relationships and political mechanisms continuously expand the system.

Politics is treated as a continuously active field. Party and actor states accumulate even when no election or other outcome-bearing event is imminent. Discrete tipping targets emerge from that field, receive their own evidence clocks and freeze points, and then resolve back into the continuing field.

## Temporal evidence architecture

There is no forward-only experiment and no requirement that retrospective discovery wait for a live baseline.

Political MAYHEM operates with multiple legitimate evidence timings at once:

- historical evidence discovered retrospectively;
- evidence captured during ongoing live monitoring;
- evidence discovered after a prediction freeze but before an outcome;
- evidence discovered after an outcome;
- verified outcomes and later explanatory evidence.

Every evidence item must preserve both its political/source time and the time at which MAYHEM discovered or captured it.

The anti-hindsight boundary applies to a frozen prediction, not to the evidence universe. A projection may claim only evidence demonstrably available to MAYHEM by its recorded evidence cutoff. Evidence discovered later remains valid evidence for historical reconstruction, causal analysis, failure audit, relationship mapping, model learning and later projections, but it cannot be retroactively credited to the earlier frozen projection or used to rewrite its score.

This separation allows retrospective discovery to contribute fully to the experiment without contaminating contemporaneous prediction measurement.

## Projection lineage

Projection history is immutable and versioned.

A political projection object should retain at minimum:

- projection identifier;
- contest/event identifier;
- political cycle;
- selected projected outcome;
- probability/confidence representation used at that time;
- exact creation/capture timestamp;
- evidence cutoff;
- source/evidence lineage;
- analytical lineage;
- model/rule/version identifiers where applicable;
- prior projection version, if revised;
- reason for revision;
- outcome grade after verified result;
- post-outcome audit reference where applicable.

Later projection versions append to this chain rather than replacing earlier versions.

## Party layer

Party objects occupy the structural position held by team objects in TheNRLMAYHEM.

Party intelligence may include verified variables such as electoral performance, polling, preference relationships, incumbency structure, candidate field, geographic distribution, funding disclosures, endorsements, campaign resource allocation, issue exposure, leadership state, internal stability, institutional relationships and other defensible political evidence.

The exact field set should be evidence-grown rather than assumed complete.

## Actor layer

Political actors occupy the structural position held by players in TheNRLMAYHEM.

Actors may include candidates, party leaders, ministers, opposition figures, independents, office-holders, influential party officials or other people whose actions materially affect the political contest.

Actor intelligence may include verified availability, role, status, statements, behaviour, withdrawals, resignations, eligibility, endorsements, disputes, alliances, leadership position and other relevant observable state.

Actor psychology is never treated as directly observed unless the evidence actually supports a direct statement. Inferred psychological condition remains a distinct analytical object.

## Psychological-condition signal class

The Political MAYHEM must support signals that change the psychological conditions of actors.

The analysis target is not merely whether an event correlates with a result, but whether a signal alters what actors believe to be possible, costly, safe, urgent, legitimate or inevitable, and whether that change produces observable behaviour.

The relationship chain may be represented as:

**observable signal → inferred actor update → observable behavioural response → response by other actors/parties → changed political conditions → projection effect → outcome**

Evidence classes must distinguish:

- observed event;
- observed behaviour;
- direct actor statement;
- inferred psychological condition;
- downstream relationship;
- causal hypothesis;
- verified outcome.

Inference must never be silently promoted to fact.

## Lattice Atlas / relationship mapping

The Political MAYHEM should reproduce the continuously expanding relationship-mapping architecture of TheNRLMAYHEM.

Potential political axes include time, party, actor, electorate, jurisdiction, polling, preference flows, incumbency, geography, demographics where lawfully and appropriately used for descriptive analysis, funding, endorsements, issue salience, media state, institutional action, candidate changes, leadership state, historical swing, turnout, redistribution, source reliability, contradiction state, evidence quality and actor-response dynamics.

The list is not closed.

Every new validated observation may open additional analytical paths. Paths may confirm a relationship, contradict it, reveal dependency, expose a proxy, identify a threshold, reveal a regime change, demonstrate team/party or actor dependence, or produce no useful relationship. All outcomes remain part of the evidence history.

## Failure retention

Incorrect political projections are not discarded or rewritten.

The failed projection remains immutable. Assessing the quality of the original decision uses the evidence actually available by that projection's cutoff. Explaining why the decision succeeded or failed may use the full evidence record, including historical or post-freeze evidence discovered later, provided its discovery timing is preserved and it is not misrepresented as contemporaneous input to the frozen prediction.

Later evidence may reveal missing mechanisms, source gaps, causal pathways or model weaknesses. Those findings belong in the audit and may influence future model rules and projections.

## Calibration

Calibration must use genuine contemporaneous probabilities/projections only.

No retrospective probability may be backfilled into a prior political prediction merely because later analysis suggests the system would have preferred a different estimate.

Evidence discovered later may influence later projections and model learning from its genuine discovery time onward. It may also explain earlier outcomes and prediction failures, but does not alter the earlier recorded probability or score.

## Public/private intelligence separation

Public repository architecture, schemas, code and deliberately published outputs are separable from private operational intelligence.

Unreleased analysis, provisional signals, internal weighting, unresolved hypotheses, source-performance judgments and investigation direction should not automatically be exposed merely because the repository is public.

## Contextual-use boundary

The existence of this public repository does not make it general conversational context.

A ChatGPT thread should access or rely on The Political MAYHEM or TheNRLMAYHEM only when the user explicitly references the relevant system/repository or provides a bootstrap instruction naming it.

## Build rule

When implementing any new Political MAYHEM feature:

1. locate the NRL MAYHEM equivalent;
2. reproduce its architecture;
3. translate teams to parties and players to actors;
4. translate other NRL event entities to the closest political equivalent;
5. preserve provenance, versioning, temporal integrity, reconciliation, grading, failure retention, calibration and relationship mapping;
6. preserve the separation between canonical political data and the sport-legibility public translation layer;
7. add political-specific mechanisms only where the political domain genuinely requires them;
8. preserve prior snapshots rather than rewriting history.

The Political MAYHEM is not to be simplified into a conventional election-prediction dashboard. It is an expanding political intelligence system built on the same underlying operating architecture as TheNRLMAYHEM, with sport used as the missing public legibility layer rather than as a substitute for political reality.
