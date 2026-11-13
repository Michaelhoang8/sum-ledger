import test from "node:test";
import assert from "node:assert/strict";
import {
  units,
  rounded,
  exactDecimal,
  parse,
  pairwise,
  analyze,
  EXAMPLES,
} from "../core.js";
test("binary64 lattice maps normals, subnormals, signs and signed zero exactly", () => {
  assert.equal(units(1), 1n << 1074n);
  assert.equal(units(-1), -(1n << 1074n));
  assert.equal(units(Number.MIN_VALUE), 1n);
  assert.equal(units(-0), 0n);
  assert.equal(units(2 ** -1022), 1n << 52n);
  assert.equal(units(1.5), 3n << 1073n);
  assert.equal(
    exactDecimal(units(0.1)),
    "0.1000000000000000055511151231257827021181583404541015625",
  );
  assert.equal(exactDecimal(units(-2.5)), "-2.5");
  assert.equal(exactDecimal(0n), "0");
});
test("ties round to even including negative, carry and subnormal boundary", () => {
  const one = units(1),
    ulp = units(2 ** -52);
  assert.equal(rounded(one + ulp / 2n), 1);
  assert.equal(rounded(one + ulp + ulp / 2n), 1 + 2 ** -51);
  assert.equal(rounded(-one - ulp / 2n), -1);
  assert.equal(rounded(units(2) - ulp / 2n), 2);
  assert.equal(rounded((1n << 52n) - 1n), 2 ** -1022 - Number.MIN_VALUE);
  assert.equal(rounded(units(Number.MAX_VALUE)), Number.MAX_VALUE);
  assert.equal(rounded(1n << 2098n), Infinity);
});
test("ten thousand finite bit patterns round-trip exactly", () => {
  const buffer = new DataView(new ArrayBuffer(8));
  let seed = 73;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed >>> 0;
  };
  for (let i = 0; i < 10000; i++) {
    buffer.setUint32(0, random());
    buffer.setUint32(4, random());
    const x = buffer.getFloat64(0);
    if (Number.isFinite(x)) assert.equal(rounded(units(x)), x === 0 ? 0 : x);
  }
});
test("cancellation distinguishes Kahan from Neumaier without claiming universal accuracy", () => {
  const result = analyze(EXAMPLES.cancellation);
  assert.equal(result.reference, 1);
  assert.deepEqual(
    result.results.map((r) => r.value),
    [0, 0, 1, 0],
  );
  assert.equal(result.trace[1].absorbed, true);
  assert.equal(analyze(EXAMPLES.cancellation, "ascending").results[0].value, 0);
  const pennies = analyze(EXAMPLES.pennies);
  assert.equal(pennies.reference, 1);
  assert.equal(pennies.results[1].correctlyRounded, true);
  assert.equal(pennies.results[1].exact, false);
  assert.equal(analyze(EXAMPLES.subnormal).reference, Number.MIN_VALUE);
});
test("bounded integer inputs match an independent BigInt sum for all methods and orders", () => {
  let seed = 17;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  for (let t = 0; t < 300; t++) {
    const xs = Array.from(
      { length: 1 + (random() % 100) },
      () => (random() % 2000001) - 1000000,
    );
    const expected = Number(xs.reduce((s, x) => s + BigInt(x), 0n));
    for (const order of ["original", "reverse", "ascending", "descending"]) {
      const r = analyze(xs.join(","), order);
      assert.equal(r.reference, expected);
      for (const method of r.results) assert.equal(method.value, expected);
    }
  }
});
test("exact references are permutation invariant and prefix differences equal inputs", () => {
  const text = EXAMPLES.absorption;
  let exact;
  for (const order of ["original", "reverse", "ascending", "descending"]) {
    const r = analyze(text, order);
    exact ??= r.exactUnits;
    assert.equal(r.exactUnits, exact);
    let previous = 0n;
    for (const row of r.trace) {
      assert.equal(BigInt(row.exactUnits) - previous, units(row.value));
      previous = BigInt(row.exactUnits);
    }
  }
  assert.equal(analyze(text).reference, 32);
  assert.equal(pairwise([]), 0);
});
test("parser rejects non-decimal syntax and reports decimal underflow", () => {
  for (const text of [
    "",
    "Infinity",
    "NaN",
    "0xff",
    "1_000",
    "1e301",
    "1/2",
    "1".repeat(65),
    Array(2049).fill("1").join(","),
  ])
    assert.throws(() => parse(text));
  assert.equal(parse("1e-999")[0].underflow, true);
  assert.equal(parse("0e999")[0].underflow, false);
  assert.equal(parse(" +.5; -2.,3e2\n0 ").length, 4);
  assert.throws(() => analyze("1", "random"));
});
