const view = new DataView(new ArrayBuffer(8));
const FRAC = (1n << 52n) - 1n;
export function units(value) {
  if (!Number.isFinite(value))
    throw Error("Only finite binary64 values have integer units.");
  view.setFloat64(0, value, false);
  const bits = view.getBigUint64(0, false),
    exponent = Number((bits >> 52n) & 2047n),
    fraction = bits & FRAC;
  const magnitude =
    exponent === 0
      ? fraction
      : ((1n << 52n) + fraction) << BigInt(exponent - 1);
  return bits >> 63n ? -magnitude : magnitude;
}
export function rounded(value) {
  const negative = value < 0n;
  let magnitude = negative ? -value : value;
  if (!magnitude) return 0;
  const shift = Math.max(0, magnitude.toString(2).length - 53);
  let significand = magnitude >> BigInt(shift);
  if (shift) {
    const remainder = magnitude - (significand << BigInt(shift)),
      half = 1n << BigInt(shift - 1);
    if (remainder > half || (remainder === half && significand & 1n))
      significand++;
  }
  const result = Number(significand) * 2 ** (shift - 1074);
  return negative ? -result : result;
}
export function dyadic(value) {
  if (!value) return { numerator: "0", exponent: 0 };
  let exponent = -1074;
  while (value % 2n === 0n) {
    value /= 2n;
    exponent++;
  }
  return { numerator: String(value), exponent };
}
export function exactDecimal(value) {
  const sign = value < 0n ? "-" : "";
  const reduced = dyadic(value < 0n ? -value : value);
  const n = BigInt(reduced.numerator),
    e = reduced.exponent;
  if (e >= 0) return sign + String(n << BigInt(e));
  const places = -e,
    digits = String(n * 5n ** BigInt(places)).padStart(places + 1, "0");
  return sign + digits.slice(0, -places) + "." + digits.slice(-places);
}
export function parse(text) {
  if (typeof text !== "string" || text.length > 200000)
    throw Error("Input is limited to 200,000 characters.");
  const tokens = text
    .trim()
    .split(/[\s,;]+/)
    .filter(Boolean);
  if (!tokens.length || tokens.length > 2048)
    throw Error(
      "Provide 1–2,048 decimal numbers, separated by whitespace or commas.",
    );
  return tokens.map((token, i) => {
    if (
      token.length > 64 ||
      !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(token)
    )
      throw Error(`Token ${i + 1} is not a decimal number.`);
    const value = Number(token);
    if (!Number.isFinite(value) || Math.abs(value) > 1e300)
      throw Error(`Token ${i + 1} exceeds the magnitude limit of 1e300.`);
    return {
      token,
      value,
      originalIndex: i,
      underflow: value === 0 && /[1-9]/.test(token.split(/[eE]/)[0]),
    };
  });
}
export function pairwise(values) {
  if (!values.length) return 0;
  if (values.length === 1) return values[0];
  const middle = Math.floor(values.length / 2);
  return pairwise(values.slice(0, middle)) + pairwise(values.slice(middle));
}
export function analyze(text, order = "original") {
  const inputs = parse(text);
  if (!["original", "reverse", "ascending", "descending"].includes(order))
    throw Error("Unknown input order.");
  const ordered = [...inputs];
  if (order === "reverse") ordered.reverse();
  if (order === "ascending")
    ordered.sort(
      (a, b) =>
        Math.abs(a.value) - Math.abs(b.value) ||
        a.originalIndex - b.originalIndex,
    );
  if (order === "descending")
    ordered.sort(
      (a, b) =>
        Math.abs(b.value) - Math.abs(a.value) ||
        a.originalIndex - b.originalIndex,
    );
  let naive = 0,
    kahan = 0,
    correction = 0,
    neumaier = 0,
    compensation = 0,
    exact = 0n,
    absolute = 0n;
  const trace = [];
  for (const [index, item] of ordered.entries()) {
    const x = item.value,
      u = units(x);
    exact += u;
    absolute += u < 0n ? -u : u;
    const previous = naive;
    naive += x;
    const adjusted = x - correction,
      next = kahan + adjusted;
    correction = next - kahan - adjusted;
    kahan = next;
    const nextN = neumaier + x;
    compensation +=
      Math.abs(neumaier) >= Math.abs(x)
        ? neumaier - nextN + x
        : x - nextN + neumaier;
    neumaier = nextN;
    trace.push({
      index: index + 1,
      ...item,
      naive,
      kahan,
      neumaier: neumaier + compensation,
      kahanCorrection: correction,
      neumaierCompensation: compensation,
      exactUnits: String(exact),
      reference: rounded(exact),
      absorbed: x !== 0 && naive === previous,
    });
  }
  const reference = rounded(exact),
    results = Object.entries({
      naive,
      kahan,
      neumaier: neumaier + compensation,
      pairwise: pairwise(ordered.map((i) => i.value)),
    }).map(([name, value]) => {
      const error = units(value) - exact;
      return {
        name,
        value,
        errorUnits: String(error),
        error: dyadic(error),
        absoluteError: rounded(error < 0n ? -error : error),
        correctlyRounded: value === reference,
        exact: error === 0n,
      };
    });
  return {
    format: "sum-ledger-evidence-v1",
    text,
    order,
    count: inputs.length,
    underflows: inputs.filter((x) => x.underflow).length,
    exactUnits: String(exact),
    exact: dyadic(exact),
    exactDecimal: exactDecimal(exact),
    reference,
    absoluteInputSum: rounded(absolute),
    condition:
      exact === 0n || !Number.isFinite(rounded(absolute) / Math.abs(reference))
        ? null
        : rounded(absolute) / Math.abs(reference),
    results,
    trace,
  };
}
export const EXAMPLES = {
  cancellation: "10000000000000000\n1\n-10000000000000000",
  pennies: Array(100).fill("0.01").join("\n"),
  absorption: [
    "10000000000000000",
    ...Array(32).fill("1"),
    "-10000000000000000",
  ].join("\n"),
  subnormal: "5e-324\n5e-324\n-5e-324",
};
