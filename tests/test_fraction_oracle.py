"""Independent Python Fraction oracle for the JavaScript binary accumulator."""
import json
import math
from pathlib import Path
import random
import subprocess
import unittest
from fractions import Fraction


class FractionOracleTests(unittest.TestCase):
    def test_random_float_sums_and_rounding_match_exact_rationals(self):
        rng = random.Random(73)
        cases = []
        for _ in range(200):
            xs = [math.ldexp(rng.uniform(-1, 1), rng.randint(-1070, 995)) for _ in range(rng.randint(1, 40))]
            cases.append(xs)
        cases += [[1e300, -1e300, 5e-324], [1, 2**-53], [1 + 2**-52, 2**-53], [0.01]*100]
        source = """
        import {analyze} from './core.js';
        let input=''; for await (const chunk of process.stdin) input+=chunk;
        console.log(JSON.stringify(JSON.parse(input).map(xs=>{
          const r=analyze(xs.map(String).join(','));
          return {reference:r.reference,units:r.exactUnits,decimal:r.exactDecimal,results:r.results};
        })));
        """
        result = subprocess.run(['node', '--input-type=module', '-e', source], input=json.dumps(cases), text=True, capture_output=True, check=True, cwd=Path(__file__).resolve().parents[1])
        for xs, actual in zip(cases, json.loads(result.stdout, parse_int=float), strict=True):
            exact = sum(map(Fraction.from_float, xs), Fraction())
            self.assertEqual(actual['reference'], float(exact))
            self.assertEqual(Fraction(int(actual['units']), 2**1074), exact)
            self.assertEqual(Fraction(actual['decimal']), exact)
            for method in actual['results']:
                error = Fraction.from_float(method['value']) - exact
                self.assertEqual(Fraction(int(method['errorUnits']), 2**1074), error)
                self.assertEqual(method['absoluteError'], float(abs(error)))


if __name__ == '__main__':
    unittest.main()
