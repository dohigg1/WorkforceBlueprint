# Organisation Design and Workforce Planning Platform
## Product Roadmap, Epics, User Stories and Prioritised Backlog

Version 1.0 | Prepared for build execution via Claude Code

---

## 1. Purpose and How to Read This Document

This document converts the product specification into an executable backlog. It is organised so that a developer, or Claude Code acting as the developer, can work top to bottom with minimal rework.

Sections 2 to 4 explain the prioritisation logic. Section 5 sets out the release train. Section 6 contains the epics and user stories in build order. Section 7 gives the sprint plan. Sections 8 to 10 cover cut lines, definition of done, and schedule risk.

**Planning assumptions.** Two-week sprints. A working team of one to two engineers augmented heavily by Claude Code, which materially compresses implementation but not design, integration, testing or security review. Story points use a modified Fibonacci scale where one point is roughly half a day of net engineering effort including tests. A sprint capacity of 30 points is assumed. These assumptions should be recalibrated after Sprint 2 against actual velocity.

---

## 2. The Prioritisation Thesis

Most org design platforms are slow to build because teams start with the visible surface, the org chart, and then discover that tenancy, effective dating, scenario branching, audit and calculation all need to be retrofitted into a data layer that was never designed to carry them. Each retrofit costs more than the original build.

Development time is therefore minimised by inverting the order. Five primitives carry almost all the structural weight of the product. Build these once, properly, and every subsequent feature becomes a thin layer of configuration on top.

**The five load-bearing primitives.**

1. **Tenancy, workspace and identity.** Every row of data in the system must carry a tenant and a workspace from the first migration. Retrofitting row-level security into a live schema is a full-schema rewrite plus a security incident waiting to happen. Making *workspace* a first-class concept from day one, rather than only *tenant*, is what makes the consultancy partner model nearly free later, because a client engagement is simply an isolated workspace beneath a partner tenant.
2. **Canonical graph with effective dating.** People, positions, org units, cost centres and their relationships, all effective-dated. If dates are added later, every query, every measure and every scenario has to be rewritten.
3. **Versioned overlay engine, known as scenarios.** A scenario must be a copy-on-write overlay on a baseline, resolved at read time. If editing is built directly against baseline tables first, the scenario engine forces a rewrite of every mutation path in the application.
4. **Measure engine.** Spans, layers, headcount, full-time equivalent cost, fully loaded cost, supply, demand and gap are all the same thing: a declarative aggregation over a filtered subtree of the graph at a point in time. Build one engine and every analytic in the product becomes a measure definition rather than a feature.
5. **Presentation and export layer.** One rendering service that turns any measure, chart or scenario comparison into PowerPoint, Excel and PDF. Built once, it serves every module.

Everything else in the product, including the entire artificial intelligence layer, is downstream of these five. The AI features in particular are cheap to build **only if** the measure engine exposes a clean semantic layer for the model to call as tools. Build the semantic layer, and natural language querying is a fortnight of work. Skip it, and it is a permanent source of hallucination and rework.

---

## 3. Prioritisation Method

Each epic is scored on four dimensions. Scores are one to five, where five is highest.

| Dimension | Definition |
|---|---|
| **Value (V)** | Willingness of a buyer to pay for this alone. |
| **Differentiation (D)** | Degree to which this exploits an evidenced weakness of Orgvue or a competitor. |
| **Unblocking weight (U)** | Number and importance of downstream epics that cannot start until this is done. |
| **Effort (E)** | Engineering cost. Higher score means more effort. |

**Priority score = (V + D + (U × 2)) ÷ E**

Unblocking weight is deliberately double-weighted. This is the mechanism by which the ranking pulls foundational work forward and so minimises total development time. A feature with modest standalone value but high unblocking weight, such as the measure engine, correctly outranks a feature with high standalone value that can safely wait, such as activity analysis.

The score produces the ranking. Judgement then applies two overrides. First, nothing ships in a release that does not contribute to that release being independently sellable. Second, security and tenancy work is never deferred to fund feature work, because in a product processing redundancy data the reputational cost of a breach is terminal.

---

## 4. Epic Register and Priority Ranking

| ID | Epic | Release | V | D | U | E | Score | Rank |
|---|---|---|---|---|---|---|---|---|
| E01 | Tenancy, workspace, identity and access | R0 | 2 | 3 | 5 | 3 | 5.00 | 1 |
| E02 | Canonical data model and hierarchy engine | R0 | 2 | 2 | 5 | 3 | 4.67 | 2 |
| E06 | Measure engine and spans and layers analytics | R1 | 4 | 3 | 5 | 3 | 5.67 | 3 |
| E07 | Scenario engine: branch, edit, compare, merge | R1 | 5 | 3 | 4 | 4 | 4.00 | 4 |
| E03 | Audit trail and change history | R0 | 2 | 2 | 3 | 2 | 5.00 | 5 |
| E04 | Data ingestion and preparation | R1 | 4 | 5 | 4 | 4 | 4.25 | 6 |
| E05 | Organisation visualisation at scale | R1 | 5 | 4 | 3 | 4 | 3.75 | 7 |
| E08 | Workforce cost modelling core | R1 | 5 | 2 | 3 | 3 | 4.33 | 8 |
| E09 | Reporting, dashboards and export | R1 | 4 | 2 | 3 | 3 | 4.00 | 9 |
| E10 | Natural language querying and semantic layer | R1 | 4 | 5 | 3 | 3 | 5.00 | 10 |
| E11 | Job and role architecture and skills taxonomy | R2 | 4 | 3 | 3 | 4 | 3.25 | 11 |
| E12 | Strategic workforce planning | R2 | 5 | 4 | 2 | 5 | 2.60 | 12 |
| E13 | Severance modelling and cost-out tracking | R2 | 5 | 3 | 1 | 3 | 3.33 | 13 |
| E14 | Collaboration, approvals and workflow | R2 | 3 | 2 | 1 | 3 | 2.33 | 14 |
| E15 | Partner and consultant console | R2 | 4 | 5 | 1 | 2 | 5.50 | 15 |
| E16 | HRIS connector framework | R3 | 4 | 2 | 2 | 5 | 2.40 | 16 |
| E17 | Enterprise security, residency and key management | R3 | 4 | 3 | 2 | 5 | 2.20 | 17 |
| E18 | Privacy operations and compliance tooling | R3 | 3 | 2 | 1 | 3 | 2.33 | 18 |
| E19 | AI scenario recommendation and structural optimisation | R4 | 5 | 5 | 1 | 4 | 3.00 | 19 |
| E20 | Benchmarking | R4 | 3 | 2 | 1 | 3 | 2.33 | 20 |
| E21 | Activity and work analysis | R4 | 3 | 3 | 1 | 5 | 1.60 | 21 |
| E22 | Target operating model artefacts | R4 | 3 | 2 | 1 | 3 | 2.33 | 22 |

