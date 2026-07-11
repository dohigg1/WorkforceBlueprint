# Orgvue Analysis and a Build-Ready Specification for a Proprietary Competitor

## TL;DR
- Orgvue is the enterprise category leader in organisation design and workforce planning software, founded in 2008 as Concentra Analytics, private-equity backed (a £41m / roughly $55.86m growth-equity round led by One Peak in May 2018), used by more than 25 FTSE100 and S&P100 companies plus the Big Four consultancies; its evidenced weaknesses are high cost (a UK G-Cloud floor of £65,000), a steep learning curve, a heavy data-preparation burden, expression-language complexity (Gizmo) and licensing rigidity, which together define the whitespace for a leaner, AI-native, faster-to-value competitor.
- A viable competitor should be an AI-native, multi-tenant SaaS platform combining org design, workforce planning, cost modelling and skills/role architecture, differentiated on speed-to-value, transparent per-record pricing, a consultant partner tenancy model, and native AI (natural-language querying, automated span/layer optimisation, AI role architecture and board-pack narrative), built on a shared-schema-with-row-level-security core with region-pinned data planes for residency.
- The single most important caveat is legal: as a Capgemini Invent Senior Director, the user must obtain independent legal advice on IP ownership, moral rights and non-compete/conflict-of-interest clauses in his employment contract before building, because under UK law IP created in the course of employment vests by default in the employer.

## Key Findings

1. **Orgvue is a mature, well-funded category leader, not a soft target.** It was founded in 2008 by Rupert Morrison, rebranded from Concentra Analytics to Orgvue in April 2022, is private-equity backed, and acquired Dynaplan (Swiss-Norwegian strategic workforce planning) in December 2021 to add driver-based simulation. It is headquartered in London with offices in Philadelphia, The Hague, Toronto and Sydney, and is used by more than 25 FTSE100 and S&P100 companies and the leading consultancies.
2. **Its capability set is deep and broad**, spanning data harmonisation, organisation analysis, activity analysis, benchmarking, organisation modelling (position level and high level), strategic and operational workforce planning with a simulation engine, job architecture, skills gap analysis, talent intelligence, succession, monitoring and tracking, and (from December 2025) the Henshaw AI suite (Henshaw Roles for automated job architecture and Henshaw Assistant for natural-language querying).
3. **The evidenced weaknesses are consistent across review sites**: cost, a steep learning curve, complexity of the Gizmo expression language and permissions, performance degradation on very large datasets, a heavy data-preparation burden, and a workforce-planning module that some reviewers found less mature than its org-design core.
4. **The commercial model is opaque and enterprise-priced**: no public per-seat or per-record pricing; a UK G-Cloud 14 published band of £65,000 to £9,999,999 per unit; a real public-sector contract (Department for International Trade) of £136,080 over two years, extendable to £204,120 over three years (roughly £68,000 per year). Consultancies (Deloitte is the largest US strategic collaborator; PwC, Accenture, KPMG, Korn Ferry, Mercer and others are partners) use and resell it.
5. **The market is real and growing**: Mordor Intelligence puts workforce analytics at USD 2.52 billion in 2025 rising to USD 5.30 billion by 2030 at a 16.0 percent CAGR, while Grand View Research forecasts it reaching USD 5.53 billion by 2030 at 15.3 percent; Grand View also forecasts the HR analytics market rising from USD 2.95 billion in 2022 to USD 8.59 billion by 2030 at a 14.8 percent CAGR, with workforce planning the largest segment. Demand is powered by AI-driven workforce reshaping, cost-out programmes and spans-and-layers delayering.
6. **The competitive field is bifurcating** between expensive enterprise incumbents (Orgvue, Anaplan, Visier) and fast, cheap, AI-native challengers (Agentnoon, Functionly, ChartHop), leaving a gap for a tool that has enterprise depth AND challenger speed and pricing.

## Details

### PART 1: ORGVUE ANALYSIS

#### 1.1 Origins, ownership, funding and scale
Orgvue was created by Concentra Analytics, founded in 2008 by Rupert Morrison to bring data science to management practice. Its flagship product Orgvue became the company's identity, and in April 2022 the company rebranded from Concentra Analytics to Orgvue. In May 2018 it completed a £41m growth-equity round (reported by Crunchbase/CB Insights as $55.86m over two rounds, with the May 2018 round the principal event) led by One Peak Partners, with Morgan Stanley Expansion Capital, Connected Capital, Joseph Schull and existing shareholder City Securities participating; some aggregators cite total funding of around $66m. In December 2021 Concentra acquired Dynaplan, a Swiss-Norwegian strategic workforce planning software and services business, to add driver-based simulation to Orgvue's position-level modelling. The founder-CEO Rupert Morrison was succeeded by Martin Moran and then by Oliver Shaw (CEO from January 2023). Jessica Modrall is Chief Product Officer.

Scale indicators: the 1 May 2018 One Peak press release stated that "Concentra employs 170 people globally, with offices in London, Philadelphia, The Hague and opening in Hong Kong"; current headcount is reported by third-party aggregators at roughly 260 but is not confirmed by a primary source. It is headquartered in London with offices in Philadelphia, The Hague, Toronto and Sydney; customers include more than 25 FTSE100 and S&P100 companies and the leading global management consultancies; industries served include consumer products, energy and resources, financial services, insurance, life sciences, media and entertainment, retail, and UK public sector.

