# CLAUDE.md

**This file is the constitution of this project. Read it in full at the start of every session. Do not begin any task until you have read it and the two documents it points to.**

---

## 0. Mandatory reading order

Before your first action in any session:

1. Read this file, `CLAUDE.md`, in full.
2. Read `docs/invariants.md`. These are non-negotiable and machine-checked.
3. Read `docs/build-protocol.md`. This is how you must work.
4. Read the task brief for the current sprint in `docs/sprint-prompts.md`.
5. Run `./scripts/verify.sh` to confirm the repository is in a green state before you change anything.

If any of the above fails or is missing, stop and report. Do not proceed on assumption.

---

## 1. What we are building

A multi-tenant software-as-a-service platform for organisation design, workforce planning, workforce cost modelling, and job and skills architecture.

It competes with Orgvue. It wins on four specific things, and every decision you make must protect them:

1. **Speed to value.** A messy human resources spreadsheet becomes a validated, costed, navigable organisation in under an hour, without a consultant.
2. **Performance at scale.** One hundred thousand positions render and recompute without degrading, because the work is done server side rather than on the user's laptop.
3. **No proprietary language required.** The common eighty per cent of analysis is achieved through a no-code builder and natural language, not through an expression language the user must learn.
4. **Genuine forward-looking planning.** Supply, demand and gap over time, including attrition, retirement, requisitions and planned headcount.

If a change you are about to make weakens any of these four, stop and raise it.

---

## 2. The five primitives

The entire product rests on five load-bearing primitives. They are built once, in this order, and everything else is configuration on top of them. This ordering is deliberate and is the reason the project is achievable.

1. **Tenancy, workspace and identity.** Every row carries a tenant and a workspace, from the very first migration.
2. **Canonical graph with effective dating.** People, positions, org units, cost centres, relationships. All effective-dated. Positions are distinct from people.
3. **Scenario overlay engine.** A scenario is a copy-on-write delta resolved at read time. It is never a copy of the data.
4. **Measure engine.** Every analytic in the product, including spans, layers, cost, supply, demand and gap, is a declarative measure over a filtered scope at a point in time. There is one engine, not many calculations.
5. **Presentation and export layer.** One service turns any measure, chart or comparison into PowerPoint, Excel and portable document format.

**You must not build a feature that bypasses a primitive.** If a task appears to require a bespoke calculation outside the measure engine, or a mutation path outside the scenario engine, you have misunderstood the task. Stop and ask.

---

## 3. Fixed technical decisions

These are settled. Do not relitigate them, do not substitute libraries, and do not introduce a new datastore, framework or paradigm without an explicit written instruction from the product owner.

| Layer | Decision |
|---|---|
| Language | TypeScript throughout, strict mode, no `any` without a written justification comment |
| Back end | NestJS, modular monolith with hard module boundaries |
| Front end | React with Vite, TanStack Query for server state |
| Database | PostgreSQL 16. Row-level security. JSONB for custom properties. Closure table for hierarchy |
| Chart rendering | Canvas or WebGL. **Never scalable vector graphics for the main chart.** |
| Queue | Redis with BullMQ |
| Cache | Redis |
| Vectors | pgvector, in the same PostgreSQL instance |
| AI | Anthropic API, called only through the semantic tool layer |
| Infrastructure | Terraform. Docker. GitHub Actions |
| Testing | Vitest for unit and integration, Playwright for end to end, k6 for load |

**Rationale you must not undo.** PostgreSQL carries the relational model, the schemaless extension through JSONB, the hierarchy through a closure table, the tenancy through row-level security, and the vectors through pgvector. One datastore. A second datastore is a permanent operational tax and is forbidden until a written decision says otherwise.

---

## 4. The domain model, stated precisely

Get this wrong and everything downstream is wrong.

- A **Position** is a seat in the organisation. It exists whether or not anyone sits in it. **The hierarchy is a hierarchy of Positions.**
- A **Person** occupies zero, one or many Positions, with fractional full-time equivalent apportionment.
- A Position may be **vacant**. A vacant Position still has a cost, a grade, a cost centre and a place in the structure.
- A **Job** is the generic description. A **Role** is a cluster of similar Positions. A **JobFamily** groups Roles.
- An **OrgUnit** is a structural container. It is not the same as the reporting hierarchy and must not be conflated with it.
- **Location**, **CostCentre**, **Skill** and **Activity** are first-class entities, not string properties.
- Every entity and every relationship carries `valid_from` and `valid_to`. **Every read is as at a date.** The default is today.

The most common and most expensive error available to you is to model the hierarchy as a hierarchy of people. Do not.

---

## 5. The hard invariants

Full detail, with the test that proves each one, is in `docs/invariants.md`. Summarised:

- **INV-1.** Every table has non-null `tenant_id` and `workspace_id`. Row-level security is enabled and fails closed.
- **INV-2.** Tenant context is derived from the authenticated session only. It is never read from a request parameter, header, body or query string.
- **INV-3.** Every mutation writes to the audit log in the same database transaction as the change.
- **INV-4.** Every entity and relationship is effective-dated. No read ignores the as-at date.
- **INV-5.** Every mutation is scenario-aware. There is no write path that touches a baseline table directly from a user action.
- **INV-6.** Every analytic is expressed as a measure. There are no bespoke aggregation queries in feature code.
- **INV-7.** Every field containing personal data is classified and has a declared access permission.
- **INV-8.** The language model never emits structured query language. It composes measures through a constrained tool schema.
- **INV-9.** All performance assertions are measured against the one hundred thousand record synthetic dataset, never against a toy fixture.
- **INV-10.** No customer data is used to train any model, and no customer data crosses a tenant boundary in a model context window.