Note that E15, the partner console, scores unusually well. This is precisely because the workspace primitive in E01 has already done the hard work. It is a high-value, high-differentiation epic that costs very little once the foundation is right. This is the pattern the whole roadmap is designed to produce.

---

## 5. The Release Train

### Release 0: Platform Spine
**Sprints 1 to 3. Not sellable. Do not skip.**
Tenancy, canonical model, hierarchy, audit, deployment pipeline. The output is an application with no user-facing features that can nonetheless hold a client's data safely, prove cross-tenant isolation under test, and traverse a hundred thousand node hierarchy in under a second.

### Release 1: "Design" Edition
**Sprints 4 to 10. The first commercially sellable product.**
Ingest, visualise, analyse spans and layers, model scenarios, cost them, export a board pack, and query the organisation in natural language. This is a complete organisation design tool. It is sellable to a mid-market head of organisation design, and it is immediately usable as a delivery accelerator on a consulting engagement.

The commercial claim at this point is: *from a spreadsheet to a costed to-be structure and a board pack, in an afternoon.*

### Release 2: "Plan" Edition
**Sprints 11 to 18.**
Job and role architecture, skills taxonomy, strategic workforce planning, severance and cost-out tracking, collaboration, and the partner console. This turns a design tool into a planning platform and opens the consultancy channel.

### Release 3: "Enterprise" Edition
**Sprints 19 to 25.**
HRIS connectors, regional data planes, customer-managed keys, dedicated tenancy, and privacy operations. This is the release that makes the product sellable to a regulated financial services buyer. It should be pulled forward only against a named, committed enterprise prospect, never speculatively.

### Release 4: "Intelligence" Edition
**Sprints 26 onwards.**
AI structural optimisation, benchmarking, activity analysis, and target operating model artefacts. These are margin and moat, not entry ticket.

---

## 6. Epics and User Stories in Build Order

Story identifiers are stable. Points are in brackets. Priority is Must, Should or Could within its release.

---

### E01. Tenancy, Workspace, Identity and Access
**Release 0. Rank 1. Blocks everything.**

The single most important architectural decision in the product is made here. A **tenant** is a paying customer. A **workspace** is an isolated data environment beneath a tenant. An ordinary customer has one workspace. A consultancy has one per client engagement. Every table carries both identifiers from the first migration.

| ID | User story | Acceptance criteria | Pts | Pri |
|---|---|---|---|---|
| E01-01 | As the platform, I enforce tenant and workspace isolation on every table so that no query can ever cross a boundary. | Every table has non-null `tenant_id` and `workspace_id`. PostgreSQL row-level security policies applied and set to fail closed. Tenant context derived only from the authenticated session, never from a request parameter. An automated test suite proves that a user of Tenant A receives zero rows from Tenant B across every endpoint. | 8 | Must |
| E01-02 | As an administrator, I invite users and assign roles so that access is controlled. | Roles of Owner, Administrator, Designer, Analyst, Viewer. Role-based access control enforced server side, not in the user interface. Invitation, acceptance and revocation flows. | 5 | Must |
| E01-03 | As an administrator, I restrict who can see sensitive fields so that salary and performance data are protected. | Attribute-based access control at column level. Salary, performance rating and personal identifiers are individually permissible. A user without the permission receives a masked value, not an error, so that aggregate views still function. | 8 | Must |
| E01-04 | As a consultant, I work with pseudonymised data by default so that client confidentiality is preserved. | A workspace-level setting replaces names and identifiers with stable pseudonyms for a given role. Re-identification requires an explicit, logged, client-authorised elevation. | 5 | Must |
| E01-05 | As an enterprise administrator, I sign in via my identity provider. | SAML 2.0 and OpenID Connect single sign-on. Just-in-time provisioning. Multi-factor authentication enforced for administrator roles. | 5 | Should |
| E01-06 | As a security engineer, I know sessions are safe. | Short-lived access tokens with refresh rotation, secure cookie flags, idempotent logout, session revocation on role change. | 3 | Must |

**Dependency note.** E01-01 must complete before any other table is created anywhere in the product. Nothing else in this document may begin until it is merged.

---

