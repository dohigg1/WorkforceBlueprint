# docs/sprint-prompts.md

**The build script. Work through these in order. Do not skip. Do not reorder.**

Each sprint has: a purpose, its prerequisites, the prompt to give Claude Code verbatim, the exit criterion, and the failure modes to watch for. The failure modes are the most valuable part of each entry. They are the specific ways this sprint goes wrong.

Give one sprint at a time. Do not paste the whole document. The protocol in `docs/build-protocol.md` governs every task within a sprint.

---

# SPRINT 0: De-risk the two bets

**Purpose.** Two architectural bets carry the entire product. If either fails, the architecture must change, and it is vastly cheaper to learn that now than in month five. Nothing else is built until both are proven.

**Prerequisites.** None. This is the first sprint. The legal position on intellectual property must be resolved before it begins.

### Prompt

> Before we build anything, we are proving two architectural bets. Do not write feature code. Do not create the application. We are building throwaway spikes and one permanent piece of infrastructure.
>
> **Task A. The permanent piece: the verification gate.**
> Create the repository skeleton per the structure in `CLAUDE.md` section 6, and create `./scripts/verify.sh`. It must run, in order: strict type check, lint, schema invariant tests, unit and integration tests, cross-tenant isolation suite, scenario isolation suite, measure consistency suite, adversarial artificial intelligence suite, performance suite, and a secret and personal data scan. Every gate that has no code to check yet must exist and pass trivially, so that it cannot be forgotten later. Wire it into a GitHub Actions workflow that runs on every push. Add a pre-commit hook that scans for anything resembling real personal data.
>
> Also create `scripts/seed-synthetic.ts`, which generates a synthetic organisation of a configurable size. It must produce a realistic shape: a hundred thousand positions, an average span of control of about six, roughly nine layers, a long tail of managers with a single report, around eight per cent vacancies, salary distributed log-normally by grade, positions spread across forty cost centres and twenty locations, and deliberate defects including a handful of orphans, some duplicate identifiers and one cycle. The defects matter, because real client data always contains them. **All data must be synthetic. Never use real names, real salaries or real client data anywhere, at any point, for any reason.**
>
> **Task B. Spike one: rendering at scale.**
> Prove that we can render a hundred thousand node organisation hierarchy with server-side layout precomputation and client-side virtualisation, in canvas or WebGL, never in scalable vector graphics. The targets are: initial render of a five thousand node subtree in under one second, and sixty frames per second while panning and zooming on a mid-specification laptop. Measure it. Report the actual numbers, not an impression.
>
> **Task C. Spike two: scenario overlay resolution.**
> Prove that a copy-on-write overlay over a hundred thousand row baseline in PostgreSQL resolves at read time fast enough to be usable. A scenario stores only the delta from its parent and is resolved at query time, never copied. Prove that scenario creation is effectively instantaneous and consumes negligible storage, and that a resolved read of a five thousand node subtree from a scenario with a thousand deltas is not materially slower than the same read from the baseline. Measure it.
>
> Report the measured numbers for both spikes against the targets. If either bet fails, stop and tell me. Do not attempt to proceed with a weaker version. Do not tell me it will probably be fine. I need the numbers.

### Exit criterion
Both bets proven with recorded numbers. The verification gate exists and is green. The synthetic dataset generator works.

### Failure modes to watch for
- The spike is measured on ten thousand nodes and the result extrapolated. Insist on a hundred thousand.
- The synthetic dataset is a perfect tree with no defects, which flatters both the renderer and, later, the mapper.
- Scalable vector graphics is used "just for the spike". It will then be used for ever.
- The verify script is deferred until "there is something to verify". It will never then be written.

### If a bet fails
Rendering: fall back to aggressive server-side subtree pagination. A weaker product, but viable. Change the positioning before you change anything else.
Scenario: fall back to materialised scenario snapshots with background recompute. Costs storage, preserves the feature. Do not abandon the scenario primitive.

---

# SPRINT 1: Tenancy

**Purpose.** Make cross-tenant leakage structurally impossible before any data exists.

**Prerequisites.** Sprint 0 green.

### Prompt

