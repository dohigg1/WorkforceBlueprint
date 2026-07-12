# Build Kit: How to Use This With Claude Code

Four files. Each does a different job. Together they are the mechanism that stops an agentic build from drifting.

| File | Where it goes | What it does |
|---|---|---|
| `CLAUDE.md` | Repository root | Claude Code reads this automatically at the start of every session. It carries the domain model, the fixed technical decisions, the five primitives, the stop conditions and the pertinence checklist. This is the file that survives context loss. |
| `docs/invariants.md` | Repository | Eleven rules that cannot be broken, each with the test that proves it. These are machine-checked, not reviewed by eye. |
| `docs/build-protocol.md` | Repository | The seven-step task loop, the anti-drift rules, the handoff report format and the definition of done. |
| `docs/sprint-prompts.md` | Repository | The build script. One sprint at a time, in order, with the failure modes for each. |

## How to run it

1. Create the repository. Place `CLAUDE.md` at the root and the three documents in `docs/`.
2. Open Claude Code in the repository.
3. Give it the Sprint 0 prompt from `docs/sprint-prompts.md`. Nothing else.
4. When it reports, check the handoff report against the pertinence checklist. If a question is unanswered, that is the finding.
5. Only when Sprint 0 is green do you give it Sprint 1.

**Give one sprint at a time. Never paste the whole script.** A model given the entire roadmap will optimise for appearing to make progress across all of it rather than for finishing one thing correctly.

## Why it is built this way

The failure mode of an agentic build is not bad code. It is plausible code that quietly omits something structural, declares success, and moves on. Three sprints later the omission is load-bearing and the fix is a rewrite.

Four mechanisms guard against that, and they are deliberately redundant, because any one of them will occasionally fail.

**The persistent context file.** `CLAUDE.md` is re-read every session. It is where the things that must never be forgotten live, particularly that the hierarchy is a hierarchy of positions and not of people, and that every edit goes through the scenario engine.

**Machine-checked invariants.** `verify.sh` is built in Sprint 0, before any feature code, with every gate present and passing trivially. This matters more than it looks. A gate added after the code it governs will find violations, and the pressure at that moment will be to weaken the gate rather than to fix the code. Building the gates first removes that choice.

**The forcing questions.** The pertinence checklist and the handoff report make omission visible. The most valuable question on the list is the eleventh: what did you deliberately not build? A model will almost never volunteer this, and it is almost always the most important thing in the report.

**Failure modes named in advance.** Each sprint entry names the specific ways that sprint goes wrong. Naming them in the prompt is what stops them, because they are the paths of least resistance and they will otherwise be taken.

## The three things most likely to sink this

Watch for these specifically. Everything else is recoverable.

1. **The editing surface built before the scenario overlay.** Costs four to six sprints of rework. It is Sprint 8's entire risk, and it is the sprint's whole ordering rationale.
2. **Row-level security enabled but not forced.** The application's own database user then bypasses it entirely and the control is decorative. It looks correct in every code review.
3. **Span of control implemented as a hand-written query in Sprint 6** because it is trivially easy, thereby defeating the purpose of the measure engine and guaranteeing that workforce planning in Sprint 13 has to build a second calculation engine.

## Before Sprint 0

The legal position on intellectual property, disclosure and conflict of interest under the existing employment contract is on the critical path. Nothing downstream of it is safe until it is resolved. This is a gating item, not a risk to be managed.
