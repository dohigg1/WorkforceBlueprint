# docs/build-protocol.md

**How you must work. This is not advisory.**

The failure mode of an agentic build is not that the model writes bad code. It is that the model writes plausible code that quietly omits something structural, declares success, and moves on. Three sprints later the omission is load-bearing. This protocol exists to make omission visible at the point it happens.

---

## 1. The session start ritual

At the beginning of every session, before any other action:

1. Read `CLAUDE.md` in full.
2. Read `docs/invariants.md`.
3. Read this file.
4. Read the current task brief in `docs/sprint-prompts.md`.
5. Run `./scripts/verify.sh` and confirm it is green.
6. Read `docs/adr/` for any decision relevant to the task.
7. State, in one paragraph, what you understand the current state of the repository to be, and what you are about to do.

If the repository is not green, your task is to make it green. That is the whole task. Do not build on a red build.

---

## 2. The task loop

Every task, without exception, follows these seven steps in order.

### Step 1: Orient
Read the code you are about to change. All of it. **You may not edit a file you have not read in this session.** Read the tests that cover it. Read the module it belongs to.

### Step 2: Restate
Write back, in your own words and before writing any code:
- what you are building;
- which invariants it touches;
- what would make it wrong;
- what you are explicitly not building.

**If your restatement differs materially from the brief, stop and ask.** A divergence at this point is cheap. The same divergence discovered after implementation is not.

### Step 3: Plan
Produce a file-by-file plan. Which files you will create, which you will modify, which tests you will write, and in what order.

**If the plan touches a primitive, being tenancy, the canonical model, the scenario engine, the measure engine or the export layer, stop and obtain approval before implementing.** These are the five things that are expensive to get wrong and cheap to discuss.

### Step 4: Test first, for invariants
Write the failing test that proves the invariant before you write the implementation that satisfies it. Specifically:

- If the task creates a table, write the cross-tenant isolation test first.
- If the task creates a mutation, write the audit test first.
- If the task creates a read, write the as-at date test first.
- If the task creates an edit, write the scenario isolation test first.
- If the task creates a number, write the measure consistency test first.
- If the task touches hierarchy, measures, scenarios or rendering, write the performance assertion first.

Run them. Watch them fail. A test that has never failed proves nothing.

### Step 5: Implement
Now write the code.

Constraints while implementing:
- No `TODO`. No `FIXME`. No comment beginning "for now". If you are tempted to write one, you have found a stop condition. Stop and ask.
- No `any` in TypeScript without a written justification on the line above.
- No workaround. If the correct approach is blocked, report the blockage rather than routing around it.
- No silent scope reduction. Ever.

### Step 6: Verify
Run `./scripts/verify.sh`. It must be green.

If the change touches the hierarchy, measure, scenario or rendering packages, run `./scripts/perf.sh` and record the numbers in your report against the targets in `docs/invariants.md`.

**A performance regression is a failure, not a note.** If you cannot meet the target, that is a stop condition. Do not weaken the target.

### Step 7: Report
Produce the handoff report in the format in section 4 below, including the completed pertinence checklist from `CLAUDE.md` section 9.

---

## 3. Anti-drift rules

These exist because they are the specific ways an agentic build goes wrong.

**Never declare a task complete without running the verification gate.** "It should pass" is not a result.

**Never say a thing is done when part of it is done.** State exactly what is done and exactly what is not. Partial completion honestly reported is useful. Partial completion reported as complete is corrosive, because the next task will be built on a false foundation.

**Never repair a failing test by changing the test.** If a test that previously passed now fails, the code is wrong until proven otherwise. Changing an assertion to make a build green is the single most destructive action available to you.

**Never build the second thing before the first thing is verified.** The sprint sequence encodes dependencies. Building E07-02, the editing surface, before E07-01, the scenario overlay, is merged and verified will cost four to six sprints of rework. The order is not a suggestion.

**Never optimise before measuring.** And never claim a performance characteristic you have not measured on the hundred thousand record dataset.

**Never invent a requirement.** If the brief does not say it, and you think it should, raise it. Do not build it.

**Never leave an assumption unstated.** Every assumption goes in the report, in a list, explicitly. An unstated assumption is a defect with a delay fuse.

---

## 4. The handoff report format

Every task ends with this. No exceptions.

```
## Task: [story ID and title]

### What I built
[Precise. Files, endpoints, tables, tests.]

### What I did NOT build
[Explicit. In bold if it is something a reader might assume was included.]

### Invariants touched
[Which of INV-1 to INV-11, and how each is satisfied. Name the test that proves it.]

### Verification
- verify.sh: [pass or fail]
- Performance, if applicable: [operation, measured value, target, pass or fail]
- New tests added: [list]
- Tests that failed before implementation and pass after: [list]

### Assumptions I made
[Numbered. Every one. If the list is empty, you are not looking hard enough.]

### Decisions that need a human
[Anything you resolved by judgement that could reasonably have gone another way.]

### Risks I introduced
[Honest. Including debt, shortcuts, and anything that will be harder to change later.]

### Pertinence checklist
[The twelve questions from CLAUDE.md section 9, each answered.]

### Recommended next task
[And why.]
```

---

## 5. Stop conditions, restated

Stop and ask. Do not proceed.

- The task requires changing a primitive or an invariant.
- The task requires a new datastore, framework, library of consequence, or third-party service.
- The task requires handling salary, performance, diversity, severance or selection data in a manner not already specified.
- A performance target cannot be met.
- The brief is ambiguous in a way a reasonable person could resolve two ways.
- You are about to write a workaround, a `TODO`, or a comment beginning "for now".
- You are about to change a test to make a build pass.
- Real client data has appeared anywhere in the repository. **This is an incident. Stop immediately.**

The cost of asking is a few minutes. The cost of a wrong assumption baked into a primitive is measured in sprints.

---

## 6. The definition of done

A story is done when, and only when, all of the following are true.

1. Tenant and workspace isolation is enforced and proven by test for any new table or endpoint.
2. Automated tests cover the happy path and the principal failure modes, and they fail if the feature is removed.
3. Every mutation writes to the audit log in the same transaction.
4. Every new field containing personal data is classified, with a declared permission and a declared masking behaviour.
5. Performance has been measured against the hundred thousand record synthetic dataset and recorded.
6. **The feature works correctly inside a scenario, not merely against the baseline, and there is a test that proves it.**
7. Documentation exists sufficient for a consultant to use the feature without training.
8. `./scripts/verify.sh` is green.
9. The handoff report is complete, including the pertinence checklist.

Point six is the one most frequently missed and the most expensive to repair afterwards. Check it explicitly, every time.

---

## 7. A note on why this is so strict

You are building a system that will hold the names, salaries, performance ratings and redundancy selection scores of real people, for real clients, including listed companies for whom a leak of restructuring data is a market-moving event.

The strictness is proportionate to that. It is not bureaucracy. Every rule in this document exists because the alternative is a rewrite, a breach, or a number on a board slide that is quietly wrong.