#### 1.2 Functional capability inventory
Orgvue organises its platform around four verbs: Analyse, Design, Plan, Monitor. Evidenced modules and features:
- **Data harmonisation and dataset building**: connects and cleans data from multiple systems into a single connected baseline; supports merge and union operations to add columns or rows; property mapping with standard and additional properties.
- **Organisation charting and visualisation**: multiple layouts, large-scale visualisation, story packs (sets of visualisations for presentation and re-use), works primarily in the browser using the local PC's resources.
- **Organisation analysis**: spans and layers, roles, costs, job architecture.
- **Activity analysis**: surveys (individual and team-based) to capture how work is done and time taken; cost of work analysis; duplication detection.
- **Organisation benchmarking**: internal, external and peer benchmarks; custom benchmarks.
- **Organisation modelling**: position-level design and high-level modelling (grouping by function, job family or grade); scenario creation and comparison; as-is versus to-be; instant financial impact.
- **Strategic and operational workforce planning**: added in 2022 as the "industry's first" combined solution; a simulation engine reveals supply and demand gaps over time; demand and supply forecasts by planning group using volume, project-based and ratio drivers; role clusters and role grids; annual position planning.
- **Job architecture**: role families, job families, job levelling.
- **Skills and competency analytics**: skills gap analysis, competency modelling from surveys or uploads.
- **Talent intelligence and succession**: turnover, automation and other workforce risks; talent selection and planning; succession planning.
- **Monitoring and tracking**: targets and guardrails, actuals versus plan, auto-generated reports.
- **AI (Henshaw AI, December 2025)**: Henshaw Roles auto-groups positions into roles, role clusters and job families; Henshaw Assistant is a natural-language querying interface. Both are in early access, with more capabilities promised through 2026. Uses dedicated language models.
- **Integrations**: connectors to core HR systems; Deloitte built a pre-built API connector to Workday HCM; a partner-built SAP SuccessFactors connector (Geconex); integration with Workday Adaptive Planning; a strategic partnership with Lightcast (March 2025) to embed labour-market data. Open API. Export to Excel and PowerPoint.

#### 1.3 Data model and architecture (as publicly evidenced)
Orgvue's data model is explicitly **schemaless**: it merges disparate datasets without a fixed schema. The core concept is the **dataset**, made up of **nodes** (each with a mandatory unique ID and an auto-generated 32-character GUID accessible as node._id) and **properties**. Datasets can be configured as **Flat** or **Hierarchical** (hierarchical requires a Parent ID property). The tenant structure can be **People Only** or **People, Positions and Links** (a three-dataset architecture).

Orgvue automatically creates **generated properties** (prefixed with an underscore), including _span_of_control, _depth, _layers, _height, _descendants_of, _is_orphan, _is_leaf, _is_duplicate, _is_ghost and _change (flags new or updated nodes since last save). These power spans-and-layers analytics natively. Calculated fields and queries are written in **Gizmo**, Orgvue's expression language (for example node._span_of_control, node.parent, node.filter()), which uses dot syntax on collections. Reviewers repeatedly cite Gizmo expression logic as powerful but hard to learn.

Versioning and scenario branching are handled through **views**, **drafts** and **prefiltered datasets** (data slices created with AND-combined filter buckets, controlled by permission tags such as filter-edit:alpha). The _change generated property provides an intrinsic change-tracking mechanism.

#### 1.4 User experience and personas
Primary personas: HR and organisation design practitioners, transformation teams, finance, workforce planners, and IT leadership, plus consultants. Orgvue is a browser-based application that uses local PC resources (it recommends a dual-core PC with a minimum of 8GB RAM, Chrome or Edge, and Excel/PowerPoint 2013 or greater for export). Strengths repeatedly praised: powerful, robust visualisations; speed to insight; data storytelling; handling large data volumes; strong org-design and as-is/to-be modelling. Weaknesses repeatedly cited: steep learning curve and non-intuitive advanced features; complexity of setting up security access at scale; performance degradation on very large datasets; expression (Gizmo) logic difficulty; and a workforce-planning capability that some found less robust than the org-design core (for example limited full forward views of turnover, requisitions and planned headcount). A third-party accessibility audit was performed by Deque and Orgvue is progressing its WCAG journey.

#### 1.5 Security, compliance and hosting
Delivered as SaaS on AWS. Hostable from AWS us-east-1 (North Virginia), eu-west-1 (Ireland) or ap-southeast-2 (Sydney); the customer selects the region and all data (including backups) stays in that region. Certifications: ISO 27001, ISO 27018 and CSA STAR (the November 2025 security provisions reference SOC 2 Type 2 annually, ISO 27001:2022, ISO 27018:2019 and CSA STAR Level 2). Encryption: TLS 1.3 in transit, AES-256 at rest, keys in AWS KMS on FIPS 140-3 validated HSMs, master keys rotated annually. Multi-tenanted with a single shared database architecture where customer data is logically segregated. Role-Based Access Control, column- and row-level permissions, SAML 2.0 single sign-on, MFA, IP allowlisting, full audit logs (who changed what, when, from which IP). Data-breach notification within 24 hours. A Data Protection Officer is appointed. By default Orgvue staff have no access to customer data; customers retain full ownership and control retention and deletion.

