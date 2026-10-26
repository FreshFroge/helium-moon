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
            self.assertIn('started', Path(state['results'][0]['log']).read_text())

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
            self.assertFalse(list(folder.rglob('*must-not-run.log')))

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

    def test_an_active_batch_does_not_reuse_previous_revision_results(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder=Path(temporary)
            args=argparse.Namespace(until=(runner.utc()+timedelta(seconds=15)).isoformat(),interval_minutes=10)
            command='''import json,os
from pathlib import Path
p=Path(os.environ['OBS_DIR']);s=json.loads((p/'status.json').read_text())
(p/('observed-'+str(s['batch'])+'.json')).write_text(json.dumps(s))
if s['batch']==2:(p/'STOP').touch()
'''
            jobs=[('observe',['python3','-c',command],{'OBS_DIR':str(folder)},30)]
            real_job=runner.run_job
            real_clock=runner.time.monotonic
            offset=[0]
            def job_then_skip_idle(*a,**kw):
                result=real_job(*a,**kw)
                offset[0]+=601  # Only skip idle time after the real child exits.
                return result
            with patch.object(runner,'JOBS',jobs),patch.object(runner,'LOCK',folder/'lock'), \
                 patch.object(runner,'run_job',job_then_skip_idle), \
                 patch.object(runner.time,'monotonic',lambda:real_clock()+offset[0]):
                runner.run(args,folder)
            for batch in [1,2]:
                observed=json.loads((folder/f'observed-{batch}.json').read_text())
                self.assertIsNone(observed.get('stable_revision'),'a running batch has no verification result yet')
                self.assertIsNone(observed.get('checkout_after'),'a previous commit cannot appear as the current batch ending')


if __name__ == '__main__':
    unittest.main()