### E02. Canonical Data Model and Hierarchy Engine
**Release 0. Rank 2. Blocks E04 to E22.**

| ID | User story | Acceptance criteria | Pts | Pri |
|---|---|---|---|---|
| E02-01 | As the platform, I store the canonical entities so that all features share one model. | Entities for Person, Position, Job, Role, OrgUnit, Location, CostCentre, Skill, Activity. Each has a mandatory external identifier and a system-generated internal identifier. Each supports arbitrary custom properties in a JSONB column, giving a schemaless extension path without abandoning relational integrity. | 8 | Must |
| E02-02 | As the platform, I effective-date every record so that history and future state are both representable. | Every entity and relationship carries `valid_from` and `valid_to`. All reads are as-at a date, defaulting to today. A record can be superseded without being destroyed. | 8 | Must |
| E02-03 | As the platform, I traverse hierarchies at speed so that visualisation and analytics are fast. | A materialised closure table maintained transactionally on write. Ancestor, descendant, depth and subtree queries execute in under 100 milliseconds on a 100,000 node dataset. Recursive common table expressions used only for maintenance, not for hot reads. | 13 | Must |
| E02-04 | As the platform, I detect structural defects so that bad data cannot corrupt the model. | Cycle detection rejects a change that would create a loop. Orphans and multiple roots are permitted but flagged, not blocked, because real client data always contains them. | 5 | Must |
| E02-05 | As the platform, I separate a person from the position they occupy so that vacancy and dual-incumbency are representable. | A Position exists independently of a Person. A Position may be vacant. A Person may occupy more than one Position with fractional full-time equivalent apportionment. The hierarchy is a hierarchy of Positions, not of People. | 8 | Must |

**Design note on E02-05.** This is the distinction that separates a serious organisation design tool from an org chart drawing tool. It cannot be added later without rewriting the hierarchy engine, the scenario engine and every cost calculation.

---

### E03. Audit Trail and Change History
**Release 0. Rank 5.**

| ID | User story | Acceptance criteria | Pts | Pri |
|---|---|---|---|---|
| E03-01 | As a compliance officer, I see every change ever made. | An append-only change log capturing actor, timestamp, workspace, entity, operation, and the before and after state. Written in the same database transaction as the change itself, so it cannot be bypassed. | 8 | Must |
| E03-02 | As an analyst, I see what has changed since the last baseline. | A computed change flag per node indicating created, updated, moved or deleted relative to a chosen reference point. Surfaced in the chart as conditional formatting. | 3 | Should |
| E03-03 | As a compliance officer, I export the audit log. | Filterable by date, actor and entity. Exportable to comma-separated values. Immutable and tamper-evident. | 3 | Should |

---

### E04. Data Ingestion and Preparation
**Release 1. Rank 6. The primary differentiator against Orgvue.**

The evidenced weakness of the incumbent is the data preparation burden. This epic is where the product wins or loses. Treat it as a first-class product surface, not as a utility.

| ID | User story | Acceptance criteria | Pts | Pri |
|---|---|---|---|---|
| E04-01 | As an analyst, I upload a spreadsheet and see my organisation. | Comma-separated values and Excel accepted up to 100 megabytes and 250,000 rows. Streaming parse, no full file in memory. Column type inference. A preview of the first 100 rows before commitment. | 8 | Must |
| E04-02 | As an analyst, the system proposes the field mapping for me. | An AI-assisted mapping step proposes a target canonical field for each source column, with a confidence score and an explanation. At least 80 percent of standard fields correctly auto-mapped on typical human resources extracts. Every proposal is overridable. The mapping is saved as a reusable named template. | 8 | Must |
| E04-03 | As an analyst, duplicate records are found and resolved. | Configurable match keys. Fuzzy matching on name, email and employee identifier with a confidence score. A review queue presenting merge, keep-both or reject, with every decision written to the audit log. | 8 | Must |
| E04-04 | As an analyst, I see the quality of my data before I trust it. | A validation pass flagging orphans, missing managers, cycles, negative or zero full-time equivalent, duplicate identifiers, positions without cost centres, and salary outliers. Output is a data quality score out of 100 and a downloadable exception report. | 8 | Must |
| E04-05 | As an analyst, I fix problems without leaving the tool. | Exceptions are resolvable in place through an inline editing grid. Resolutions are audited. The quality score recalculates live. | 5 | Should |
| E04-06 | As an analyst, I refresh my data without redoing the mapping. | Re-upload against a saved mapping template. A differential report shows joiners, leavers and movers before commitment. | 5 | Should |

**The commercial claim this epic must support.** A client sends a messy human resources extract at ten in the morning. By eleven, there is a validated, costed, navigable organisation. If the build does not achieve that, the epic is not done.

---

### E05. Organisation Visualisation at Scale
**Release 1. Rank 7.**

| ID | User story | Acceptance criteria | Pts | Pri |
|---|---|---|---|---|
| E05-01 | As a user, I navigate a large organisation without lag. | Rendering via canvas or WebGL, not scalable vector graphics. Server-side layout precomputation, cached. Client-side virtualisation of off-screen nodes. Target of 60 frames per second panning and zooming on a 100,000 node dataset on a mid-specification laptop. Initial render of a 5,000 node subtree in under one second. | 13 | Must |
| E05-02 | As a user, I choose how the organisation is drawn. | Layouts of vertical tree, horizontal tree, compact tree and grouped or matrix view. Collapse and expand of subtrees. Focus on a node and drill down. | 8 | Must |
| E05-03 | As a user, I colour and size the chart by any measure. | Conditional formatting driven by any measure from E06. A legend. Node cards configurable to show chosen properties. | 5 | Must |
| E05-04 | As a user, I filter and search. | Full text search across properties. Filter builder with multiple conditions. The chart responds to the filter without a full reload. | 5 | Must |
| E05-05 | As a user, I export the chart. | Portable Network Graphics, Scalable Vector Graphics and native PowerPoint shapes, so that the chart remains editable in a deck. | 5 | Should |