#### 1.6 Commercial model
Pricing is not published; quotes are custom. The strongest evidenced anchors come from UK public procurement: the G-Cloud 14 listing shows a published band of **£65,000 to £9,999,999 per unit**, and technical helpdesk, online resources, a customer success manager and community events are included in the subscription at no additional cost, while advisory and implementation are priced separately. A real contract, the Department for International Trade "OrgVue: Licenses and Support" call-off via G-Cloud 11, was **£136,080 over two years, extendable to £204,120 over three years** (roughly £68,000 per year), awarded October 2020 (supplier listed as Concentra Consulting). Third-party estimates put a small deployment first-year cost at $10,000–$75,000+ and enterprise well above $100,000, with implementation ($5,000–$50,000+), customisation, training and data-migration fees on top. No per-employee-record or per-seat rate card is publicly disclosed.

Consultancy model: Orgvue runs a formal partner programme. Deloitte is described as its largest strategic collaborator in the United States (alliance announced May 2022) and built a Workday connector; PwC added Orgvue to its human capital offerings; Accenture, KPMG, Korn Ferry, Mercer, WTW, Protiviti, FTI, West Monroe, Slalom and boutique OD firms (AlignOrg, Change Associates, Egremont, JCURV) are listed partners. Consultancies use Orgvue both as a delivery accelerator on engagements and as a resale/co-sell motion.

#### 1.7 Customer reviews, criticisms and gaps (the whitespace)
Across G2, Gartner Peer Insights, Capterra, GetApp, TrustRadius and third-party reviews, consistent themes:
- **Strengths**: visualisations, data storytelling, speed to insight, org-design and scenario modelling, handling large data, responsive support.
- **Weaknesses / whitespace**:
  - **Cost**: not the cheapest; enterprise-only pricing excludes mid-market.
  - **Complexity and learning curve**: advanced features and Gizmo expression logic are hard; onboarding requires process and training investment.
  - **Security/permissions setup** is complex at scale.
  - **Performance** degrades on large datasets.
  - **Data-preparation burden**: significant up-front data cleansing and harmonisation.
  - **Workforce planning depth**: some reviewers found it not robust enough for full forward-looking supply/demand including turnover, requisitions and planned headcount.
  - **Licensing rigidity** and enterprise-only orientation.
  - **Client-side dependency**: runs on the local browser/PC, so heavy models tax the user's machine.

These map directly to the differentiation strategy in Part 2: transparent and lower pricing, dramatically faster time-to-value, server-side compute for large datasets, no proprietary expression language for basic use (natural-language and no-code instead), lighter data-prep through AI-assisted mapping and fuzzy matching, and genuine forward-looking workforce planning.

#### 1.8 Competitive landscape
- **Orgvue**: enterprise leader; deep org design + workforce planning; expensive; complex; consultancy channel.
- **Nakisa (Workforce Planning, formerly Hanelly)**: cloud-native org design and charting; native integration with SAP HCM, SAP SuccessFactors and Workday with write-back to ERP; strong for 5,000+ employees; collaboration, mass change, conflict resolution.
- **Ingentis org.manager**: German; used by 2,000+ corporations; automated org charts and analytics from SAP HCM, SuccessFactors, Oracle HCM, Workday, PeopleSoft; what-if scenario modelling; strong visualisation; weaker on write-back (manual/semi-automated export). Licence reportedly starts around $1,450 per licence.
- **ChartHop**: mid-market people-ops platform; strong dynamic org charts, headcount planning, compensation; modular per-employee-per-month pricing (from around $8 PEPM for the first module and $4 for each additional; a ~$9,000 minimum annual contract; some sources cite $2–$20+ PEPM); praised UX; weaker on deep org design/benchmarking; 2–3 month implementation.
- **Agentnoon**: AI-native org design and workforce planning; loads a 3,000-person chart in under two seconds and handles up to 500,000 employees; drag-and-drop scenario modelling; cost forecasting; SMB plan around $4 per record per month, enterprise custom (around $1,000 per user per month cited); customers include Nestle, Autodesk, Etihad; no HRIS write-back, English-only, no mobile.
- **Functionly**: AI-powered org design (Agent and Advisor modes); operating-model design, span-of-control visualisation, scenario planning; SOC 2 Type II; SMB-friendly.
- **Visier**: enterprise people analytics; predictive workforce analytics, benchmarking, turnover/retention; strong analytics but not a design/scenario tool; custom enterprise pricing.
- **Anaplan (Workforce Planning)**: enterprise connected planning; Hyperblock/Polaris engines; headcount and compensation modelling; expensive and complex (median contract around $102,000; can reach seven figures); finance-led; not an org-design tool.
- **Workday Adaptive Planning**: workforce budgeting/forecasting within the Workday ecosystem; finance-connected; not org design.
- **Pigment / Board / OneStream / Planful**: enterprise planning/FP&A platforms with workforce modules; finance-led.
- **Others**: OrgChart (Ingentis-owned), OrgMapper, Peoplelogic, Organimi, Lucidchart org charts, Microsoft Viva/People (Viva Insights plus org data), SAP org modelling, Sympa (Nordic HCM), BetterCloud (SaaS management, not org design) and TeamOhana (headcount management). Note that "Sociomantic" is an adtech company and is not relevant to this category. Emerging AI-native entrants: Agentnoon, Functionly and increasingly ChartHop AI.

