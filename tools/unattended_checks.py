#!/usr/bin/env python3
"""Run bounded, serial game checks locally; this does not start an AI agent.

Example (keep the machine/cloud environment running):
  python3 tools/unattended_checks.py run --until 2026-10-26T13:00:00Z
  python3 tools/unattended_checks.py status
  python3 tools/unattended_checks.py stop

All generated logs and status files stay outside the checkout. A per-checkout
lock prevents overlapping runners, even when different output folders are used.
"""
import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
KEY = hashlib.sha256(str(ROOT).encode()).hexdigest()[:12]
DEFAULT_STATE = Path(tempfile.gettempdir()) / ('helium-checks-' + KEY)
LOCK = Path(tempfile.gettempdir()) / ('helium-checks-' + KEY + '.lock')
JOBS = [
    ('node-regressions', ['npm', 'test'], {}, 600),
    ('hunt-soak', ['node', 'tests/hunt_playtests.mjs'],
     {'HUNT_SESSIONS': '12', 'HUNT_MINUTES': '25'}, 180),
    ('browser-coop', ['python3', '-u', 'tests/browser_objectives_coop.py'],
     {'HM_TEST': '1'}, 300),
]


def utc():
    return datetime.now(timezone.utc)


def stamp():
    return utc().isoformat(timespec='seconds')


def deadline(value):
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('--until must include a time zone (Z or an explicit offset)')
    return parsed.astimezone(timezone.utc)


def checkout():
    def git(*args):
        return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()
    return {'commit': git('rev-parse', 'HEAD'), 'dirty': bool(git('status', '--porcelain'))}


def save(folder, state):
    state['updated_at'] = stamp()
    pending = folder / 'status.tmp'
    pending.write_text(json.dumps(state, indent=2) + '\n')
    pending.replace(folder / 'status.json')


def inside_checkout(path):
    return path == ROOT or ROOT in path.parents


def terminate(proc):
    if proc.poll() is not None:
        return
    try:
        os.killpg(proc.pid, signal.SIGTERM)
    except ProcessLookupError:
        proc.wait()
        return
    try:
        proc.wait(timeout=8)
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid, signal.SIGKILL)
        proc.wait()


def run_job(folder, state, name, command, extra, seconds, end):
    remaining = (end - utc()).total_seconds()
    if remaining <= 0 or (folder / 'STOP').exists():
        return {'name': name, 'status': 'skipped'}
    logfile = folder / f"batch-{state['batch']:02d}-{name}.log"
    env = dict(os.environ, **extra)
    if Path('/usr/bin/chromium').exists():
        env.setdefault('CHROMIUM_EXECUTABLE_PATH', '/usr/bin/chromium')
    state.update(phase='testing', job=name, log=str(logfile))
    save(folder, state)
    started = time.monotonic()
    with logfile.open('w') as output:
        output.write(json.dumps({'started_at': stamp(), 'command': command,
                                 'checkout': checkout()}) + '\n')
        output.flush()
        proc = subprocess.Popen(command, cwd=ROOT, env=env, stdout=output,
                                stderr=subprocess.STDOUT, start_new_session=True)
        result = 'passed'
        try:
            while proc.poll() is None:
                if (folder / 'STOP').exists():
                    result = 'stopped'
                    break
                if utc() >= end or time.monotonic() - started >= seconds:
                    result = 'timed-out'
                    break
                time.sleep(min(2, max(0.01, (end - utc()).total_seconds())))
            if result != 'passed':
                terminate(proc)
            elif proc.returncode:
                result = 'failed'
        finally:
            terminate(proc)
    return {'name': name, 'status': result, 'exit_code': proc.returncode,
            'seconds': round(time.monotonic() - started, 2), 'log': str(logfile)}


def run(args, folder):
    end = deadline(args.until)
    if end <= utc():
        raise ValueError('--until is already in the past; no checks were scheduled')
    if not math.isfinite(args.interval_minutes) or args.interval_minutes < 10:
        raise ValueError('--interval-minutes must be at least 10')
    with LOCK.open('a+') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError('a check runner is already active for this checkout') from None
        lock.seek(0)
        lock.truncate()
        lock.write(json.dumps({'pid': os.getpid(), 'state_dir': str(folder)}))
        lock.flush()
        folder.mkdir(parents=True, exist_ok=True)
        (folder / 'STOP').unlink(missing_ok=True)
        state = {'pid': os.getpid(), 'root': str(ROOT), 'state_dir': str(folder), 'started_at': stamp(),
                 'until': end.isoformat(), 'interval_minutes': args.interval_minutes,
                 'batch': 0, 'phase': 'starting', 'kind': 'tests-only'}
        save(folder, state)
        try:
            while utc() < end and not (folder / 'STOP').exists():
                scheduled = time.monotonic()
                state.update(batch=state['batch'] + 1, checkout_before=checkout(), results=[])
                for name, command, env, timeout in JOBS:
                    state['results'].append(run_job(folder, state, name, command, env, timeout, end))
                    save(folder, state)
                    if utc() >= end or (folder / 'STOP').exists():
                        break
                state['checkout_after'] = checkout()
                state['stable_revision'] = (state['checkout_before'] == state['checkout_after']
                                             and not state['checkout_after']['dirty'])
                # A batch performed while a developer edits is useful diagnostics,
                # but must not be represented as verification of an exact commit.
                with (folder / 'batches.jsonl').open('a') as report:
                    report.write(json.dumps(dict(state, finished_at=stamp())) + '\n')
                state.update(phase='waiting', job=None)
                save(folder, state)
                next_run = scheduled + args.interval_minutes * 60
                # Do not catch up missed intervals or start overlapping jobs.
                while time.monotonic() < next_run and utc() < end and not (folder / 'STOP').exists():
                    time.sleep(min(2, next_run - time.monotonic(), max(.01, (end - utc()).total_seconds())))
            state.update(phase='stopped' if (folder / 'STOP').exists() else 'finished', job=None)
            save(folder, state)
        except BaseException:
            state.update(phase='interrupted', job=None)
            save(folder, state)
            raise


def main():
    # Ensure an environment stop also terminates the current test's process group.
    signal.signal(signal.SIGTERM, lambda signum, frame: sys.exit(128 + signum))
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('action', choices=['run', 'status', 'stop'])
    parser.add_argument('--state-dir', type=Path, default=DEFAULT_STATE)
    parser.add_argument('--until', help='Required for run: ISO-8601 deadline with time zone')
    parser.add_argument('--interval-minutes', type=float, default=30)
    args = parser.parse_args()
    folder = args.state_dir.resolve()
    try:
        if inside_checkout(folder):
            raise ValueError('--state-dir must be outside the checkout')
        if args.action == 'run':
            if not args.until:
                raise ValueError('run requires --until; indefinite work is not scheduled')
            run(args, folder)
        elif args.action == 'stop':
            if not (folder / 'status.json').exists():
                raise ValueError('no runner status exists in this folder')
            (folder / 'STOP').touch()
            print('Stop requested; the current job and its children will terminate.')
        else:
            state = json.loads((folder / 'status.json').read_text())
            with LOCK.open('a+') as lock:
                try:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    state['runner_active'] = False
                except BlockingIOError:
                    lock.seek(0)
                    active = json.loads(lock.read())
                    state['runner_active'] = active.get('pid') == state.get('pid') and active.get('state_dir') == str(folder)
            print(json.dumps(state, indent=2))
    except (ValueError, FileNotFoundError) as error:
        parser.exit(1, str(error) + '\n')


if __name__ == '__main__':
    main()