**An invariant violation is a build failure, not a code review comment.** `./scripts/verify.sh` enforces them. It must pass before you declare any task complete.

---

## 6. Repository structure

```
/apps
  /web              React front end
  /api              NestJS back end
  /worker           BullMQ processors: ingestion, matching, recompute, exports
  /render           Export and rendering service: PowerPoint, Excel, PDF
/packages
  /data-model       Canonical entities, types, validation, effective dating
  /tenancy          Tenant and workspace context, RLS helpers, ABAC policy engine
  /hierarchy        Closure table, traversal, spans, layers, cycle detection
  /scenarios        Copy-on-write overlay, branch, compare, merge
  /measures         The measure engine and the standard measure library
  /costing          Cost build-up, currency, severance
  /planning         Supply, demand, gap, closure actions
  /skills           Taxonomy, ESCO, O*NET, SFIA crosswalks, matching
  /ai               Semantic tool layer, natural language query, narrative, guards
  /audit            Append-only change and access log
/infra              Terraform, environments
/scripts            verify.sh, seed-synthetic.ts, perf.sh
/docs               invariants.md, build-protocol.md, sprint-prompts.md, adr/
/tests
  /fixtures         Includes the 100k synthetic dataset generator
```

Module boundaries are enforced by lint rule. A feature module may not import another feature module's internals. It may import from `/packages` only.

---

## 7. Working agreement

The full protocol is in `docs/build-protocol.md`. The short version:

1. **Orient.** Read the task. Read the code you are about to change. Never edit a file you have not read in this session.
2. **Restate.** Write back, in your own words, what you are about to build and what would make it wrong. If your restatement differs from the brief, stop and ask.
3. **Plan.** Produce a file-by-file plan before writing code. Wait for approval on any plan that touches a primitive.
4. **Test first for invariants.** Write the failing test that proves the invariant before writing the implementation.
5. **Implement.**
6. **Verify.** Run `./scripts/verify.sh`. Run the performance suite if the change touches the hierarchy, the measure engine, the scenario engine or rendering.
7. **Report.** Complete the pertinence checklist in section 9. State explicitly what you did not do.

---

## 8. Stop conditions

**Stop and ask the product owner. Do not proceed on your own judgement, and do not guess.**

- The task appears to require a change to a primitive or an invariant.
- The task appears to require a new datastore, framework or third-party service.
- The task requires handling salary, performance, diversity, severance or selection data in a way not already specified.
- A performance target cannot be met and you are considering weakening it.
- Real client data has appeared in the repository, in a fixture, in a test or in a log. **This is an incident. Stop immediately and report.**
- The brief is ambiguous in a way that a reasonable person could resolve two different ways.
- You are about to write a workaround, a `TODO`, or a comment beginning "for now".

Guessing is more expensive than asking. A wrong assumption baked into a primitive costs sprints.

---

## 9. The pertinence checklist

Run this at the end of every task, and paste the completed checklist into your report. Answer each with yes, not applicable, or an explanation. Do not answer with silence.

1. Does every new table carry `tenant_id` and `workspace_id`, with row-level security enabled and failing closed?
2. Is there a test proving that a user of Tenant A receives zero rows from Tenant B through this new code path?
3. Does every mutation write to the audit log inside the same transaction?
4. Is every new entity and relationship effective-dated, and does every read pass an as-at date?
5. Does this feature work correctly inside a scenario, not only against the baseline? Is there a test that proves it?
6. Is every new analytic expressed as a measure rather than a bespoke query?
7. Is every new personal-data field classified, with a declared access permission and a masking behaviour?
8. Has performance been measured against the one hundred thousand record synthetic dataset, with the number recorded?
9. Have you added or updated the tests, and do they fail if the feature is removed?
10. Have you updated the documentation such that a consultant could use this without training?
11. What did you deliberately not build, and why?
12. What did you assume? List every assumption.

**A task with an incomplete checklist is not complete.** If you cannot answer a question, that is the finding, and you must report it rather than omit it.

---

## 10. Things you must never do

- Never disable, mock, stub or bypass a row-level security policy, including in tests. Tests must run as a real tenant.
- Never write a raw query that omits tenant scoping. There is no such thing as a safe exception.
- Never read tenant identity from user-supplied input.
- Never let a language model emit structured query language against the database.
- Never place real client data, real salary data or real personal data in the repository, in a fixture, in a seed or in a log.
- Never build the editing surface before the scenario engine it writes through.
- Never render the main organisation chart in scalable vector graphics.
- Never model the reporting hierarchy as a hierarchy of people.
- Never add a second datastore.
- Never mark a task complete with a failing verification gate.
- Never silently reduce scope. If you cut something, say so, in the report, in bold.

---

## 11. Style

- British English throughout, in code comments, in the user interface, in documentation and in commit messages.
- No em dashes anywhere.
- Commit messages state what changed and which story identifier it belongs to, for example `E07-01: scenario overlay resolution at read time`.
- Every architectural decision of consequence is recorded as a short architecture decision record in `docs/adr/`.