> Build the tenancy foundation. This is INV-1 and INV-2 in `docs/invariants.md`, and it must be right, because retrofitting it later is a full-schema rewrite.
>
> Stories E01-01, E01-02 and E01-06 from the backlog.
>
> A **tenant** is a paying customer. A **workspace** is an isolated data environment beneath a tenant. An ordinary customer has one workspace. A consultancy has one workspace per client engagement. Both identifiers are non-null on every table containing customer data, from this first migration onwards. Getting workspace in from the start is what makes the consultancy partner model nearly free later, so do not defer it on the grounds that we do not need it yet.
>
> Requirements:
> - PostgreSQL row-level security on every table, enabled and forced, so that the table owner is not exempt. Policies fail closed: with no tenant context set, a select returns zero rows, not all rows.
> - Tenant context is derived only from the verified session. Add a lint rule that forbids reading a tenant or workspace identifier from the request object anywhere outside the authentication middleware.
> - Roles: Owner, Administrator, Designer, Analyst, Viewer. Role-based access control enforced server side, never in the user interface alone. Invitation, acceptance and revocation.
> - Sessions: short-lived access tokens, refresh rotation, secure cookie flags, idempotent logout, session revocation on role change.
>
> **Write the tests first.** Before the implementation, write:
> 1. A schema-level test that enumerates every table in the public schema and asserts both columns exist and are non-null, row-level security is enabled and forced, a policy exists, and a select with no tenant context returns zero rows. This test must run for ever and must fail loudly the moment anyone adds a table without tenancy.
> 2. An integration test that, authenticated as Tenant A, attempts to access a resource belonging to Tenant B by identifier through every endpoint, and asserts a not-found response, not a forbidden response. Forbidden confirms the record exists and is itself a small leak.
>
> **Tests must run as a real tenant against real policies. Never disable, mock or bypass row-level security in a test.** If a test needs to bypass it, the test is wrong.
>
> Wire both suites into `verify.sh`.

### Exit criterion
The schema test passes and would fail if a table were added without tenancy. The cross-tenant suite passes against every endpoint that exists.

### Failure modes to watch for
- Row-level security enabled but not forced, so the application's own database user bypasses it entirely. This is the classic error and it renders the whole control decorative.
- Tests granted a superuser or owner connection, so they never exercise the policy.
- The workspace concept deferred as premature. It is not premature. It is the cheapest it will ever be, today.
- Authorisation implemented in a service layer that a future code path can simply not call. It belongs in the database.

---

# SPRINT 2: The canonical model

**Purpose.** Model the domain correctly. This is the sprint where the most expensive conceptual error is available.

**Prerequisites.** Sprint 1 merged and verified.

### Prompt

> Build the canonical data model. Stories E02-01, E02-02 and E02-05.
>
> Read `CLAUDE.md` section 4 before you begin, and restate the domain model back to me before you write any code.
>
> **The single most important rule in this sprint: the hierarchy is a hierarchy of Positions, not of People.**
>
> - A **Position** is a seat. It exists whether or not anyone occupies it. It has a grade, a cost centre, a location, a full-time equivalent value and a parent position. It may be vacant, and a vacant position still costs money and still occupies a place in the structure.
> - A **Person** occupies zero, one or many Positions, with fractional full-time equivalent apportionment across them.
> - **Job**, **Role**, **JobFamily**, **OrgUnit**, **Location**, **CostCentre**, **Skill** and **Activity** are all first-class entities with their own tables. None of them is a string property on Position.
> - **OrgUnit is not the reporting hierarchy.** They are different structures and must not be conflated. A position reports to a position; a position belongs to an org unit.
>
> Every entity and every relationship carries `valid_from` and `valid_to`. Nothing is ever destructively updated. A change supersedes. Every read takes an as-at date, defaulting to today. Build a supersession helper and add a lint rule forbidding a raw update on an entity table outside it.
>
> Every entity has a mandatory external identifier, supplied by the client's source system, and a system-generated internal identifier. Custom client-specific properties go in a JSONB column, giving us a schemaless extension path without abandoning relational integrity.
>
> Write the effective-dating tests first: a read without an explicit date defaults to today; a read as at a past date returns the superseded state; a superseded row is never returned for a current read.
>
> If you find yourself wanting to put a manager identifier on the Person table, stop and re-read this brief.

### Exit criterion
A person can be moved between positions without changing the structure. A position can be vacated without disappearing. A structure can be read as at any date.

### Failure modes to watch for
- Positions and people collapsed into one table because the test data has one person per position. Real data does not, and this error is unrecoverable without a rewrite.
- Effective dating added to entities but not to relationships. The reporting line is a relationship, and it is precisely the thing that changes over time.
- `valid_to` nullable and semantically ambiguous. Pick a convention, being either null or a far-future sentinel, document it in an architecture decision record, and enforce it.
- OrgUnit used as the parent of a position, conflating the two structures.

