"""Check the local runner's hard deadline, stop and duplicate-run behavior."""
import argparse
from datetime import timedelta
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('runner', Path(__file__).resolve().parents[1] / 'tools/unattended_checks.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class RunnerChecks(unittest.TestCase):
    def test_deadline_terminates_a_real_child(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            args = argparse.Namespace(until=(runner.utc() + timedelta(seconds=.3)).isoformat(), interval_minutes=30)
            jobs = [('slow', ['python3', '-u', '-c', 'import time; print("started"); time.sleep(30)'], {}, 60)]
            with patch.object(runner, 'JOBS', jobs), patch.object(runner, 'LOCK', folder / 'lock'):
                runner.run(args, folder)
            state = json.loads((folder / 'status.json').read_text())
            self.assertEqual(state['phase'], 'finished')
            self.assertEqual(state['results'][0]['status'], 'timed-out')
            self.assertLess(state['results'][0]['seconds'], 3)
            self.assertIsNotNone(state['results'][0]['exit_code'])
            self.assertIn('started', (folder / 'batch-01-slow.log').read_text())

    def test_stop_prevents_following_jobs(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            args = argparse.Namespace(until=(runner.utc() + timedelta(seconds=5)).isoformat(), interval_minutes=30)
            jobs = [('stop', ['python3', '-c', 'import os; from pathlib import Path; Path(os.environ["STOP_FILE"]).touch()'],
                     {'STOP_FILE': str(folder / 'STOP')}, 10),
                    ('must-not-run', ['python3', '-c', 'raise RuntimeError("unexpected job")'], {}, 10)]
            with patch.object(runner, 'JOBS', jobs), patch.object(runner, 'LOCK', folder / 'lock'):
                runner.run(args, folder)
            state = json.loads((folder / 'status.json').read_text())
            self.assertEqual(state['phase'], 'stopped')
            self.assertFalse((folder / 'batch-01-must-not-run.log').exists())

    def test_duplicate_runner_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            args = argparse.Namespace(until=(runner.utc() + timedelta(seconds=5)).isoformat(), interval_minutes=30)
            lockfile = folder / 'lock'
            with lockfile.open('a+') as existing, patch.object(runner, 'LOCK', lockfile):
                runner.fcntl.flock(existing, runner.fcntl.LOCK_EX | runner.fcntl.LOCK_NB)
                with self.assertRaisesRegex(ValueError, 'already active'):
                    runner.run(args, folder / 'second')
            self.assertFalse((folder / 'second').exists())


if __name__ == '__main__':
    unittest.main()