Competitive read: the market has bifurcated between costly, deep enterprise incumbents (Orgvue, Anaplan, Visier) and fast, cheap, AI-native challengers (Agentnoon, Functionly, ChartHop). The gap is a product with enterprise depth (position-level modelling, workforce planning, cost modelling, skills architecture, residency and compliance) delivered with challenger speed, transparent pricing and native AI, plus a purpose-built consultant tenancy model.

#### 1.9 Market sizing and demand drivers
Estimates vary by definition. Mordor Intelligence states that "the workforce analytics market reached USD 2.52 billion in 2025 and is forecast to advance at a 16.0% CAGR, taking the total to USD 5.30 billion by 2030"; Grand View Research separately forecasts the market "to reach USD 5.53 billion by 2030, registering a CAGR of 15.3%". For the adjacent HR analytics market, Grand View Research (June 2023) states the market "is expected to reach USD 8.59 billion by 2030, growing at a CAGR of 14.8% from 2023 to 2030" (from USD 2.95 billion in 2022), with workforce planning the largest segment at 28.8 percent in 2022. Broader workforce management software is much larger again.

Demand drivers: AI-driven workforce reshaping (the BCG Henderson Institute report "AI Will Reshape More Jobs Than It Replaces", 3 April 2026, analysing roughly 165 million US jobs across about 1,500 roles, states that "over the next two to three years, 50% to 55% of jobs in the US will be reshaped by AI", with a further 10 to 15 percent potentially eliminated within four to five years); AI-driven delayering (Gartner's October 2024 top predictions state that "through 2026, 20% of organizations will use AI to flatten their organizational structure, eliminating more than half of current middle management positions"); cost-out programmes; spans-and-layers delayering (Gallup reports that "the average number of people reporting to managers has increased from 10.9 in 2024 to 12.1 in 2025", a nearly 50 percent increase in team size since 2013); continuous rather than episodic planning; and skills-based organisation design.

### PART 2: PRODUCT AND TECHNICAL SPECIFICATION FOR A COMPETITOR

#### A. Product strategy
**Positioning**: "Enterprise-grade organisation design and workforce planning, AI-native, at a fraction of the cost and time of Orgvue." A single platform for organisation design AND workforce planning AND cost modelling AND skills/role architecture, that a mid-market or enterprise team, or a consultant, can stand up in days, not months.

**Differentiation versus Orgvue (exploiting evidenced weaknesses)**:
- **Time-to-value**: AI-assisted ingestion, mapping, fuzzy matching and validation to collapse the data-prep burden from weeks to hours.
- **No proprietary language for the 80 percent**: natural-language querying and a no-code calculation builder replace Gizmo for common tasks (an expression language remains available for power users).
- **Server-side compute**: render and compute tens of thousands of nodes server-side with virtualised client rendering, removing the local-PC bottleneck.
- **Transparent, lower pricing**: published per-employee-record tiers with a low entry point.
- **Genuine forward-looking workforce planning**: turnover, requisitions, retirements, hiring plans and planned headcount in one supply/demand model.
- **Licensing flexibility**: monthly or annual, self-serve trial, no seven-figure minimums.
- **Consultant tenancy model**: a partner can spin up isolated, disposable client workspaces with anonymised/pseudonymised views by default.

**Target segments**: (1) mid-market and lower-enterprise organisations (1,000–20,000 employees) priced out of Orgvue; (2) management consultancies and boutiques needing a delivery accelerator; (3) private-equity operating partners running portfolio cost-out and value-creation; (4) regulated-sector organisations (financial services, healthcare, public sector) needing residency and compliance.

**Value proposition**: "See, design, cost and plan your workforce in one AI-native platform, in days, at a transparent price."

**Naming considerations**: avoid "Org", "Vue" and "Chart" clashes; pick a short, trademark-clear, .com-available name; check UK IPO and EUIPO marks and consultancy-conflict connotations. Illustrative directions: a coined single word tested for trademark clearance. Do not proceed on any name without a formal trademark search.

**Dual commercial model**: (1) SaaS licence sold direct to end customers; (2) consulting delivery accelerator, where the user's own engagements use the tool, plus a partner/consultant tenancy tier where a consultancy holds a "control-plane" account under which it can create, brand and tear down isolated client workspaces, with usage-based or seat-based partner pricing.

#### B. Functional specification (epics, stories, acceptance criteria)

**Epic 1 – Data ingestion and preparation**
- Story: As an analyst, I upload CSV/Excel so that I can build a dataset. AC: files up to 100MB and 250k rows; column preview; type inference.
- Story: As an analyst, I connect an HRIS (Workday, SAP SuccessFactors, Oracle HCM, ServiceNow) so that data refreshes automatically. AC: OAuth connection; scheduled sync; field-level mapping preserved across refreshes.
- Story: As an analyst, I map source fields to the canonical model with AI suggestions. AC: at least 80 percent of standard fields auto-mapped; manual override; mapping saved as a reusable template.
- Story: As an analyst, I deduplicate and fuzzy-match records. AC: configurable match keys; confidence scoring; merge/keep decisions with audit.
- Story: As an analyst, I validate data. AC: rules for orphans, missing managers, cycles, negative FTE, duplicate IDs; a data-quality score and downloadable exception list.

**Epic 2 – Core data model**
Entities: Person, Position, Job, Role, OrgUnit, Location, CostCentre, Skill, Activity, and relationships (reports-to, occupies, belongs-to, located-in, funded-by, requires-skill, performs-activity). AC: schemaless custom properties per entity; mandatory unique IDs; system-generated GUIDs; flat or hierarchical configuration; parent-child integrity checks; effective-dating on every record.

**Epic 3 – Org charting and visualisation at scale**
- AC: render 100,000+ nodes with sub-second pan/zoom via server-side layout and canvas/WebGL virtualisation; multiple layouts (tree, orbit, matrix, work-chart); conditional formatting; drill-down; export to PNG/SVG/PowerPoint.

**Epic 4 – Scenario modelling (branch, version, compare, merge)**
- AC: create a scenario as a branch from a baseline or another scenario; edit without affecting baseline; version history; side-by-side compare of two or more scenarios on headcount, cost, spans and layers; merge a scenario back to baseline with conflict resolution; scenario locking and sign-off.

**Epic 5 – Spans and layers analytics with benchmarks**
- AC: auto-calculated span of control, layers, depth, management ratio per node; target thresholds and guardrails; highlight breaches; internal and external benchmark overlays; delayering simulation.

**Epic 6 – Workforce cost modelling**
- AC: FTE cost, fully loaded cost (salary, on-costs, benefits, overheads), cost-to-serve; severance/redundancy modelling with statutory and enhanced formulae by country; cost-out target tracking against baseline; instant recompute on scenario edits; multi-currency.

**Epic 7 – Strategic workforce planning**
- AC: supply model (current plus planned joiners/leavers, attrition, retirement) versus demand model (driver-based: volume, ratio, project); gap by period, role cluster, location; hiring, reskilling and redeployment plans; skills-gap analysis; scenario-linked; actuals-versus-plan tracking.

**Epic 8 – Job and role architecture, levelling, skills taxonomy**
- AC: build role families and job families; job levelling with configurable grade structures; skills taxonomy management with import/alignment to ESCO, O*NET and SFIA; AI clustering of positions into roles (equivalent to Orgvue's Henshaw Roles); proficiency scales.

**Epic 9 – Activity and work analysis**
- AC: activity surveys (individual and team); time allocation; cost-of-work and duplication analysis; automation/augmentation potential tagging at activity level.

**Epic 10 – Target operating model artefacts**
- AC: design principles register; capability maps; RACI/accountability matrices; operating-model canvas; linkage from TOM to structure to cost.

**Epic 11 – Dashboards, reporting, export**
- AC: configurable dashboards; scheduled reports; export to PowerPoint (native slides), Excel and PDF; board-pack templates.

**Epic 12 – AI-native features (the Orgvue gap)**
- Natural-language querying of the org ("which departments have an average span below 6?"). AC: returns filtered chart + table + narrative.
- AI-generated scenario recommendations. AC: suggests delayering/consolidation options with projected cost and span impact and a rationale; human-in-the-loop approval.
- Automated span/layer optimisation. AC: proposes structures meeting target spans/layers within constraints.
- AI job-description and role-architecture generation. AC: drafts JD and maps skills from role data; editable.
- Anomaly detection in workforce data. AC: flags outliers (pay, span, title/level mismatch).
- Narrative generation for board packs. AC: generates commentary from scenario deltas; human-editable; source-referenced.
- All AI features must cite the underlying data, run against tenant-isolated models, and never train shared models on customer data.

**Epic 13 – Collaboration, commenting, approvals, workflow**
- AC: comments on nodes/scenarios; @mentions; approval workflows for scenarios and org changes; role-based task assignment.

**Epic 14 – Audit trail and change history**
- AC: immutable log of every data and structural change (who, what, when, before/after); per-node change flags; exportable for compliance.

**Prioritisation**: Epics 1, 2, 3, 4, 5, 6 (partial), 11 and 14 are MVP. Epics 7, 8, 12 (core), 13 are V1. Epics 9, 10, 12 (advanced) and full HRIS write-back are V2.

#### C. Technical architecture specification

**Recommended stack (with justification)**:
- **Front end**: TypeScript + React; visualisation via a canvas/WebGL renderer (for example a custom layer over PixiJS or a WebGL graph library) rather than SVG, because SVG cannot render 100,000 nodes at sub-second frame rates. State via TanStack Query; a component library for speed.
- **Back end**: TypeScript (NestJS) or Python (FastAPI); a modular monolith initially for velocity, with clear module boundaries to split into services later.
- **Primary database**: PostgreSQL. It handles relational HR data, JSONB for schemaless custom properties, and recursive CTEs for hierarchy traversal; row-level security enables tenant isolation. This avoids the operational overhead of a separate graph database for the MVP.
- **Hierarchy/graph handling**: PostgreSQL recursive CTEs plus a materialised closure table for fast ancestor/descendant queries; consider Apache AGE or a dedicated graph store (Neo4j) only if traversal complexity demands it at V2.
- **Analytics/compute engine**: server-side aggregation in PostgreSQL for MVP; introduce DuckDB (embedded columnar) or a dedicated compute service for large-scale scenario recompute at V1/V2. This directly addresses Orgvue's client-side performance weakness.
- **Job queue**: Redis + BullMQ (or Celery for Python) for ingestion, matching, recompute, exports and AI jobs.
- **Caching**: Redis for session, computed aggregates and rendered layouts.
- **AI**: Anthropic Claude via API for natural-language querying, narrative generation and role clustering, with per-tenant prompt isolation and no training on customer data; embeddings for skills matching stored in pgvector.
- **File/export**: a headless rendering service for PowerPoint/PDF generation.

**Multi-tenancy design**: three options considered:
1. Shared schema with row-level security (RLS) – lowest cost, easiest to operate, strong logical isolation if RLS is enforced at the connection level.
2. Schema-per-tenant – stronger isolation, more migration overhead.
3. Database-per-tenant – strongest isolation and easiest per-tenant residency and BYOK, highest operational cost.

**Recommendation**: a **hybrid**. Use **shared-schema-with-RLS** as the default for the bootstrapped MVP (cost-efficient, and Orgvue itself uses a logically-segregated shared database). Offer **database-per-tenant (or dedicated schema)** as a premium tier for regulated/large enterprises requiring hard isolation, customer-managed keys and independent residency. This gives the economics of multi-tenancy for the mid-market and the isolation guarantees enterprises demand for highly sensitive HR data. Enforce tenant_id on every table, set RLS policies that fail closed, and derive tenant context from the authenticated session, never from client input.

**Data residency architecture**: separate a global **control plane** (authentication, tenant registry, billing, metadata) from regional **data planes** (all customer HR data). Deploy regional data planes in the UK, EU, US, Canada, Australia, Singapore and the Middle East as demand warrants, each pinned to an in-region cloud region. The tenant registry records each tenant's home region; requests are routed to the correct regional data plane. For a global customer with subsidiary residency needs, support **per-workspace region pinning** so a parent tenant can hold, for example, an EU workspace and a Singapore workspace whose data never leaves their respective regions, with only aggregated/pseudonymised roll-ups surfaced to the global view where lawful. Backups stay in-region.

**Security architecture**: AES-256 at rest, TLS 1.3 in transit; keys in cloud KMS on FIPS 140-3 HSMs with annual rotation; **customer-managed keys / BYOK** for the enterprise tier; secrets in a managed secrets manager (never in code or env files in the repo); **RBAC and ABAC**; **field-level permissions** for salary and performance; **data masking and pseudonymisation** for consultant access by default; SSO via SAML 2.0 and OIDC, SCIM provisioning; MFA; short-lived sessions with refresh rotation; comprehensive audit logging; annual third-party penetration testing; continuous dependency and vulnerability scanning; OWASP Top 10 controls in the SDLC.

**Compliance roadmap**: GDPR and UK GDPR (DPIA before processing, documented lawful basis, data minimisation, special-category-data handling, DSAR and right-to-erasure workflows, records of processing, 72-hour breach process); CCPA; ISO 27001 (target within 12–18 months of first enterprise deals); ISO 27701 for privacy; SOC 2 Type II (start controls from day one, achieve after a 6–12 month observation window); CSA STAR. Selling to financial services requires SOC 2 Type II, ISO 27001, pen-test evidence, a strong security-questionnaire posture, and often BYOK and dedicated isolation.

**Performance and scale**: datasets of 100,000+ employee records; sub-second chart rendering via server-side layout precomputation, closure tables, cached aggregates and client-side virtualisation; scenario recompute under a few seconds for typical edits.

**Integration architecture**: REST + JSON API with OAuth 2.0; webhooks for data-change and scenario events; an HRIS connector framework (start with CSV/SFTP and a Workday connector, then SAP SuccessFactors, Oracle HCM, ServiceNow); export APIs. Write-back to HRIS deferred to V2.

**Observability, logging, monitoring, backup, DR**: structured logging, metrics and tracing (OpenTelemetry); centralised log aggregation with tenant tagging; uptime and error alerting; automated encrypted backups with point-in-time recovery; documented DR with a target **RPO of 1 hour and RTO of 4 hours** for the standard tier (tighter for enterprise); regular restore tests.

**Deployment**: infrastructure as code (Terraform); containerised (Docker) on a managed platform; CI/CD (GitHub Actions) with automated tests, security scans and staged environments (dev, staging, production); cost-efficient bootstrapped hosting (a single managed Postgres, managed container hosting and object storage in one region to start, expanding regionally with demand).

#### D. Data protection and HR-data specific considerations
- **Special-category data**: minimise; process health, ethnicity and similar only with a valid Article 9 condition; encrypt and field-restrict; keep diversity analytics aggregated and anonymised.
- **Works councils and employee representatives**: in Germany, the Netherlands, France and similar EU jurisdictions, restructuring data and monitoring tools may require works-council consultation; provide configurable controls, aggregated views and audit trails to support co-determination obligations.
- **Employee consent and lawful basis**: for most HR processing the lawful basis is legitimate interest or contract, not consent; document this; provide transparency notices.
- **Anonymised/aggregated consultant views**: consultants should see pseudonymised individual data and aggregated cost/structure by default, with re-identification gated by explicit client authorisation and logged.
- **Redundancy and restructuring data risks**: this is highly sensitive and market-moving; enforce strict access controls, "need-to-know" scoping, masking of names during modelling, watermarking of exports, and full audit; treat leaks as a breach; support data-retention limits and secure destruction after a project.

#### E. Build plan for Claude Code
**MVP definition (commercially sellable)**: ingest CSV/Excel and one HRIS connector; canonical data model (people, positions, org units, locations, cost centres); interactive org chart to 50,000+ nodes; spans and layers analytics with targets; scenario branching, comparison and basic cost modelling (FTE and fully loaded cost); dashboards and PowerPoint/Excel export; audit trail; multi-tenant with RLS; SSO and RBAC; natural-language querying as the flagship AI differentiator. This alone is sellable to mid-market org-design teams and as a consulting accelerator.

**Phased roadmap**:
- **MVP (months 0–4)**: Epics 1 (CSV + one connector), 2, 3, 4 (branch/compare), 5, 6 (partial), 11, 14; core AI querying (Epic 12 partial); multi-tenancy and security baseline.
- **V1 (months 4–9)**: full workforce planning (Epic 7), job/role architecture and skills taxonomy with ESCO/O*NET/SFIA (Epic 8), AI scenario recommendations and role clustering (Epic 12 core), collaboration and approvals (Epic 13), more HRIS connectors, SOC 2 Type II readiness.
- **V2 (months 9–18)**: activity/work analysis (Epic 9), TOM artefacts (Epic 10), advanced AI (optimisation, board-pack narrative), HRIS write-back, database-per-tenant enterprise tier, BYOK, additional regional data planes, ISO 27001 certification.

**Recommended repository structure** (modular monolith):
```
/apps
  /web            (React front end)
  /api            (back-end API)
  /worker         (job queue processors)
  /render         (export/rendering service)
/packages
  /data-model     (shared entities, types, validation)
  /ingestion      (parsers, mapping, fuzzy match, validation)
  /hierarchy      (closure tables, spans/layers, traversal)
  /scenarios      (branch/version/compare/merge)
  /costing        (FTE, fully loaded, severance)
  /planning       (supply/demand, attrition)
  /skills         (taxonomy, ESCO/O*NET/SFIA, matching)
  /ai             (NL query, narrative, clustering, guards)
  /auth           (RBAC/ABAC, SSO, SCIM, RLS helpers)
  /audit          (change log)
/infra            (Terraform, CI/CD)
/docs
```

**Sample Claude Code prompts (per module)**:
- Ingestion: "Build a TypeScript module that parses an uploaded CSV/Excel file, infers column types, and proposes a mapping to our canonical Person/Position schema (provided). Include fuzzy matching on name+email+employeeId using Levenshtein with confidence scores, a deduplication step, and a validation pass that flags orphans, cycles, missing managers and duplicate IDs. Return a data-quality report. Write unit tests."
- Hierarchy: "Implement a PostgreSQL closure-table strategy for an employee hierarchy with recursive CTE population, plus functions to compute span of control, depth, layers and management ratio per node, respecting soft filters. Provide migration scripts and tests for a 100,000-node dataset with performance assertions."
- Scenarios: "Create a scenario-branching service where a scenario is a copy-on-write overlay on a baseline dataset. Support edit, version history, side-by-side comparison on headcount/cost/spans/layers, and merge-back with conflict detection. Enforce tenant RLS. Include tests."
- AI querying: "Build a natural-language query service that translates questions like 'which departments have an average span below 6?' into safe, parameterised queries over the tenant's dataset via a constrained tool schema, returns a filtered result set plus a short narrative, cites the underlying figures, and never executes free-form SQL. Include prompt-injection guards and tenant isolation."
- Multi-tenancy/security: "Implement PostgreSQL row-level security with a tenant_id on every table, session-derived tenant context, fail-closed policies, and field-level column permissions for salary and performance. Provide ABAC policy evaluation and tests proving cross-tenant isolation."

#### F. Commercial and go-to-market specification
**Pricing model options**:
- **Per employee record per month** (headline, transparent): illustrative tiers of £1–£3 per record per month by volume band, undercutting Orgvue's £65,000 floor and ChartHop's roughly $8+ PEPM by pricing on records not seats. A 5,000-record client at £2 could pay circa £120,000 per year at list, but a lean band at £0.50–£1 for large volumes keeps mid-market accessible.
- **Per seat** for very small teams / trials.
- **Tiered editions**: Design (org charting + spans/layers), Plan (adds workforce planning + cost), Enterprise (adds residency, BYOK, dedicated isolation, SSO/SCIM, SOC 2/ISO evidence).
- **Consultancy partner licence**: an annual platform fee plus usage-based or per-active-workspace pricing, letting a firm spin up client workspaces; optionally white-labelled.
- **Trial/freemium**: a free, self-serve tier for a single small dataset (up to, say, 250 records) to drive bottom-up adoption, plus a 14–30 day full trial.

**Competitor price benchmarking** (for positioning): Orgvue G-Cloud floor £65,000 and DIT deal roughly £68,000 per year; ChartHop about $8 PEPM first module with a roughly $9,000 minimum; Agentnoon about $4 per record per month SMB; Ingentis from about $1,450 per licence; Anaplan median about $102,000. Position below Orgvue and Anaplan, comparable to Agentnoon on entry, but with more depth.

**Rough economics**: bootstrapped hosting for an early product can run on a single managed Postgres, container hosting and object storage; gross margin on SaaS should exceed 80 percent at modest scale; the consulting-accelerator use is near-pure margin because it displaces Orgvue licence cost on the user's own engagements. Break-even likely needs a small number of mid-market logos or one consultancy partner deal.

#### G. Risks
- **Technical**: rendering and computing 100,000+ nodes at sub-second speed is genuinely hard; server-side layout, closure tables and virtualisation mitigate but need early proof. Data ingestion/matching quality is make-or-break. AI features risk hallucination; mitigate with data-cited, constrained tool use and human-in-the-loop.
- **Commercial**: incumbents are entrenched via consultancy channels; sales cycles for enterprise HR data are long; the consultant-accelerator wedge and mid-market focus reduce this risk.
- **Legal / IP / conflict of interest (critical)**: under UK law, IP created by an employee in the course of employment vests by default in the employer, and IP created outside working hours can still belong to the employer if it arises from the employee's normal duties. A Senior Director at a consultancy whose day job is organisation design is at material risk that an org-design tool could be claimed by the employer. Employment contracts commonly contain broad IP-assignment, disclosure, moral-rights-waiver and non-compete/non-solicit clauses. The user MUST obtain independent legal advice on his specific Capgemini Invent employment contract, must consider conflict-of-interest and moral-rights issues, should build strictly on his own time and equipment with clean-room separation from any employer materials and clients, and should consider disclosure obligations carefully. Do not rely on this report for legal conclusions.
- **Data protection**: processing HR and special-category data, and especially redundancy/restructuring data, carries high regulatory and reputational risk; DPIAs, minimisation, residency, masking and audit are mandatory, not optional.

## Recommendations
1. **Resolve the legal position first (gating step).** Before writing any code, commission independent employment/IP legal advice on the Capgemini Invent contract covering IP assignment, moral rights, disclosure duties, and non-compete/conflict of interest. Build only on personal time and equipment with documented clean-room separation. Benchmark that changes the plan: if the contract assigns broad IP or the conflict is unmanageable, restructure (for example negotiate a written carve-out, or defer to after employment).
2. **Validate the wedge with the consulting-accelerator use.** Build the MVP (ingestion, org chart, spans/layers, scenarios, cost, export, natural-language query) and use it on the user's own engagements first (subject to the legal position and client data-protection rules), proving time savings versus Orgvue.
3. **Lead with the two evidenced Orgvue weaknesses that are hardest for them to fix**: speed-to-value (AI-assisted data prep) and server-side performance. Make these the demo centrepiece.
4. **Price transparently per record, below Orgvue's £65,000 floor**, with a free tier to drive adoption and a consultancy partner tier for the dual model.
5. **Sequence compliance to sales**: SOC 2 Type II controls from day one, ISO 27001 once the first enterprise/regulated deal is in sight. Benchmark: do not incur ISO 27001 certification cost until a named regulated prospect requires it.
6. **Defer graph databases, HRIS write-back and multi-region data planes** until demand proves them; start shared-schema-RLS single-region to conserve cash. Benchmark to add a region or enterprise-isolation tier: a signed enterprise deal that requires it.

## Caveats
- Orgvue does not publish pricing; the figures cited (the G-Cloud band and the DIT contract) are the strongest public evidence, but actual private annual contract values are undisclosed and likely higher; third-party cost estimates are indicative only.
- Some third-party directory data on Orgvue and competitors is inconsistent (for example founding year cited variously as 2005 or 2008; funding as £41m / $55.86m / $66m; employee count 170 in 2018 versus about 260 today); primary sources were preferred where available and the 2008 founding, £41m 2018 round and 170-person 2018 headcount are the primary-sourced figures.
- Competitor pricing (ChartHop, Agentnoon, Anaplan, Ingentis) is drawn from third-party brokers and directories and varies by configuration; treat as directional.
- Market-size figures vary by analyst definition and should be treated as ranges, not precise values.
- This report is not legal, tax or investment advice; the IP and employment risks in particular require the user's own professional legal counsel.