---

# SPRINT 3: Hierarchy and audit

**Purpose.** Make traversal fast and make every change permanently accountable.

**Prerequisites.** Sprint 2 merged and verified.

### Prompt

> Stories E02-03, E02-04 and E03-01.
>
> **Hierarchy.** Implement a materialised closure table over the position hierarchy, maintained transactionally on write. Recursive common table expressions are permitted for maintenance only, never for hot reads. Provide ancestor, descendant, depth and subtree queries. The target from `docs/invariants.md` is a subtree query under one hundred milliseconds on the hundred thousand node synthetic dataset. Measure it and report the number.
>
> The closure table must be scenario-aware and effective-dated. Think carefully about this before you start, and tell me your approach before you implement it. Naively maintaining a full closure table per scenario per date will not scale, and this is the hardest design problem in the sprint.
>
> **Structural integrity.** Cycle detection must reject any change that would create a loop, at write time. Orphans and multiple roots are flagged but permitted, never blocked, because real client data always contains them and a tool that refuses to load imperfect data is useless in a consulting context.
>
> **Audit.** Implement the append-only audit log as a PostgreSQL trigger, not as application code, so that it cannot be bypassed by a direct query or by a future code path that forgets to call it. Capture actor, timestamp, tenant, workspace, entity, operation, and the before and after state. It must be written in the same transaction as the change.
>
> Write the audit tests first: a change followed by a forced rollback leaves neither the change nor the audit entry; a change committed through any route produces exactly one audit entry; a direct database update, bypassing the application entirely, still produces an audit entry.
>
> Record the closure table design as an architecture decision record.

### Exit criterion
Subtree query under one hundred milliseconds at a hundred thousand nodes, measured and recorded. The audit trigger cannot be bypassed, proven by a test that bypasses the application.

### Failure modes to watch for
- The closure table designed for the baseline only, with scenario support assumed to be addable later. It is not addable later. Solve it now.
- Audit implemented in a service layer or an ORM hook. Both are bypassable. It belongs in a trigger.
- Cycle detection implemented as a read-time check rather than a write-time constraint, so corrupt data is admitted and then merely reported.
- Performance measured on ten thousand nodes.

---

# SPRINT 4 to 5: Ingestion

**Purpose.** This is the primary differentiator. The incumbent's evidenced weakness is the data preparation burden. If this epic is mediocre, the product has no wedge.

**Prerequisites.** Sprint 3 merged and verified.

### Prompt

> Stories E04-01 through E04-05. This is the most commercially important epic in the product. Treat it as a first-class product surface, not as a utility.
>
> **The claim this must support:** a client sends a messy human resources extract at ten in the morning, and by eleven there is a validated, costed, navigable organisation. If the build does not achieve that, the epic is not done.
>
> **Upload.** Comma-separated values and Excel, up to a hundred megabytes and two hundred and fifty thousand rows. Streaming parse. Never hold the whole file in memory. Type inference. A preview of the first hundred rows before commitment.
>
> **AI-assisted mapping.** Propose a target canonical field for every source column, with a confidence score and a plain-English explanation of why. At least eighty per cent of standard fields correctly auto-mapped on a typical human resources extract. Every proposal is overridable. The mapping is saved as a reusable named template. Test this against genuinely awkward column names, because real extracts contain things like `MGR_PERNR`, `Cost Ctr`, `FTE%`, `Position Title (Local)` and `Emp Grp`.
>
> **Fuzzy matching and deduplication.** Configurable match keys. Fuzzy matching on name, email and employee identifier with a confidence score. A human review queue offering merge, keep both, or reject. Every decision written to the audit log.
>
> **Validation.** Flag orphans, missing managers, cycles, negative or zero full-time equivalent, duplicate identifiers, positions without cost centres, and salary outliers. Produce a data quality score out of a hundred and a downloadable exception report.
>
> **In-place remediation.** Exceptions are fixable in an inline editing grid without leaving the tool. Resolutions are audited. The score recalculates live.
>
> Test against the deliberately defective synthetic dataset from Sprint 0. **Then tell me you need real, anonymised, awkward extracts to test properly, and stop, because synthetic data will flatter the mapper and hide exactly the problems this epic exists to solve.**

### Exit criterion
The defective synthetic dataset loads, is scored, and is remediated in place. Mapping accuracy is measured and reported as a number.