**Design note on E05-01.** Orgvue's evidenced weakness is that it consumes the local machine's resources and degrades on large datasets. Server-side layout with client virtualisation is the specific technical bet that beats this. Prove it with a synthetic 100,000 node dataset in Sprint 1 as a spike, before committing to the rest of the release. If the bet fails, the entire performance positioning fails, and it is far cheaper to learn that in week two than in month five.

---

### E06. Measure Engine and Spans and Layers Analytics
**Release 1. Rank 3. Highest score in the register.**

This epic delivers a visible feature, spans and layers, but its real purpose is to build the calculation substrate on which cost modelling, workforce planning, benchmarking and the AI layer all depend.

| ID | User story | Acceptance criteria | Pts | Pri |
|---|---|---|---|---|
| E06-01 | As the platform, I evaluate any measure declaratively. | A measure is defined as a named declarative specification comprising an aggregation, a filter, a scope such as node, subtree or whole organisation, and an as-at date. The engine evaluates any measure against any scope in any scenario without bespoke code. New analytics are added as definitions, not as features. | 13 | Must |
| E06-02 | As an analyst, I see span of control and layers automatically. | Automatically derived measures per node for span of control, direct reports, total descendants, depth, layer index, height and management ratio. Available immediately on data load with no configuration. | 5 | Must |
| E06-03 | As an analyst, I set targets and see breaches. | Configurable target spans and maximum layers, settable globally and overridable by function or grade. Nodes breaching a guardrail are highlighted in the chart and listed in an exception panel. | 5 | Must |
| E06-04 | As an analyst, I understand my structure at a glance. | A structural summary showing distribution of spans, count by layer, manager to individual contributor ratio, count of single-report managers, and count of layers to the deepest node. | 5 | Must |
| E06-05 | As a power user, I write my own measure. | A no-code measure builder for the common cases and a safe, sandboxed expression syntax for the remainder. Critically, no proprietary language is required for the standard 80 percent of tasks, directly addressing the learning-curve weakness of the incumbent. | 8 | Should |

---

### E07. Scenario Engine: Branch, Edit, Compare, Merge
**Release 1. Rank 4. Blocks all modelling.**

| ID | User story | Acceptance criteria | Pts | Pri |
|---|---|---|---|---|
| E07-01 | As the platform, a scenario is a copy-on-write overlay. | A scenario stores only the delta from its parent. Reads resolve baseline plus overlay at query time. Creating a scenario on a 100,000 node dataset is instantaneous and consumes negligible storage. A scenario may branch from the baseline or from another scenario. | 13 | Must |
| E07-02 | As a designer, I restructure the organisation directly on the chart. | Drag a position to a new manager. Create, delete and vacate positions. Change grade, cost centre, location and full-time equivalent. Bulk edit a selection. Every edit is confined to the active scenario and never touches the baseline. Undo and redo. | 13 | Must |
| E07-03 | As a designer, I compare scenarios side by side. | Two or more scenarios compared on headcount, cost, spans, layers and any other measure. A delta view showing every changed position. Comparison exportable. | 8 | Must |
| E07-04 | As a designer, I see the financial impact of an edit immediately. | Any structural edit recomputes affected measures, including cost, within two seconds. Achieved by invalidating only the affected subtree, not the whole dataset. | 8 | Must |
| E07-05 | As a programme lead, I lock and approve a scenario. | A scenario can be locked against further editing, submitted for approval, approved or rejected with a comment, and marked as the agreed target. | 5 | Should |
| E07-06 | As a programme lead, I promote a scenario to the new baseline. | Merge a scenario into the baseline with conflict detection where the baseline has moved on. Fully audited and reversible. | 8 | Could |

**Sequencing note.** E07-01 must be merged before E07-02. Building the editing surface first against baseline tables, with the intention of adding scenarios afterwards, is the single most expensive mistake available in this project and would cost an estimated four to six sprints of rework.

---

### E08. Workforce Cost Modelling Core
**Release 1. Rank 8.**

| ID | User story | Acceptance criteria | Pts | Pri |
|---|---|---|---|---|
| E08-01 | As a finance partner, I see fully loaded cost. | Cost built up from base salary, employer on-costs by country, benefits, bonus and an allocable overhead. The build-up is configurable and transparent. Vacant positions cost at a configurable rate, either budgeted or zero. | 8 | Must |
| E08-02 | As a finance partner, I work in multiple currencies. | Per-record currency with a configurable rate table and effective dates. All aggregates presented in a chosen reporting currency. | 5 | Must |
| E08-03 | As a designer, I see the cost of my target structure against the baseline. | Cost roll-up for any node, subtree, function, location or cost centre, in any scenario, with a delta against baseline in absolute and percentage terms. | 5 | Must |
| E08-04 | As a finance partner, I model cost by grade rather than by individual. | Where individual salary is unavailable or restricted, cost can be modelled from a grade midpoint table. This is essential, because consultants frequently do not receive individual salary data. | 5 | Must |
| E08-05 | As a finance partner, I set a cost-out target and track against it. | A target saving expressed in currency, percentage or headcount. Live tracking of the active scenario against the target, with a shortfall or surplus indicator. | 5 | Should |

