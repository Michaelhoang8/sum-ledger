# Sum Ledger

A numerical-precision workbench comparing naive, Kahan, Neumaier, and midpoint pairwise summation against an exact BigInt accumulator. Inspect cancellation, absorbed terms, input reordering, and the difference between an exact answer and a correctly rounded one.

![Workbench](docs/workbench.png)

## Run

Requires Python 3.10+ to serve the static files and a modern browser with BigInt, DataView bigint access, and module workers. Node 22+ runs the tests; there are no package dependencies.

```sh
python run.py --port 8000
```

Open http://127.0.0.1:8000. Computation runs locally in a browser worker. Inputs are not uploaded or persisted. The server exposes only a fixed asset allowlist.

## Experiments

- **A disappearing one:** `1e16, 1, -1e16` gives 0 for naive, Kahan, and this pairwise split; Neumaier gives 1. Large magnitudes first lets naive recover 1, but this pairwise split still returns 0.
- **Thirty-two small additions:** `1e16`, thirty-two ones, then `-1e16`. Naive returns 0; Kahan and Neumaier return 32; pairwise returns 30.
- **One hundred pennies:** the exact binary input sum is `1.000000000000000020816681711721685132943093776702880859375`. Its correctly rounded binary64 value is 1. Decimal interpretation and binary interpretation are different questions.
- **At the smallest scale:** subnormal inputs remain exact multiples of the smallest positive binary64 value.

The prefix slider supports arrow keys. Each inspection shows the input's original position, rounded exact prefix, both compensation variables, and whether naive addition absorbed a nonzero term. The chart shows `log10(1 + absolute error)` for three sequential methods; pairwise is a final-result comparison, not a streaming algorithm. Tiny errors can be visually indistinguishable at this chart scale; the evidence retains their exact values.

Editing text disables exports until a successful recalculation. Unknown syntax, excessive counts, and out-of-range magnitudes produce visible errors. Nonzero decimal literals that underflow to zero are accepted with a warning.

## Exact reference

Every finite binary64 input is an integer multiple of `2^-1074`. `core.js` decodes the sign, exponent, and significand with DataView and sums these integer units using BigInt. A separate routine rounds the final integer to 53 significant bits, using round-to-nearest/ties-to-even. It also emits a reduced dyadic form and full exact decimal expansion.

The reference is exact for the **parsed binary64 values**, not the original decimal fractions. Signed zeros are identified in the accumulator. All four approximate algorithms use ordinary binary64 operations; none is claimed to be universally exact. Neumaier's displayed prefix is its running sum plus compensation, rounded to binary64.

The condition estimate is the rounded absolute-input sum divided by the magnitude of the rounded exact sum. It is an approximate sensitivity indicator, not a forward-error bound. A zero exact sum or an overflowing ratio is represented by `null`, distinguished by `exactUnits`. Error units in the export are signed integers, always interpreted at exponent -1074. Absolute error displays are rounded, while `errorUnits` preserves exact differences.

Input limits are 2,048 decimal tokens, 64 characters per token, 200,000 characters overall, and absolute magnitude 1e300 per parsed value. These limits keep algorithm intermediates finite. Decimal syntax permits signs, exponents, whitespace, commas, and semicolons; hexadecimal, Infinity, NaN, and expressions are rejected.

## Verify

```sh
npm test
npm run check
python -m unittest discover -s tests -v
```

Seven JavaScript tests include 10,000 finite bit-pattern round trips, rounding ties and subnormal boundaries, 300 generated integer arrays in four orders, cancellation examples, parser bounds, and exact prefix invariants. The Python Fraction oracle independently checks 204 randomized/adversarial datasets: exact sums, correctly rounded references, full decimal expansions, and every algorithm's exact error. A second Python test checks the HTTP asset boundary. CI covers Node 22/24 on Linux and Node 24 on Windows.

Browser checks cover prefix keyboard navigation, order changes, decimal expansion, stale export protection, parse errors, underflow warnings, and recovery. The exported 34-term example was independently replayed with Python rational arithmetic.

## Reading

[Higham's analysis of floating-point summation](https://nhigham.com/wp-content/uploads/2023/10/high93s.pdf) discusses summation accuracy and conditioning. [Kahan's compensated-summation notes](https://www.arithmazium.org/library/lib/wk_analysis_and_application_of_simply_compensated_summation_oct93.pdf) explain the compensation idea. [Python's math.fsum documentation](https://docs.python.org/3/library/math.html#math.fsum) describes a different accurate summation implementation based on intermediate partial sums; this app does not implement or claim equivalence to `math.fsum`.
