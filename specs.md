# Kinnu AI-Driven Flashcard Prototype — Spec

## Purpose

An experimental prototype to test a scroll-based, AI-driven flashcard experience as an alternative to the traditional card-flip mechanic. The goal is to reduce friction and improve the active recall experience — not to replicate social media engagement mechanics.

---

## Technical Setup

- **Frontend only** — pure HTML, CSS, JavaScript. No build step, no backend, no framework required.
- **Hosted on GitHub Pages** — primary distribution is a shareable URL. Content files are fetched over HTTP.
- **Content in JSON files** — flashcard data and source content are stored in separate JSON files that can be replaced without touching application code. The prototype reads these at load time via `fetch()`.
- **Offline/zip distribution** — not a target for this prototype. GitHub Pages is the primary target.

### File structure

```
/index.html
/app.js
/styles.css
/content/
  flashcards.json       ← flashcard Q&A data, including pre-created alternative versions
```

Content files will be provided separately. The spec for their format is below.

---

## UI Design

The visual design follows a reference image to be provided. The implementation should match that image's layout, colour palette, and component style.

**Core UI principles:**
- Scroll-based layout — cards are stacked vertically in a single scrollable feed
- Each card occupies most of the viewport height
- Smooth scroll behaviour between cards
- Mobile-first, but functional on desktop

---

## Content File Format

### flashcards.json

```json
[
  {
    "id": "card-001",
    "active_version": "original",
    "topic": "Renal",
    "spacing": "default",
    "next_due_day": 0,
    "versions": {
      "original": {
        "question": "What is the main function of the glomerulus?",
        "answer": "Filtration of blood to produce a filtrate that will become urine."
      },
      "zoom_in_0": {
        "question": "Which specific structure within the glomerulus performs the actual filtration?",
        "answer": "The glomerular capillary wall, consisting of fenestrated endothelium, basement membrane, and podocyte filtration slits."
      },
      "zoom_in_1": {
        "question": "What property of the glomerular filtration barrier determines which molecules pass through?",
        "answer": "Size and charge — the barrier blocks large or negatively charged molecules, allowing water, ions, and small solutes through."
      },
      "zoom_out_0": {
        "question": "Where does glomerular filtration fit in the overall process of urine formation?",
        "answer": "It is the first step — bulk filtration of blood into the nephron — before tubular reabsorption and secretion refine the filtrate into urine."
      },
      "zoom_out_1": {
        "question": "How does the glomerulus relate to the kidney's role in maintaining blood pressure?",
        "answer": "Glomerular filtration rate is pressure-dependent; the kidney regulates this via afferent/efferent arteriole tone, directly linking filtration to blood pressure control."
      }
    }
  }
]
```

**Fields:**
- `id` — unique card identifier
- `active_version` — key of the version currently shown to the user: `"original"` | `"zoom_in_0"` | `"zoom_in_1"` | `"zoom_out_0"` | `"zoom_out_1"`
- `topic` — topic label for grouping
- `spacing` — current spacing schedule: `"default"` | `"shorten"` | `"lengthen"`
- `next_due_day` — the day number this card is next due (matches the day simulator)
- `versions` — all card versions keyed by version ID:
  - `original` — the default card, always preserved
  - `zoom_in_0`, `zoom_in_1` — two narrower, more specific versions
  - `zoom_out_0`, `zoom_out_1` — two broader, contextual versions
  - Each version has a `question` and `answer`

The prototype always reads the displayed question and answer from `versions[active_version]`. When the user selects an alternative in the Refocus path, `active_version` is updated to the chosen key and spacing resets. The original is never overwritten.

**Content generation note:** every card must include all five versions (`original`, `zoom_in_0`, `zoom_in_1`, `zoom_out_0`, `zoom_out_1`). Alternatives should represent meaningfully different angles — not minor wording variations of each other.

---

## Spacing Schedules

Three schedules are supported. Intervals are in days from the current day.

| Schedule | Intervals |
|---|---|
| Default | 1, 6, 16 |
| Shorten (more frequent) | 1, 3, 8 |
| Lengthen (less frequent) | 2, 12, 32 |

**Forgot reset logic:**
- If card was on Default or Lengthen → reset to Default (1, 6, 16)
- If card was on Shorten → reset to Shorten (1, 3, 8)