---

### E09. Reporting, Dashboards and Export
**Release 1. Rank 9.**

| ID | User story | Acceptance criteria | Pts | Pri |
|---|---|---|---|---|
| E09-01 | As a user, I export a board-ready pack. | A single action producing a PowerPoint deck containing the chart, structural summary, cost summary, scenario comparison and exceptions. Native editable shapes and tables, not images, wherever feasible. Branded to the workspace. | 13 | Must |
| E09-02 | As an analyst, I export to Excel. | Any grid, measure set or comparison exported to a formatted workbook with the underlying data on a separate sheet so the client can rebuild the numbers. | 5 | Must |
| E09-03 | As a leader, I have a dashboard. | A configurable dashboard of measure tiles, distributions and comparisons, scoped to a chosen part of the organisation. | 8 | Should |
| E09-04 | As a leader, I receive a scheduled report. | Recurring generation and email delivery of a chosen pack or dashboard. | 5 | Could |

**Note on E09-01.** For a consulting-led product this is not a nice to have. The output artefact of an organisation design engagement is a deck. A tool that produces the deck automatically saves a consultant days per engagement and is the clearest articulation of value in a demonstration.

---

### E10. Natural Language Querying and Semantic Layer
**Release 1. Rank 10. The flagship AI differentiator.**

| ID | User story | Acceptance criteria | Pts | Pri |
|---|---|---|---|---|
| E10-01 | As the platform, I expose a semantic layer to the language model. | A constrained tool schema through which a model may compose measures, filters and scopes. The model never emits free-form structured query language. Every tool call is validated, parameterised, tenant-scoped and rate-limited. | 8 | Must |
| E10-02 | As a user, I ask a question in plain English. | A question such as "which functions have an average span below six?" returns a filtered chart, a supporting table and a short written answer. Every figure in the answer is traceable to the underlying records. | 8 | Must |
| E10-03 | As a user, I trust what the model tells me. | The answer cites the measure definitions and record counts used. Where the model cannot answer from the data, it says so rather than inferring. Prompt injection through record content is guarded against, because a malicious job title in an uploaded file is an attack vector. | 5 | Must |
| E10-04 | As a consultant, I generate the commentary for my board pack. | Narrative generation from a scenario comparison, producing a first-draft written commentary on the structural and financial deltas. Human editable. Never inserted into an export without review. | 5 | Should |
| E10-05 | As a customer, my data never trains a shared model. | Contractual and technical guarantee. No customer data used for training. Per-tenant isolation of all model context. Documented in the trust centre. | 3 | Must |

---

### E11. Job and Role Architecture and Skills Taxonomy
**Release 2. Rank 11.**

| ID | User story | Acceptance criteria | Pts | Pri |
|---|---|---|---|---|
| E11-01 | As a practitioner, I build a job architecture. | Job families, sub-families, role families and levels. Positions mapped to roles, roles to job families. Bulk mapping tools. | 8 | Must |
| E11-02 | As a practitioner, the system proposes the architecture for me. | AI clustering of positions into candidate roles and job families based on titles, reporting lines, cost centres and any available job descriptions. Proposals are reviewable and editable, never applied automatically. | 8 | Must |
| E11-03 | As a practitioner, I manage a skills taxonomy. | Create, import and maintain skills with proficiency scales. Attach skills to roles and to people. | 8 | Must |
| E11-04 | As a practitioner, I align to an external framework. | Import and mapping to ESCO, O*NET and SFIA. A crosswalk between the client taxonomy and the standard framework. | 8 | Should |
| E11-05 | As a practitioner, I generate a job description. | AI generation of a first-draft job description from the role, its skills, its level and its position in the structure. Editable. Exportable. | 5 | Should |
| E11-06 | As a practitioner, I see my skills gaps. | Required skills by role against held skills by incumbent. Gap by skill, by role, by function and by location. | 8 | Must |

---

### E12. Strategic Workforce Planning
**Release 2. Rank 12. Highest effort in the roadmap.**

This is the epic where the incumbent is evidenced as weakest, specifically on forward-looking supply including turnover, requisitions and planned headcount. It is also the largest single body of work. It is deliberately placed after the measure engine, because supply, demand and gap are simply time-series measures and should require no new calculation infrastructure.

| ID | User story | Acceptance criteria | Pts | Pri |
|---|---|---|---|---|
| E12-01 | As a planner, I define planning groups. | Grouping of positions by role cluster, function, location or any property. Planning horizon and period configurable, typically monthly or quarterly over one to five years. | 5 | Must |
| E12-02 | As a planner, I forecast supply. | Opening headcount, less attrition modelled from historical rates or an assumption, less retirements from age profile, plus confirmed joiners, plus open requisitions with a fill probability and lead time. Output is supply by period by planning group. | 13 | Must |
| E12-03 | As a planner, I forecast demand. | Driver-based demand using volume drivers, ratio drivers and project-based drivers. For example, one adviser per 250 accounts. Drivers are editable assumptions. | 13 | Must |
| E12-04 | As a planner, I see my gap. | Supply less demand by period, by planning group, by skill. Surplus and deficit both surfaced. Visualised as a time series. | 8 | Must |
| E12-05 | As a planner, I close the gap. | Actions of hire, reskill, redeploy, contract or attrit, each with a cost, a lead time and a capacity constraint. The plan recomputes the gap after actions. | 13 | Must |
| E12-06 | As a planner, I test assumptions. | Planning scenarios reusing the E07 scenario engine, so that an optimistic, base and pessimistic case can be compared without new infrastructure. | 5 | Must |
| E12-07 | As a planner, I track plan against actual. | Once a plan is baselined, actual headcount and cost by period are compared against plan, with variance surfaced. | 8 | Should |