### Failure modes to watch for
- The mapper tested only against clean, sensibly named columns, and therefore appearing to work.
- The whole file loaded into memory, which works at ten thousand rows and dies at two hundred thousand.
- Validation implemented as blocking rather than advisory, so imperfect real data cannot be loaded at all.
- Deduplication auto-merging without human review. Merging two real employees is a serious data integrity failure.

---

# SPRINT 6: The measure engine

**Purpose.** The highest-leverage sprint in the project. Build one calculation engine and every subsequent analytic becomes a definition rather than a feature.

**Prerequisites.** Sprint 3 merged. Sprint 5 in progress or merged.

### Prompt

> Stories E06-01 and E06-02. Read INV-6 before you begin.
>
> Build the measure engine. A **measure** is a declarative definition comprising an aggregation, a filter, a scope, being node, subtree, org unit, or whole organisation, and an as-at date. The engine evaluates any measure against any scope, in any scenario, at any date, without bespoke code.
>
> **This is the substrate for the entire product.** Spans, layers, headcount, full-time equivalent cost, fully loaded cost, supply, demand, gap, and every number the product will ever display are measures. Workforce planning, which is the largest epic in the roadmap, requires no new calculation infrastructure at all if this engine is right. If it is wrong, every module will invent its own arithmetic, two screens will disagree about the same number, and we will permanently lose the trust of a finance audience.
>
> Deliver the standard measure library: span of control, direct reports, total descendants, depth, layer index, height, management ratio, headcount, full-time equivalent. Available immediately on data load with no configuration.
>
> Requirements:
> - Caching and subtree-level invalidation, so that a structural edit recomputes only the affected subtree, never the whole dataset. The target is a recompute in under two seconds after an edit on the hundred thousand node dataset.
> - Add a lint rule forbidding aggregate functions in structured query language anywhere outside `/packages/measures`.
> - Write the measure consistency test: the same measure, evaluated through two different surfaces, for example the chart and the export, returns identical values. This test will save us later.
>
> Do not build the user interface for measures in this sprint. Build the engine.

### Exit criterion
Spans and layers derive automatically from declarative measure definitions. The consistency test passes. Recompute is under two seconds, measured.

### Failure modes to watch for
- Span of control implemented as a hand-written query because it is easy, thereby defeating the entire purpose of the sprint. Every measure goes through the engine, including the trivial ones. **Especially** the trivial ones.
- Caching without subtree invalidation, so every edit recomputes the whole organisation.
- The engine built without scenario awareness, so it works on the baseline and has to be rewritten for scenarios two sprints later.

---

# SPRINT 7: Visualisation

**Prerequisites.** Sprint 6 merged. The Sprint 0 rendering spike proven.

### Prompt

> Stories E05-01 through E05-04. Build the production organisation chart on the architecture proven in the Sprint 0 spike.
>
> Canvas or WebGL. **Not scalable vector graphics.** Server-side layout precomputation, cached. Client-side virtualisation of off-screen nodes.
>
> Targets, from INV-9, which are contractual: sixty frames per second panning and zooming on a hundred thousand node dataset on a mid-specification laptop; initial render of a five thousand node subtree in under one second. Measure them. Report the numbers.
>
> - Layouts: vertical tree, horizontal tree, compact tree, grouped or matrix view. Collapse and expand subtrees. Focus a node and drill down.
> - Conditional formatting driven by any measure from the engine. Node cards configurable to display chosen properties. A legend.
> - Full text search across properties. A filter builder. The chart responds to a filter without a full reload.
>
> This is the first thing a prospect sees in a demonstration, and performance here is the most visible differentiator against the incumbent, whose evidenced weakness is degradation on large datasets and consumption of the user's own machine. It has to feel instant. If it feels merely acceptable, it has failed.

### Exit criterion
The chart is fast and legible at a hundred thousand nodes, with numbers recorded.

### Failure modes to watch for
- Scalable vector graphics reappearing because it is easier for the node cards. It will not survive a hundred thousand nodes.
- Layout computed on the client, which reintroduces the exact weakness we are attacking.
- Performance demonstrated on a developer's high-specification machine and never tested on a mid-specification one.

---

# SPRINT 8: Scenarios

**Purpose.** The point of the entire product. Also the sprint where the ordering matters most.

**Prerequisites.** Sprints 6 and 7 merged. The Sprint 0 scenario spike proven.

### Prompt