When a card is forgotten, it is re-queued at the end of the current session before the spacing reset kicks in for subsequent days.

---

## Day Simulator

- Appears at the **end of the scroll session**, after all due cards and any optional tomorrow cards are shown
- The user sets any target day number (not just +1) — can jump forward freely
- On confirmation, the full interface refreshes to show cards due on the selected day
- This is the primary navigation mechanism for testing the prototype across time

---

## Session Flow

### 1. Active session
- Cards due for the current day are shown in the scroll feed, one per viewport
- Forgotten cards are re-appended to the bottom of the feed, appearing naturally after the originally-due cards are done

### 2. Session boundary
When all due cards are complete, show a prominent button:

> **"Do some of tomorrow's cards?"**

- If selected: cards due tomorrow are appended to the feed, **excluding any card shown in today's session** (whether first-time or forgotten)
- If declined: session ends, day simulator appears

### 3. End of session
- Day simulator is shown
- User selects the next day to simulate and the interface refreshes

---

## Card Layout

Each card in the scroll feed has three states:

**State 1 — Question shown**
```
[Question text]

[ Reveal answer ▾ ]
```

**State 2 — Answer revealed** (expands below, user scrolls to read if needed)
```
[Question text]

[Answer text]

[ Forgot ]   [ Show in N days ]   [ Not sure ]
```

- "Show in N days" displays the actual number based on the card's current spacing schedule and position in sequence
- Answer expands in place; options appear below it

---

## Response Options

### Forgot
- Card is re-queued at the end of the current session
- On next appearance in session: same Forgot / Show in N days / Not sure options
- Spacing resets per forgot reset logic above when the day advances

### Show in N days
- Card is marked done for today
- Next due day is set to current day + N per the card's current spacing schedule

### Not sure
- Triggers the dialogue flow (see below)

---

## "Not Sure" Flow

All steps are option-driven. No AI calls are made in this prototype — alternative cards are pre-created and loaded from `flashcards.json`.

### Step 1 — Entry

> **"What would help most?"**
> - [ ] Change how often I see this
> - [ ] Refocus the question
> - [ ] Cancel

Cancel at any step reshows the original **Forgot / Show in N days / Not sure** options on the card.

---

### Path 1 — Adjust Spacing

> **"Should this come up more or less often?"**
> - [ ] More often — I need more practice with this → applies Shorten schedule
> - [ ] Less often — I mostly know this → applies Lengthen schedule
> - [ ] Cancel

On selection: spacing schedule updates, card marked done for today, next due day set accordingly.

---

### Path 2 — Refocus Question

**Step 2a — Direction**

> **"Where did you struggle?"**
> - [ ] Zoom in — focus on the specific detail I'm missing
> - [ ] Zoom out — show me the bigger picture
> - [ ] Cancel

**Step 2b — Optional hint (simulated field)**

After selecting a direction, show an optional free-text field:

> **"Any hints for regenerating the card?"** *(optional)*
> [ text input — placeholder: "e.g. focus on the mechanism, not the definition" ]
> [ Continue → ]

This field is displayed to simulate the future AI-driven experience but its value is **ignored in this prototype** — it does not affect which alternatives are shown. The Continue button always proceeds to Step 2c regardless of whether anything is typed.

**Step 2c — Card selection**

The two pre-created alternatives for the chosen direction are loaded from the card's `alternatives.zoom_in` or `alternatives.zoom_out` array in `flashcards.json`.

> **"Which version works better for you?"**

Two cards displayed side by side. On mobile: swipe left/right to compare. Each card shows the alternative question and its adapted answer. Tap to select.

Below the cards:
> - [ ] Cancel

On selection: card is updated with the chosen question and answer, spacing resets to the card's current schedule from interval 1, card marked done for today.

---

## Out of Scope for This Prototype

- User accounts, authentication, or persistent server-side state — all state is in-memory for the session
- Full card creation or deletion UI — content is managed by editing JSON files directly
- Complete card replacement (question + answer wholesale) — user creates a new card in the JSON file for that
- Motivation mechanics (streaks, badges) — may be explored in a future iteration
- Multi-topic session planning — this prototype focuses solely on the flashcard experience

---

## Open for Visual Design

- Reference image to be provided — UI should match its layout, colour palette, and component style
- Card transition animations (scroll snap behaviour, reveal animation)
- Mobile tap targets and spacing