---

### E13. Severance Modelling and Cost-Out Tracking
**Release 2. Rank 13.**

| ID | User story | Acceptance criteria | Pts | Pri |
|---|---|---|---|---|
| E13-01 | As a programme lead, I cost a redundancy. | Statutory and enhanced severance formulae, configurable by country, with inputs of service, age, notice, salary and any enhancement multiplier. Applied to any position marked for removal in a scenario. | 13 | Must |
| E13-02 | As a programme lead, I see the payback. | One-off cost of change against annualised saving, producing a payback period and a net present value over a chosen horizon. | 5 | Must |
| E13-03 | As a programme lead, I phase the programme. | Positions removed in tranches with dated effect. Cash flow of severance out and salary saving in, by month. | 8 | Must |
| E13-04 | As a programme lead, I protect this data. | Severance and selection data are subject to the strictest field-level permissions, are masked by default even for administrators, and generate a distinct audit event on every access, not merely on every change. Exports are watermarked. | 8 | Must |

**Note on E13-04.** This is an access-logged, not merely change-logged, dataset. It is the most sensitive data the platform will ever hold, and a leak of it is a market-moving event for a listed client. The access-log requirement should be treated as non-negotiable.

---

### E14. Collaboration, Approvals and Workflow
**Release 2. Rank 14.**

| ID | User story | Acceptance criteria | Pts | Pri |
|---|---|---|---|---|
| E14-01 | As a team, we comment on the design. | Threaded comments on a node, a scenario or a measure. Mentions and notification. Resolution. | 5 | Should |
| E14-02 | As a programme lead, I route a design for approval. | Configurable approval workflow with named approvers, a due date, and approve or reject with comment. Status visible on the scenario. | 8 | Should |
| E14-03 | As a divisional leader, I only see my division. | Scoped access to a subtree, so that a leader can design within their own area without seeing the rest of the organisation. Their changes roll up to a consolidated scenario. | 8 | Should |

---

### E15. Partner and Consultant Console
**Release 2. Rank 15. High value, low effort, because E01 did the work.**

| ID | User story | Acceptance criteria | Pts | Pri |
|---|---|---|---|---|
| E15-01 | As a consultancy, I create an isolated client workspace in minutes. | A partner tenant can create, name, brand and configure a client workspace. Data is isolated from every other workspace under the same partner. Creation takes under five minutes with no involvement from the vendor. | 5 | Must |
| E15-02 | As a consultancy, I archive and destroy a workspace at the end of an engagement. | A workspace can be archived, exported in full to the client, and then securely destroyed with a certificate of destruction. This directly answers a client data protection concern and is a sales asset. | 5 | Must |
| E15-03 | As a consultancy, I reuse my intellectual property across clients. | Templates for measures, mappings, benchmarks, dashboards and board packs are held at partner level and instantiated into a client workspace. This is the compounding asset that makes the consultant a repeat user. | 8 | Must |
| E15-04 | As a consultancy, I white-label the output. | Partner branding on the interface and on every export. | 3 | Should |
| E15-05 | As a consultancy, I am billed on active workspaces. | Usage metering by active workspace and by record volume, supporting the partner pricing model. | 5 | Should |

---

### E16. HRIS Connector Framework
**Release 3. Rank 16.**

| ID | User story | Acceptance criteria | Pts | Pri |
|---|---|---|---|---|
| E16-01 | As the platform, I have a connector framework. | A common abstraction for authentication, extraction, mapping, scheduling and error handling, so that each new connector is configuration rather than a new codebase. | 13 | Must |
| E16-02 | As a customer, I connect Workday. | OAuth connection, scheduled synchronisation, incremental extraction, mapping preserved across refreshes. Read only in this release. | 13 | Must |
| E16-03 | As a customer, I connect SAP SuccessFactors. | As above. | 8 | Should |
| E16-04 | As a customer, I connect Oracle HCM or a generic secure file transfer feed. | As above. A secure file transfer connector serves the long tail of systems and should be built first as it is cheap and covers many clients. | 8 | Should |
| E16-05 | As a developer, I use the public application programming interface. | A documented representational state transfer interface with OAuth 2.0, covering read and write of all canonical entities. Webhooks on data and scenario events. | 13 | Should |

---

### E17. Enterprise Security, Residency and Key Management
**Release 3. Rank 17. Pull forward only against a committed enterprise deal.**

| ID | User story | Acceptance criteria | Pts | Pri |
|---|---|---|---|---|
| E17-01 | As an enterprise customer, my data stays in my region. | Control plane and data plane separated. A tenant registry records the home region of each workspace. Requests route to the correct regional data plane. Backups remain in region. Initial regions of United Kingdom and European Union, with United States, Canada, Australia, Singapore and the Middle East added on demand. | 21 | Must |
| E17-02 | As a global customer, my subsidiary data respects local rules. | Per-workspace region pinning, so that a parent tenant may hold a European Union workspace and a Singapore workspace whose data never leaves their respective regions. Only lawful aggregated roll-ups surface to the global view. | 13 | Should |
| E17-03 | As a regulated customer, I control the encryption keys. | Customer-managed keys, with the customer able to revoke access. Keys held in the customer's own key management service. | 13 | Should |
| E17-04 | As a regulated customer, I have hard isolation. | An option for a dedicated database or dedicated schema per tenant, offered as a premium tier, in place of the default shared schema with row-level security. | 13 | Should |
| E17-05 | As a security buyer, I can complete my due diligence. | A trust centre containing the penetration test summary, certifications, sub-processor list, data flow diagrams and a completed standard security questionnaire. This is a sales asset and materially shortens enterprise sales cycles. | 5 | Must |

