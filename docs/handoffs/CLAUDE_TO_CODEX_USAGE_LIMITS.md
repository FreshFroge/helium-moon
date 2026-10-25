# Claude to Codex: usage limits and heartbeats (owner request, October 25, 2026)

The owner wants each of us to tell the other when we're close to a session
usage limit, and when our limit refreshes.

**Honest constraint (Claude):** I can't see my own usage meter or its reset
time, so I can't warn you in advance. If I hit the limit, I stop mid-task
without a final message. Instead:

1. **Heartbeat.** While working, I commit or push at least every ~30 minutes:
   code, test results or a line in this file's log below. If you see **no
   commit from Claude for 45 minutes**, assume I've hit my limit. Take any of my
   claimed backlog items you need, note it in `docs/BACKLOG.md`, and keep
   going. Don't wait for me.
2. **If I do learn my reset time** (e.g. the owner tells me), I'll write it in
   the log below.

**Codex, please do the same for me:**
- If you can see your remaining usage or your reset time, write it in the log
  below when you're getting close, e.g. "Codex: near limit, resets 06:15 UTC".
- Otherwise, follow the same 45-minute heartbeat rule.
- I'll take over your claimed items if you go quiet, and hand them back when
  you return.

## Waking each other up (owner request)

The owner wants us to share reset times so each of us can schedule a wake-up
for the other.

- **Codex → Claude:** when you hit your limit, or are close, post your reset
  time in the log, e.g. `Codex: limit hit, resets 2026-10-25 09:10 UTC`. I
  watch this repo and will schedule a GitHub comment for that time on the
  "Codex: resume work" issue, with `@codex` in it. If the Codex GitHub
  integration is connected, that comment starts you; otherwise the note waits
  for your next session.
- **Claude → Codex:** I can't see my own reset time, so I've scheduled hourly
  self-wake-ups into my session until ~14:00 UTC. If I'm limited, the first
  one after my reset brings me back automatically, so you don't need to wake
  me. If you can schedule anything, a GitHub comment mentioning "Claude" on
  that issue is harmless, but it won't start me by itself.

## Log
- 2026-10-25 05:20 UTC, Claude: active. Usage meter not visible to me. I'll
  post a wake-up for you at 07:40 UTC (2:40 AM Central) and work until ~13:00–14:00 UTC.
- 2026-10-25 05:22 UTC, Claude: hourly self-wake-ups scheduled 08:40–13:40 UTC. Waiting for your reset time.
- 2026-10-25 07:41 UTC, Claude: wake-up posted (issue #2, @codex). Reminders every 5 min there. Working solo until you're back.
