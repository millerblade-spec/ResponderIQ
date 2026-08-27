# RPOS — source specification

RPOS is the **EMS Clinical Simulation Trainer**: six levels, run by "Ron," an
AI trainer using the **current Fort Worth Regional EMS System protocols**.

The authoritative source is two master prompts, both dated 2026-08-24:

| Prompt | Covers | Drive file |
| --- | --- | --- |
| Master Prompt #1 | Identity, protocol authority, hard stops, grading, Miss Board, Levels 1–3 | `EMS_Master_Prompt_1_Levels_1-3.txt` |
| Master Prompt #2 | Levels 4–6, CCP Rescue Mode, ventilator expectations | `EMS_Master_Prompt_2_Levels_4-6.txt` |

Clinical authority: `FW Regional EMS System Protocol (v1_050126).pdf`.

This file records what `lib/rpos` implements, so the code can be checked
against the program without leaving the repository. **Where the prompts state
a number, it is here and in the code. Where they are silent, the code says so
rather than inventing one** — Level 1 is the only level with a stated scenario
count, and the only level with a stated grading weight.

## Core loop

> ASSESS → FIND THE PROBLEM → UNDERSTAND THE PROBLEM → SELECT THE PROTOCOL →
> TREAT → REASSESS.

## Protocols are the scaffolding

The current loaded Fort Worth protocols are the primary clinical authority for
indications, contraindications, concentrations, doses, repeats, maximums,
procedures, equipment, reassessment, destinations, CCP restrictions, OLMC,
safety, grading, and debriefing. If Fort Worth addresses it, Fort Worth wins
over generic ACLS/PALS, textbook medicine, another EMS system, Ron's
preference, or general AI knowledge. If uncertain: check the loaded protocol,
do not guess.

Protocol-consistent clinical judgment is allowed: a learner may make a
deliberate patient-specific decision inside protocol flexibility and defend it.

CCP study material is **information only** — it improves realism, never scope.

## Certification

"What patch are we training today?" — **EMT** or **PARAMEDIC**. Scope and
grading follow certification. Never grade an EMT as a Paramedic.

Implemented in `lib/rpos/schema.ts` (no default, enrollment cannot omit it) and
`lib/rpos/levels.ts` (Level 3 reads "Protocol Mastery + ALS Integration" for an
EMT).

## The six levels

| # | Title | Call sign | Coaching |
| --- | --- | --- | --- |
| 1 | Orientation & Evaluation | — | Active coaching |
| 2 | Clinical Decision Making | — | Broad prompts |
| 3 | Protocol Mastery (EMT: + ALS Integration) | — | Learner owns assessment; limited prompting |
| 4 | Advanced: Increased Pressure | ⚡ WELCOME TO THUNDERDOME | Very little rescue |
| 5 | Welcome to the Jungle | WELCOME TO THE JUNGLE | Training wheels off |
| 6 | CCP Rescue Mode | — | Training wheels off |

Stated numbers: Level 1 is "normally about 10 meaningful scenarios"; Level 2's
hidden mix is 50% straightforward / 30% moderate / 20% difficult, never rigid
and never disclosed. Level 6: about half of ventilator cases develop a real
patient-ventilator problem, and about one in five cases is ARDS-type.

Exception that survives every level: **DSI / Max BVM and true safety hard stops
remain enforceable at every level**, training wheels off included.

## Grading

| Band | Range | Meaning |
| --- | --- | --- |
| BLUE | 98–100 | Mastery |
| GREEN | 95–97 | Strong |
| YELLOW | 90–94 | Improvement / clarification needed |
| RED | below 90 | Significant expectations missed |

Critical errors may block mastery regardless of numeric score. YELLOW and RED
get a focused debrief.

**Level 1 weighting** (the only level with one): Assessment 45%, Protocol/
treatment 20%, Recognition/reasoning 15%, Reassessment 10%, Safety 5%,
Communication/operations 5%.

These are **not** the simulator's own bands in `lib/engine/config.ts`, which
grade one BLS-01 run on a 75-to-pass scale. Two standards for two questions,
deliberately kept apart — a BLS-01 run that "passes" at 75 is RED in RPOS.

## Advancement

> 5 consecutive BLUE cases + no critical errors + no unresolved critical Miss
> Board items + level requirements complete.

`lib/rpos/progression.ts` implements exactly this. Because "critical errors may
block mastery regardless of numeric score," a BLUE case carrying a critical
error or a failed hard stop does not extend the streak — it resets it.

A challenge-mode case (the learner accepted a harder scenario) is graded at
their **current** level and never penalized, so it counts on the same terms as
any other case.

## Miss Board

Tracks **assessment, protocol, medication/dose, clinical reasoning, safety, and
operations** misses, and retests old weaknesses later **using different
presentations**.

An entry therefore clears only when a *later* case exercised the same *subject*
cleanly — never by time passing, never by the case that created it, and never
by a case that missed it again. Critical entries block advancement while open.

## Hard stops — MAX BVM and DSI, 100%

Both must be performed 100% per the current Fort Worth protocol, every time, by
every learner at every level — experienced clinicians, CCPs, EMTs when Max BVM
is in role, and Ron himself.

Never assume omitted steps, fill in missing equipment, pretend positioning or
monitoring or oxygen setup occurred, let experience replace mandatory steps,
credit "they probably meant it," or let a good outcome erase a mandatory miss.
If any mandatory element is omitted: **stop, push back, identify it, require
correction.** No partial credit. No "close enough."

Max BVM per Fort Worth: 2 NPAs, OPA, HFNC, high-flow BVM oxygen — plus the
assisted-ventilation elements. DSI: the full sequence including the
3-minute ≥94% countdown (**reset** if SpO2 drops), the 90-second paralysis
countdown, affirmative SBP ≥100, and max 2 intubation attempts per patient.

Encoded as data in `lib/rpos/hardStops.ts`. Items marked conditional are the
prompts' own "as applicable"; a mandatory item can never be excused.

## Ron

Personality 0 Clinical / 1 Coach / 2 Ron Mode, changeable by the learner at any
time. **Delivery only** — never protocol, grading, physiology, safety, scope,
or difficulty.

The Dr. Jarvis lines are occasional and unpredictable; the protocol standard is
not.

## What this repo implements today, and what it does not

Implemented: the program — levels, certification, bands, the advancement rule,
the Miss Board with retest resolution, and the hard-stop checklists, plus the
administrator views at `/admin/rpos`.

Not yet implemented, and honestly reported as such rather than faked:

- **Protocol and medication/dose grading.** BLS-01 models neither, so those two
  Miss Board categories stay empty — empty because unmeasured, never because
  clean. They fill in once scenarios run against the loaded Fort Worth
  protocols.
- **Hard stops in play.** BLS-01 contains no invasive-airway sequence, so both
  checklists report NOT REQUIRED for a BLS-01 case. `runToCase` already accepts
  real outcomes from a scenario that runs one.
- **Scenario generation per level**, the standard dispatch block, the realistic
  clock across resources, MCI tracking, HEMS timing, and the ventilator model
  for Level 6.