---

### E18. Privacy Operations and Compliance Tooling
**Release 3. Rank 18.**

| ID | User story | Acceptance criteria | Pts | Pri |
|---|---|---|---|---|
| E18-01 | As a data protection officer, I fulfil a subject access request. | Search by individual, export of all personal data held, in a machine-readable format, within the workspace. | 8 | Must |
| E18-02 | As a data protection officer, I erase an individual. | Erasure with referential integrity preserved, so that the structure survives but the person is removed or irreversibly anonymised. Audit of the erasure retained. | 8 | Must |
| E18-03 | As a data protection officer, I enforce retention. | Workspace-level retention policy with automatic deletion at expiry and a certificate of destruction. | 5 | Must |
| E18-04 | As a data protection officer, I evidence lawful processing. | A record of processing activities, a data protection impact assessment template, and configurable controls to support works council consultation in European jurisdictions. | 5 | Should |
| E18-05 | As an analyst, special category data is handled correctly. | Diversity data is stored separately, is available only in aggregate above a configurable minimum group size to prevent re-identification, and is never surfaced at individual level in a design view. | 8 | Must |

---

### E19. AI Scenario Recommendation and Structural Optimisation
**Release 4. Rank 19. The moat.**

| ID | User story | Acceptance criteria | Pts | Pri |
|---|---|---|---|---|
| E19-01 | As a designer, the system proposes a better structure. | Given target spans, maximum layers and constraints such as protected roles or locations, the system proposes a restructured hierarchy. Output is a scenario, not a change, so the human decides. Rationale and financial impact presented alongside. | 21 | Must |
| E19-02 | As a designer, the system finds the savings. | Given a cost-out target, the system proposes candidate structural options meeting the target, ranked by disruption and by risk. | 13 | Must |
| E19-03 | As an analyst, the system flags what looks wrong. | Anomaly detection across pay against grade, span against peer, title against level, and duplicate function across units. | 8 | Should |
| E19-04 | As a leader, I ask the system what it would do. | Conversational exploration of the organisation and its scenarios, grounded strictly in the tenant's data through the E10 semantic layer. | 8 | Should |

---

### E20. Benchmarking
**Release 4. Rank 20.**

| ID | User story | Acceptance criteria | Pts | Pri |
|---|---|---|---|---|
| E20-01 | As an analyst, I benchmark internally. | Comparison of a business unit against the organisation's own distribution on spans, layers, cost and ratios. | 5 | Must |
| E20-02 | As an analyst, I benchmark externally. | Anonymised, aggregated cross-customer benchmarks, subject to a minimum sample size and to explicit customer opt-in. This is a compounding data asset and a genuine long-term moat, but it must not be built without unambiguous contractual permission. | 13 | Should |
| E20-03 | As an analyst, I use external labour market data. | Optional integration with an external labour market data provider for salary and skills supply data. | 8 | Could |

---

### E21. Activity and Work Analysis
**Release 4. Rank 21.**

| ID | User story | Acceptance criteria | Pts | Pri |
|---|---|---|---|---|
| E21-01 | As a practitioner, I survey how work is done. | Survey instrument distributed to individuals or teams capturing activities and time allocation. Response tracking and chasing. | 13 | Must |
| E21-02 | As a practitioner, I see the cost of work. | Activity time multiplied by fully loaded cost, rolled up by activity, process, unit and location. | 8 | Must |
| E21-03 | As a practitioner, I find duplication. | Identification of the same activity performed in multiple units, with the associated cost of duplication. | 8 | Must |
| E21-04 | As a practitioner, I assess automation potential. | Tagging of activities for automation or augmentation potential, with an AI-assisted first pass, producing an addressable cost pool. This is highly saleable in the current market. | 8 | Should |

---

### E22. Target Operating Model Artefacts
**Release 4. Rank 22.**

| ID | User story | Acceptance criteria | Pts | Pri |
|---|---|---|---|---|
| E22-01 | As a practitioner, I record design principles. | A register of design principles with rationale, against which scenarios can be assessed. | 3 | Should |
| E22-02 | As a practitioner, I map capabilities. | A capability model linked to org units, positions and cost, so that cost can be viewed by capability rather than by structure. | 13 | Should |
| E22-03 | As a practitioner, I define accountabilities. | A responsibility assignment matrix linked to positions and to capabilities or processes. | 8 | Should |
| E22-04 | As a practitioner, my operating model connects to my structure. | Traceability from a design principle, through a capability, to a position, to a cost. This closes the loop between the target operating model and the organisation design, which is a genuine and rare capability. | 8 | Could |

---

## 7. Sprint Plan

Two-week sprints at an assumed capacity of 30 points.

