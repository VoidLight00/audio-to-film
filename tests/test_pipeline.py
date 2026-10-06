import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from analyze import analyze, command
from create_video import treatment
from render import frame, noise


class PipelineTests(unittest.TestCase):
    def test_time_seed_determinism_and_order(self):
        a = frame(.75, 4, (160, 90), 9, [0, .5, 1])
        frame(2, 4, (160, 90), 9)
        self.assertTrue(np.array_equal(a, frame(.75, 4, (160, 90), 9, [0, .5, 1])))
        self.assertFalse(np.array_equal(a, frame(1.5, 4, (160, 90), 9)))

    def test_noise_is_continuous_across_old_twelve_hz_boundary(self):
        before = noise((90, 160), 9, 1 / 12 - .0001, 1)
        after = noise((90, 160), 9, 1 / 12 + .0001, 1)
        self.assertLess(float(np.mean(np.abs(after - before))), .001)

    def test_synthetic_onsets_and_no_fabricated_words(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            command(['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i',
                     r'aevalsrc=0.4*sin(2*PI*440*t)*lt(mod(t\,0.5)\,0.08):s=11025:d=4',
                     str(directory / 'clicks.wav')])
            measured = analyze(directory / 'clicks.wav', directory)
            self.assertGreaterEqual(len(measured['beats']), 4)
            self.assertEqual(measured['vocals']['words'], [])
            self.assertEqual(measured['vocals']['status'], 'unknown')
            self.assertTrue(treatment(measured)['scenes'])

    def test_subprocess_failure(self):
        with self.assertRaises(RuntimeError):
            command(['ffmpeg', '-v', 'error', '-i', '/nonexistent/input.wav', '-f', 'null', '-'])


if __name__ == '__main__':
    unittest.main()
