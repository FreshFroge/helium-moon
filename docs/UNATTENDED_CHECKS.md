# Unattended local checks

`tools/unattended_checks.py` runs serial validation batches on a Linux host:

1. `npm test` — gameplay, AI, animation, startup and network regressions.
2. Twelve scripted hunt sessions, each with a 25-minute simulated limit.
3. Two actual browser clients — leaning, briefing, shared supplies and repairs,
   main-river crossing/return and shared handwheel/compass-aerial operation.

This is scheduled testing. It does not start an AI, edit code, consume AI API
messages, or activate Claude/Kimi. The computer/cloud environment must remain
running. The present cloud session cannot configure a persistent Codex wake-up:
no scheduling tool is available and the installed Codex runner cannot initialize
its app-server storage. GitHub API access is blocked here as well.

Use an explicit deadline; this example ends at 8 a.m. America/Chicago on
October 26, 2026. Adjust the date/offset for another night.

```bash
nohup python3 tools/unattended_checks.py run \
  --until 2026-10-26T13:00:00Z --interval-minutes 30 \
  > /tmp/helium-unattended-launch.log 2>&1 < /dev/null &
python3 tools/unattended_checks.py status
python3 tools/unattended_checks.py stop
```

Requires Node/npm, Python 3, Playwright and Chromium, matching the browser-test
requirements. `/usr/bin/chromium` is detected automatically; otherwise set
`CHROMIUM_EXECUTABLE_PATH`. Logs, current status and `batches.jsonl` are written
outside the checkout, to the directory printed by `status` in each log path.
Use `--state-dir /tmp/a-specific-run` consistently to choose a different folder.

The runner enforces one process per checkout, a ten-minute minimum interval,
individual job timeouts and the final deadline. Missed intervals are not queued.
Stopping terminates the current job and its child processes. It records failures
and continues to the next check; it never changes Git branches or pushes code.
Each batch records the starting/ending commit and dirty state. A batch spanning
active edits is labeled `stable_revision: false`; do not cite it as verification
of an exact commit. These scripted checks complement human playtesting and do
not establish perceived scariness, visual fidelity or hardware frame rate.

Validate the runner's actual deadline/stop/locking behavior with:

```bash
python3 tests/unattended_checks_test.py
```