| Sprint | Focus | Principal stories | Exit criterion |
|---|---|---|---|
| **0** | Spike and de-risk | Performance spike on 100,000 node rendering. Scenario overlay proof of concept. Infrastructure as code baseline. | The performance bet is proven or the architecture is changed. Do not proceed until it is proven. |
| **1** | Tenancy | E01-01, E01-02, E01-06 | Automated test proves zero cross-tenant leakage on every endpoint. |
| **2** | Data model | E02-01, E02-02, E02-05 | Positions and people are separable and effective-dated. |
| **3** | Hierarchy and audit | E02-03, E02-04, E03-01 | 100,000 node subtree query under 100 milliseconds. Every change logged. |
| **4** | Ingestion | E04-01, E04-02 | A messy spreadsheet becomes a validated organisation. |
| **5** | Ingestion and quality | E04-03, E04-04, E04-05 | Data quality score and in-place remediation working. |
| **6** | Measure engine | E06-01, E06-02 | Spans and layers derive automatically from a declarative measure. |
| **7** | Visualisation | E05-01, E05-02, E05-03 | The chart is fast and beautiful at scale. |
| **8** | Scenarios | E07-01, E07-02 | Copy-on-write branching and on-chart restructuring. |
| **9** | Cost and comparison | E08-01, E08-03, E07-03, E07-04 | Costed scenario comparison with sub-two-second recompute. |
| **10** | Export and AI query | E09-01, E10-01, E10-02 | A board pack in one click. A question answered in English. **Release 1 ships.** |
| **11 to 12** | Job and role architecture | E11-01 to E11-03, E11-06 | Roles, skills and gaps. |
| **13 to 15** | Workforce planning | E12-01 to E12-06 | Supply, demand, gap and closure actions. |
| **16** | Severance and cost-out | E13-01 to E13-04 | Costed, phased, access-logged restructuring. |
| **17** | Partner console | E15-01 to E15-03 | A client workspace in five minutes. |
| **18** | Collaboration and hardening | E14-01 to E14-03, E08-05, E12-07 | **Release 2 ships.** |
| **19 to 21** | Connectors | E16-01, E16-04, E16-02 | Secure file transfer and Workday connected. |
| **22 to 25** | Enterprise and compliance | E17-01, E17-05, E18-01 to E18-03, E18-05 | **Release 3 ships.** Sellable to financial services. |
| **26 onwards** | Intelligence | E19, E20, E21, E22 | Moat. |

**Release 1 lands at the end of Sprint 10, approximately five and a half months from Sprint 1, with Sprint 0 in front of it.** That is the first date on which revenue is possible and the first date on which the tool can be used on a live engagement.

---

## 8. The Cut Lines

The following are explicitly out of scope for Release 1, and the discipline of holding these lines is what protects the date.

- No write-back to any human resources information system. Read only until Release 3 at the earliest. Write-back is where connector projects go to die.
- No mobile application. A responsive web interface only.
- No custom expression language for end users. The no-code measure builder plus natural language covers Release 1. Power-user expressions are Release 2 at the earliest.
- No benchmarking. It requires customers before it is possible.
- No activity surveys. They are a separate product surface and can be sold later.
- No multi-region deployment. One region, the United Kingdom or the European Union, until a customer pays for another.
- No customer-managed keys until an enterprise deal requires them.
- No public application programming interface until Release 3.

---

## 9. Definition of Done

A story is not done until all of the following are true.

1. Tenant and workspace isolation is enforced and tested for any new table or endpoint.
2. Automated tests cover the happy path and the principal failure modes.
3. Any change to data is written to the audit log in the same transaction.
4. Any new field containing personal data is classified, and its access permission is defined.
5. Performance is measured against a synthetic 100,000 record dataset, not against a toy dataset.
6. The feature works correctly inside a scenario, not only against the baseline.
7. Documentation exists sufficient for a consultant to use the feature without training.

Point six is the one most often missed and the most expensive to fix retrospectively.

---

## 10. Schedule Risks

| Risk | Impact | Mitigation |
|---|---|---|
| The rendering performance bet fails at 100,000 nodes. | Severe. The entire performance positioning against the incumbent collapses. | Sprint 0 spike. Prove it before anything else is built. Fallback is aggressive server-side subtree pagination, which is a weaker but viable product. |
| Scenario overlay resolution proves too slow at read time. | Severe. Rework of the core data layer. | Sprint 0 proof of concept. Fallback is materialised scenario snapshots with a background recompute, which costs storage but preserves the feature. |
| Data ingestion quality is worse than promised on real client data. | High. The primary differentiator is the claim of fast time to value. | Test against three genuinely messy real extracts, appropriately anonymised and with permission, before the end of Sprint 5. Synthetic data will flatter the mapper and hide the problem. |
| Workforce planning, epic E12, is underestimated. | Medium. It is the largest epic and the most conceptually intricate. | It is deliberately placed after the measure engine so that it requires no new calculation infrastructure. If it slips, Release 2 ships without it and it becomes Release 2.1. |
| Scope creep from a first design-partner client. | High. The most common cause of failure in a consultant-built product. | Every client request is triaged against this backlog. Bespoke work is refused or is priced as services and kept out of the product. |
| The legal position on intellectual property is unresolved. | Terminal. | This is a gating item, not a risk to be managed. See below. |

---

## 11. The Gating Item

No sprint in this plan should begin until independent legal advice has been obtained on the intellectual property, disclosure and conflict-of-interest provisions of the existing employment contract. Under English law, intellectual property created by an employee in the course of employment vests by default in the employer, and work created outside working hours may still belong to the employer where it arises from the employee's normal duties. Building an organisation design tool while employed as a senior organisation design practitioner sits squarely in the zone where that argument would be made.

The practical consequences for this plan are as follows. Sprint 0 should not start until the position is clear. All work should be performed on personal equipment, on personal time, with documented separation from any employer or client material. No client data of any kind should touch the platform until both the legal position and the client's own data protection position are settled in writing.

This is not legal advice. It is a flag that the item is on the critical path and that everything downstream of it is contingent.
