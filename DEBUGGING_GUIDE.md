# Debugging — A Practical Guide

> Debugging is a **skill**, not a talent. The gap between someone who fixes a bug in
> 10 minutes and someone who flails for 3 hours is **method**, not intelligence.
> "Just sit with the code" is how people debug *badly* for years. Use a process.

---

## The core mental model

**Debugging is the scientific method, not random poking.**

- ❌ Bad: change things randomly and hope it works.
- ✅ Good: **observe → form a hypothesis → test it → confirm or reject → repeat.**

Every action you take should be *answering a question*, never a guess.

---

## The process (the loop you run every time)

### 1. Reproduce it reliably first
Find the exact input/steps that trigger the bug **every time**.
If you can't reproduce it on demand, you can't know when you've fixed it.
This step alone wins half the battle.

### 2. Read the actual error — fully
Don't panic and skim. The stack trace tells you the **file**, the **line**, and **what happened**.
- First line = *what* broke.
- The trace = *where* it broke.
The answer is often sitting right there.

### 3. Locate it by bisection (the #1 technique)
The bug is somewhere in a flow of, say, 100 lines. **Don't read all 100.**
- Check the **middle**: is the data correct *here*?
- Correct → bug is **downstream**. Wrong → bug is **upstream**.
- Halve again. Repeat.

You find it in ~7 checks instead of 100. **Divide and conquer.**

### 4. Verify your assumptions — the bug is where you're *sure* it isn't
"This function is definitely correct, skip it" → **check it anyway**, with a real log.
Bugs live in the code you trust. Confirm every assumption with **actual evidence**
(print the value), never "it should be fine."

### 5. Change ONE thing at a time
If you change five things and it works, you don't know which one fixed it —
and you may have added two new bugs. **One change → test → observe.**

### 6. After it works, find the *root cause*
Don't stop at "it works now." Know **why** it broke.
Then, ideally, **write a test** that would have caught it.
That's what converts a fixed bug into a permanent lesson.

---

## The techniques that level you up fastest

- **Learn the real debugger** (VS Code has one built in):
  breakpoints, step through line by line, inspect every variable's actual value at each step.
  A genuine superpower over `console.log` spam — most juniors never learn it, and it shows.
- **`console.log` the value at each step** of the path — crude but fast, pairs perfectly with bisection.
- **Rubber-duck it:** explain the code out loud, line by line, to *anything*.
  Bugs surface *while you explain*, because explaining forces:
  "wait, I assumed X but the code actually does Y."
- **Minimize:** strip the code down to the smallest thing that still shows the bug.
  It usually reveals itself as you strip away the noise.

---

## How to actually *learn* debugging

- You learn it by doing it **deliberately with this method** — not just by logging hours.
- Practice on real projects (this one, and the bigger one).
- Over months you start **pattern-matching** bugs on sight
  ("this smells like an unawaited promise"). That recognition, built from reps,
  **is** what senior debugging actually is.

### ⚠️ The AI trap (important, given you build with AI)
The fastest way to **never** learn debugging is to paste every error into the AI and
let it fix it. That robs you of the rep.

**The rule:**
1. When a bug hits, run the method **yourself first** — reproduce, read the error, bisect, hypothesize. Give it an honest 15–20 minutes.
2. **Then** use the AI if you're still stuck.
3. When it fixes it, make it **explain the root cause** — so you still get the lesson.

That way AI **accelerates** you instead of **replacing** the skill.

---

## Coached practice (how we'll do it together)
When you bring real code + real bugs into a session:
> **You drive, I coach.** You run the method (reproduce → read → bisect → hypothesize),
> I ask the guiding questions and only step in when you're genuinely stuck.
> If I just fix your bugs, you learn nothing. If I coach your reasoning, the skill sticks.

---

## One-line summary
**Reproduce → read the error → bisect to locate → hypothesize & test → change one thing →
verify → understand the root cause.** Method beats motion.
