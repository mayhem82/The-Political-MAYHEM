# The Political MAYHEM

Status: **EXPANDING — NEVER COMPLETE**

The Political MAYHEM is the political-domain duplicate of `mayhem82/TheNRLMAYHEM`.

The architecture is to be reproduced as closely as the political domain permits. Structural substitutions are direct:

- NRL teams → political parties
- NRL players → political actors
- matches/fixtures → political contests/events
- season → political cycle
- match result → political outcome
- team form/performance → party performance/state
- player availability/form → actor availability/state/behaviour

Everything else should remain structurally equivalent unless the political domain requires a genuine domain-specific adaptation.

## Two master glossaries

The public reference layer preserves the same two-glossary separation as TheNRLMAYHEM:

- **Political Master Glossary** — native political, electoral, parliamentary, government, party and polling terminology. MAYHEM/site architecture is excluded.
- **Site Master Glossary** — MAYHEM architecture, sport-legibility translations, evidence states, lifecycle states, tipping controls, audit language and public-interface terminology. Native political terminology is excluded.

The two glossaries must not be merged or renamed into one another.

The evidence system is temporally layered, not forward-only. Retrospective discovery of historical evidence and ongoing capture of new evidence are both legitimate inputs to the experiment. Every evidence item must preserve its source/event time and its MAYHEM discovery or capture time.

Prediction integrity is a separate boundary: a frozen tip may claim only evidence that was actually available to MAYHEM before that tip's evidence cutoff and freeze. Evidence discovered later may improve historical understanding, causal analysis, failure audits, relationship maps, model rules and future projections, but it cannot be retroactively credited to an earlier frozen prediction or used to rewrite its score.

The operating system remains continuously expanding:

**INGEST → ANALYSE → MAP RELATIONSHIPS → PROJECT → PRESERVE → RECONCILE → LEARN → RE-INGEST EXPANDED STATE → ANALYSE AGAIN**

The Political MAYHEM is nonpartisan. It is an intelligence, forecasting, provenance, calibration and relationship-discovery system, not a persuasion or voter-targeting system.

Continue in a new thread using `docs/NEW-THREAD-BOOTSTRAP.md`.