> Stories E07-01 and E07-02, **in that order, and do not begin E07-02 until E07-01 is merged and verified.**
>
> Read INV-5 before you begin.
>
> **E07-01. The scenario overlay.** A scenario is a copy-on-write delta from its parent, resolved at read time. It is never a copy of the data. Creating a scenario on a hundred thousand node dataset is effectively instantaneous and consumes negligible storage. A scenario may branch from the baseline or from another scenario, so scenarios form a tree.
>
> **E07-02. The editing surface.** Drag a position to a new manager. Create, delete and vacate positions. Change grade, cost centre, location and full-time equivalent. Bulk edit a selection. Undo and redo.
>
> **Every edit is confined to the active scenario and never touches the baseline.** There must be no code path by which a user action writes directly to a baseline table. Add a lint rule forbidding the import of a baseline repository from any controller or command handler.
>
> Write the scenario isolation test first: perform every category of edit, assert the baseline is byte-for-byte unchanged, and assert the scenario resolves to the expected new state.
>
> **A note on why the ordering is not negotiable.** If the editing surface is built against the baseline tables with the intention of adding scenarios afterwards, every mutation path in the application has to be rewritten. That rework has been costed at four to six sprints. It is the most expensive mistake available in this project. If you find yourself writing a mutation that goes straight to a baseline table because scenarios are not ready yet, stop and tell me.

### Exit criterion
Every edit lands in a scenario. The baseline is provably untouched. Undo and redo work.

### Failure modes to watch for
- The editing surface built first because it is more satisfying to demonstrate. This is the sprint's whole risk.
- Scenarios implemented as a full copy of the dataset, which appears to work at a thousand rows and is unusable at a hundred thousand.
- The measure engine not scenario-aware, so numbers are computed against the baseline while the chart shows the scenario. This produces a product that lies to the user, quietly, and it is very hard to spot.

---

# SPRINT 9: Cost and comparison

**Prerequisites.** Sprint 8 merged.

### Prompt

> Stories E08-01, E08-03, E08-04, E07-03 and E07-04.
>
> **Cost.** Fully loaded cost built up from base salary, employer on-costs by country, benefits, bonus and an allocable overhead. The build-up is configurable and, critically, transparent, because a finance director will not accept a number they cannot decompose. Vacant positions cost at a configurable rate, either budgeted or zero. Multi-currency, with an effective-dated rate table and a chosen reporting currency.
>
> **Grade-based costing.** Where individual salary is unavailable or restricted, cost is modelled from a grade midpoint table. **This is essential and is not an edge case.** Consultants very frequently do not receive individual salary data, and a tool that cannot cost an organisation without it is useless in exactly the situation we are selling into.
>
> **Comparison.** Two or more scenarios compared on headcount, cost, spans, layers and any other measure. A delta view listing every changed position. Exportable.
>
> **Live recompute.** Any structural edit recomputes affected measures, including cost, within two seconds, by invalidating only the affected subtree. Measure it.
>
> Every cost figure is a measure from the engine. There are no bespoke cost queries. If you are writing one, stop.
>
> Salary is a classified field under INV-7. A user without permission sees a masked individual value **but a correct aggregate for their subtree.** Masking must not break roll-ups. If it does, people will grant themselves full access to make the product work, and the control becomes decorative.

### Exit criterion
A costed scenario comparison, recomputing in under two seconds, correct under masking.

### Failure modes to watch for
- Cost implemented as a bespoke query rather than a measure, because it feels different. It is not different.
- Masking implemented as an error or a null, breaking every aggregate that contains a restricted record.
- Grade-based costing treated as an optional extra and deferred. It is the primary path in a consulting engagement.

---

# SPRINT 10: Export and natural language. Release 1 ships.

**Prerequisites.** Sprint 9 merged.

### Prompt

> Stories E09-01, E09-02, E10-01, E10-02, E10-03 and E10-05. This sprint ships Release 1.
>
> **Export.** One action produces a PowerPoint deck containing the chart, the structural summary, the cost summary, the scenario comparison and the exceptions. **Native, editable shapes and tables wherever feasible, not images.** A consultant will need to edit the deck, and a deck of pictures is worthless to them. Branded to the workspace. Also export any grid or comparison to a formatted Excel workbook, with the underlying data on a separate sheet so that the client can rebuild the numbers themselves.
>
> For a consulting-led product this is not a convenience feature. The output artefact of an organisation design engagement is a deck. A tool that produces the deck automatically saves days per engagement and is the single clearest articulation of value in a demonstration.
>
> **Natural language querying.** Read INV-8 before you begin, and take it literally.
>
> Build the semantic tool layer: a constrained schema through which the model composes measures, filters and scopes. **The model never emits structured query language.** Every tool call is validated against a schema, parameterised, tenant-scoped, rate-limited and logged. Add a lint rule forbidding any database client import inside `/packages/ai`.
>
> A question such as "which functions have an average span below six?" returns a filtered chart, a supporting table and a short written answer. Every figure in the answer is traceable to the underlying records and is cited. Where the model cannot answer from the data, it says so. It never infers, and it never estimates.
>
> **Treat all record content as untrusted input.** A job title in an uploaded file is an injection vector. Build an adversarial test suite with injection payloads embedded in job titles, employee names and free-text fields, and assert that no tool call escapes its tenant scope and that no injected instruction alters the model's behaviour.
>
> No customer data trains any model. No tenant's data ever appears in a context window serving another tenant. Prove both with tests.

