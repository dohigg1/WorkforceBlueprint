# docs/invariants.md

**These are the rules that cannot be broken. Each one has a test. `./scripts/verify.sh` runs all of them. A violation is a build failure.**

The purpose of this document is to make correctness machine-checkable rather than dependent on the vigilance of whoever is reviewing the code at the time. Everything in here exists because getting it wrong later is materially more expensive than getting it right now.

---

## INV-1. Tenant and workspace isolation exists in the schema

**Rule.** Every table containing customer data has a non-null `tenant_id` and a non-null `workspace_id`. Row-level security is enabled on the table. The policy is `USING` a session-derived tenant context and fails closed, meaning that when no tenant context is set, zero rows are returned rather than all rows.

**Why.** Retrofitting row-level security into a live schema is a full-schema rewrite. Doing it after a customer is live is a rewrite plus a migration plus a security review. It is the single most expensive omission available in this project.

**Test.** A schema-level test enumerates every table in the public schema, excluding a short and explicitly justified allowlist of system tables, and asserts:
- both columns exist and are non-null;
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` has been applied;
- `FORCE ROW LEVEL SECURITY` has been applied, so that the table owner is not exempt;
- a policy exists;
- with no tenant context set, `SELECT` returns zero rows.

**This test must be written in Sprint 1, before any other table exists.**

---

## INV-2. Tenant context is never user-supplied

**Rule.** The tenant and workspace identifiers used to scope a query are derived exclusively from the verified session. They are never read from a path parameter, query string, request body, header or cookie other than the signed session itself.

**Why.** If a tenant identifier can be supplied by the caller, then every endpoint in the product is one authorisation bug away from a cross-tenant breach. Deriving it from the session makes the entire class of bug impossible rather than merely unlikely.

**Test.** A lint rule forbids reading a tenant or workspace identifier from the request object anywhere outside the authentication middleware. An integration test attempts to access a resource belonging to Tenant B while authenticated as Tenant A, by identifier, by every endpoint, and asserts a not-found response, not a forbidden response. A forbidden response confirms the existence of the record and is itself a small leak.

---

## INV-3. Every mutation is audited, in the same transaction

**Rule.** Every insert, update and delete of customer data writes an entry to the append-only audit log within the same database transaction as the change itself. Not afterwards. Not asynchronously. Not through a hook that can be forgotten.

**Why.** An audit log written outside the transaction is a log that can silently miss changes when something fails halfway. For a product holding redundancy selection data, an incomplete audit log is worse than no audit log, because it will be relied upon.

**Test.** Implemented as a database trigger, not as application code, so that it cannot be bypassed by a direct query or a future code path. A test writes a change, forces a rollback, and asserts that neither the change nor the audit entry survives. A second test asserts that a change committed through any route produces exactly one audit entry.

**Additional rule for severance and selection data.** For tables carrying severance, selection or performance data, **read access is also logged**, not merely mutation. This is a distinct requirement and is easily missed.

---

## INV-4. Everything is effective-dated, and every read is as at a date

**Rule.** Every entity and every relationship carries `valid_from` and `valid_to`. No record is ever destructively updated. A change supersedes. Every read carries an as-at date, defaulting to today.

**Why.** Organisation design is inherently temporal. The question is never "what is the structure" but "what is the structure on the first of April". A tool that cannot answer that is a drawing tool. Adding effective dating afterwards requires rewriting every query and every measure in the product.

**Test.** A schema test asserts the presence of both columns on every entity and relationship table. A repository-layer test asserts that a read without an explicit as-at date defaults to today and does not return superseded rows. A lint rule forbids a raw `UPDATE` on an entity table outside the supersession helper.

---

## INV-5. Every user mutation goes through the scenario engine

**Rule.** There is no code path by which a user action writes directly to a baseline table. All user edits write a delta into the active scenario. Promotion of a scenario to baseline is a separate, explicit, audited operation.

**Why.** This is the invariant that most often gets broken, because it is the one that is most convenient to break. If the editing surface is built directly against baseline tables with the intention of adding scenarios later, every mutation path in the application has to be rewritten. Estimated cost of that rework: four to six sprints.

**Test.** A lint rule forbids the import of a baseline repository from any controller or command handler. An integration test performs every category of edit, asserts that the baseline is byte-for-byte unchanged, and asserts that the scenario resolves to the expected new state.

---

## INV-6. Every analytic is a measure

**Rule.** Spans, layers, headcount, cost, supply, demand, gap and every other number the product displays is produced by the measure engine from a declarative definition. There are no bespoke aggregation queries in feature code.

**Why.** This is what makes workforce planning, the single largest epic, cheap. Supply, demand and gap are time-series measures over the same graph. If the measure engine exists, they require no new calculation infrastructure. If it does not, every module invents its own arithmetic, the numbers disagree between two screens, and the product loses the trust of a finance audience permanently.

**Test.** A lint rule forbids aggregate functions in structured query language outside `/packages/measures`. A test asserts that every measure surfaced in the user interface resolves to a registered measure definition. A cross-check test asserts that the same measure evaluated through two different surfaces, for example the chart and the export, returns identical values.

---

## INV-7. Personal data is classified and permissioned

**Rule.** Every field is classified at the point it is defined, as one of: structural, financial, personal, sensitive-personal, or special-category. Each classification has a declared default access permission and a declared masking behaviour. A user lacking permission receives a masked value, not an error.

**Why.** Masking rather than erroring is what allows a consultant with pseudonymised access to still see correct aggregate cost. Erroring breaks every roll-up and makes the restricted view useless, which in practice leads people to grant themselves full access, which defeats the control.

**Test.** A schema test asserts that every column is present in the classification registry, and fails on any unclassified column. An integration test asserts that a user without salary permission receives a masked individual salary but a correct aggregate cost for their subtree.

**Special-category rule.** Diversity data is stored separately, is queryable only in aggregate, and is suppressed below a configurable minimum group size to prevent re-identification. It is never joinable to an individual in a design view.

---

## INV-8. The model never touches the database directly

**Rule.** The language model composes measures, filters and scopes through a constrained tool schema. It never emits structured query language. Every tool call is validated against a schema, parameterised, tenant-scoped, rate-limited and logged.

**Why.** Text-to-structured-query against a live human resources database is an unacceptable risk in this product, both for correctness and for security. Record content is untrusted input: a job title in an uploaded file is an injection vector. The semantic layer converts an unbounded risk into a bounded one.

**Test.** A lint rule forbids any database client import inside `/packages/ai`. A test suite of adversarial inputs, including injection payloads embedded in job titles, employee names and free-text fields, asserts that no tool call escapes its tenant scope and that no injected instruction changes the model's behaviour.

---

## INV-9. Performance is measured against the real thing

**Rule.** Every performance assertion runs against the synthetic one hundred thousand record dataset, generated by `scripts/seed-synthetic.ts`. Never against a toy fixture.

**Targets, which are contractual, not aspirational:**

| Operation | Target |
|---|---|
| Subtree query, ancestors or descendants, at 100k nodes | under 100 milliseconds |
| Initial render of a 5,000 node subtree | under 1 second |
| Pan and zoom on a 100k node chart | 60 frames per second on a mid-specification laptop |
| Measure recompute after a structural edit | under 2 seconds |
| Scenario creation on a 100k dataset | effectively instantaneous, and negligible storage |
| Full ingestion and validation of a 50,000 row file | under 5 minutes |

**Why.** Performance is a differentiator against the incumbent, whose evidenced weakness is degradation on large datasets and consumption of the local machine's resources. A performance claim that has only been tested on a thousand rows is not a claim, it is a hope.

**Test.** A k6 and Playwright suite runs the table above in continuous integration on every change to the hierarchy, measure, scenario or rendering packages. A regression against target is a build failure.

---

## INV-10. Customer data never leaves its boundary

**Rule.** No customer data is used to train any model. No customer data from one tenant ever appears in a model context window serving another tenant. No customer data is written to a log, a trace, an error report or a third-party observability tool.

**Why.** This is the promise on which an enterprise human resources sale depends, and the one that a security questionnaire will interrogate. It must be true in the code, not merely in the contract.

**Test.** A test asserts that structured log output contains no field classified as personal or above. A test asserts that model context assembly is scoped by tenant and cannot be constructed across tenants. Observability configuration is asserted to redact classified fields.

---

## INV-11. No real data in the repository

**Rule.** No real client data, real personal data or real salary data is ever committed, seeded, fixtured or logged. All test data is synthetic.

**Why.** Because it will otherwise happen, in week three, when someone needs a realistic file to test the mapper. That file will then exist in the git history for ever.

**Test.** A pre-commit hook scans for patterns resembling real personal data. Continuous integration scans the full history. A finding is an incident, not a warning.

---

## The verification gate

`./scripts/verify.sh` runs, in order:

1. Type check, strict.
2. Lint, including every architectural lint rule referenced above.
3. Schema invariant tests, covering INV-1, INV-4 and INV-7.
4. Unit and integration tests.
5. Cross-tenant isolation suite, covering INV-1 and INV-2.
6. Scenario isolation suite, covering INV-5.
7. Measure consistency suite, covering INV-6.
8. Adversarial artificial intelligence suite, covering INV-8.
9. Performance suite against the synthetic dataset, covering INV-9, on relevant changes.
10. Secret and personal data scan, covering INV-10 and INV-11.

**Build this script in Sprint 0. It is the first thing that exists in the repository, before any feature code.** Every gate that is not yet applicable should be present and passing trivially, so that it cannot be forgotten later. A gate that is added after the code it governs will find violations, and the pressure at that point will be to weaken the gate rather than to fix the code.
