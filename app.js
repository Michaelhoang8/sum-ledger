import { EXAMPLES, units, rounded } from "./core.js";
const $ = (id) => document.getElementById(id),
  worker = new Worker("/worker.js", { type: "module" });
let result,
  sequence = 0,
  stale = true;
const fmt = (x) => (Object.is(x, -0) ? "−0" : String(x)),
  titles = {
    naive: "Naive",
    kahan: "Kahan",
    neumaier: "Neumaier",
    pairwise: "Pairwise",
  },
  colors = ["#efb484", "#b1b8f3", "#99d3b6"];
function el(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}
function message(text, error = false) {
  $("message").textContent = text;
  $("message").classList.toggle("error", error);
}
function markStale() {
  sequence++;
  stale = true;
  $("export").disabled = true;
  message("Input changed. Recalculate to update the displayed evidence.");
}
function svg(tag, attrs) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs))
    node.setAttribute(key, value);
  return node;
}
function inspect() {
  if (!result) return;
  const step = Number($("step").value),
    row = result.trace[step - 1];
  $("step-label").textContent = `${step} / ${result.count}`;
  const grid = el("div", "");
  grid.className = "inspection-grid";
  for (const [label, value] of [
    ["Naive", row.naive],
    ["Kahan", row.kahan],
    ["Neumaier", row.neumaier],
  ]) {
    const cell = el("p", label);
    cell.append(el("b", fmt(value)));
    grid.append(cell);
  }
  $("inspection").replaceChildren(
    el(
      "p",
      `Term ${step}: ${row.token} (original position ${row.originalIndex + 1}). Rounded exact prefix: ${fmt(row.reference)}.${row.absorbed ? " The naive accumulator absorbed this nonzero term." : ""}`,
    ),
    grid,
    el(
      "p",
      `Kahan correction: ${fmt(row.kahanCorrection)} · Neumaier compensation: ${fmt(row.neumaierCompensation)}`,
    ),
  );
  draw(step);
}
function draw(step) {
  const chart = $("chart");
  chart.replaceChildren();
  const keys = ["naive", "kahan", "neumaier"];
  const errors = keys.map((key) =>
    result.trace.map((row) => {
      const delta = units(row[key]) - BigInt(row.exactUnits);
      return Math.log10(1 + rounded(delta < 0n ? -delta : delta));
    }),
  );
  const peak = Math.max(1, ...errors.flat()),
    x = (i) => 40 + (result.count === 1 ? 0 : i / (result.count - 1)) * 880,
    y = (v) => 220 - (v / peak) * 180;
  chart.append(
    svg("line", { x1: 40, y1: 220, x2: 920, y2: 220, stroke: "#59617a" }),
  );
  for (let i = 0; i < keys.length; i++)
    chart.append(
      svg("path", {
        d: errors[i].map((v, j) => `${j ? "L" : "M"}${x(j)},${y(v)}`).join(" "),
        fill: "none",
        stroke: colors[i],
        "stroke-width": 2.5,
        "stroke-dasharray": i === 1 ? "6 4" : i === 2 ? "2 4" : "none",
      }),
    );
  chart.append(
    svg("line", {
      x1: x(step - 1),
      x2: x(step - 1),
      y1: 25,
      y2: 225,
      stroke: "#e7e6f2",
      "stroke-dasharray": "3 5",
    }),
  );
  for (let i = 0; i < keys.length; i++)
    chart.append(
      svg("circle", {
        cx: x(step - 1),
        cy: y(errors[i][step - 1]),
        r: 4,
        fill: colors[i],
      }),
    );
  for (const [label, xx, yy] of [
    ["0", 14, 224],
    [peak.toFixed(2), 5, 35],
    ["Prefix 1", 40, 246],
    [String(result.count), 900, 246],
  ]) {
    const t = svg("text", { x: xx, y: yy, fill: "#afb4ce", "font-size": 11 });
    t.textContent = label;
    chart.append(t);
  }
}
function render() {
  $("answers").replaceChildren(
    ...result.results.map((method) => {
      const card = el("article", "");
      card.className = "answer";
      const status = el(
        "p",
        method.exact
          ? "Exact binary sum"
          : method.correctlyRounded
            ? "Correctly rounded"
            : "Rounding differs",
      );
      if (method.correctlyRounded) status.className = "good";
      card.append(
        el("h2", titles[method.name]),
        el("strong", fmt(method.value)),
        status,
        el("p", "Absolute error: " + fmt(method.absoluteError)),
      );
      return card;
    }),
  );
  $("reference").textContent = fmt(result.reference);
  $("exactness").textContent =
    `${result.count} terms · ${result.trace.filter((r) => r.absorbed).length} nonzero terms absorbed by the naive accumulator`;
  $("condition").textContent =
    result.exactUnits === "0"
      ? "Undefined · zero sum"
      : result.condition === null
        ? "Exceeds binary64 range"
        : fmt(result.condition);
  $("dyadic").textContent =
    `Exact reduced form: ${result.exact.numerator} × 2^${result.exact.exponent}`;
  $("decimal").textContent = result.exactDecimal;
  $("step").max = result.count;
  $("step").value = result.count;
  inspect();
}
function run() {
  const id = ++sequence;
  stale = true;
  $("export").disabled = true;
  message("Computing an exact binary reference…");
  worker.postMessage({ id, text: $("input").value, order: $("order").value });
}
worker.onmessage = ({ data }) => {
  if (data.id !== sequence) return;
  if (data.error) {
    message(data.error, true);
    return;
  }
  result = data.result;
  stale = false;
  render();
  $("export").disabled = false;
  message(
    result.underflows
      ? `${result.underflows} nonzero decimal literals underflowed to zero during parsing. Reference uses the parsed values.`
      : "Reference computed exactly before final binary64 rounding.",
  );
};
worker.onerror = () =>
  message("The calculation worker failed. Reload to restart it.", true);
$("run").onclick = run;
$("input").oninput = markStale;
$("order").onchange = run;
$("step").oninput = inspect;
$("example").onchange = () => {
  $("input").value = EXAMPLES[$("example").value];
  run();
};
$("export").onclick = () => {
  if (stale || !result) return;
  const blob = new Blob([JSON.stringify(result, null, 2) + "\n"], {
      type: "application/json",
    }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "sum-ledger-evidence.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$("input").value = EXAMPLES.cancellation;
run();