### Exit criterion
A board pack in one click. A question answered in English, with every figure traceable. The adversarial suite is green. **Release 1 is sellable.**

### Failure modes to watch for
- PowerPoint export as images. It halves the value of the feature.
- Text-to-structured-query, which is the obvious implementation and the wrong one. It is a security hole and a correctness hole simultaneously.
- The adversarial suite written after the feature, and therefore written to pass.
- The model permitted to say "approximately" or "around". Every number it gives comes from a measure, or it declines to answer.

---

# RELEASE 2 ONWARDS

The same protocol applies. The sequencing rationale for each:

**Sprints 11 to 12. Job and role architecture, skills taxonomy.** Stories E11-01 to E11-03 and E11-06. Prerequisite for workforce planning, because planning happens by role cluster and by skill, not by individual. Includes AI clustering of positions into candidate roles, which must always be reviewable and never applied automatically.

**Sprints 13 to 15. Strategic workforce planning.** Stories E12-01 to E12-06. The largest epic. It is placed here deliberately, because supply, demand and gap are time-series measures over the same graph, and if the measure engine from Sprint 6 is right, this epic requires **no new calculation infrastructure at all**. If you find yourself building a new calculation engine here, the Sprint 6 engine was wrong, and that is the finding to report.

**Sprint 16. Severance and cost-out.** Stories E13-01 to E13-04. Note E13-04 specifically: severance and selection data is **access-logged, not merely change-logged.** This is the most sensitive data the platform will ever hold, and a leak of it from a listed client is a market-moving event. Masked by default even for administrators. Exports watermarked.

**Sprint 17. The partner console.** Stories E15-01 to E15-03. This is high value at low effort **only because Sprint 1 made workspace a first-class concept.** A client workspace created, branded and configured in under five minutes with no vendor involvement. Archived, exported to the client and securely destroyed with a certificate at the end of an engagement. Partner-level templates for measures, mappings, dashboards and board packs, instantiated into each new client workspace. That template library is the compounding asset that makes a consultant a repeat user.

**Sprint 18. Collaboration and hardening. Release 2 ships.**

**Sprints 19 to 21. Connectors.** Build the connector framework first, then the secure file transfer connector, then Workday. Secure file transfer is cheap and covers the long tail of client systems. Read-only. **Write-back is where connector projects go to die, and it stays out of scope.**

**Sprints 22 to 25. Enterprise and compliance. Release 3 ships.** Regional data planes, control plane and data plane separation, subject access requests, erasure with referential integrity, retention, special-category data handling. Build this only against a named, committed enterprise prospect. Speculative compliance work is the most reliable way to spend six months without shipping anything a customer asked for.

**Sprint 26 onwards. Intelligence.** AI structural optimisation, benchmarking, activity analysis, target operating model artefacts. Moat, not entry ticket.

---

# The standing reminder

Paste this at the end of any prompt where you feel the model is drifting, or at the start of any session that follows a long or difficult one.

> Before you respond: re-read `CLAUDE.md`, `docs/invariants.md` and `docs/build-protocol.md`.
>
> Then confirm, explicitly:
> - Which invariants does this task touch, and how is each satisfied?
> - Does this feature work inside a scenario, not merely against the baseline, and which test proves it?
> - Is every number here a measure, or have you written a bespoke query?
> - Has performance been measured against the hundred thousand record dataset, and what was the number?
> - What did you not build?
> - What did you assume?
>
> Do not tell me it is done until `./scripts/verify.sh` is green and the pertinence checklist is complete. If something is partially done, say so plainly. A partial result honestly reported is useful. A partial result reported as complete is worse than no result at all, because the next task will be built on top of it.
