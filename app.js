import { EXAMPLES, units, rounded } from "./core.js";
const $ = (id) => document.getElementById(id),
  worker = new Worker("/worker.js", { type: "module" });
let result,
  sequence = 0,
  stale = true,
  chartResult = null,
  chartErrors = [],
  chartPeak = 1;
const fmt = (x) => (Object.is(x, -0) ? "−0" : String(x)),
  titles = {
    naive: "Naive",
    kahan: "Kahan",
    neumaier: "Neumaier",
    pairwise: "Pairwise",
  },
  colors = ["#ba713f", "#8176b6", "#5d947f"];
function el(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}
function message(text, error = false) {
  $("message").textContent = text;
  $("message").classList.toggle("error", error);
  $("edit-message").textContent = text;
  $("edit-message").classList.toggle("error", error);
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
  const chart = $("chart"),
    keys = ["naive", "kahan", "neumaier"];
  const x = (i) => 40 + (result.count === 1 ? 0 : i / (result.count - 1)) * 880;
  if (chartResult !== result) {
    chartErrors = keys.map((key) =>
      result.trace.map((row) => {
        const delta = units(row[key]) - BigInt(row.exactUnits);
        return Math.log10(1 + rounded(delta < 0n ? -delta : delta));
      }),
    );
    chartPeak = Math.max(1, ...chartErrors.flat());
    chart.replaceChildren();
    chart.append(
      svg("rect", { id: "prefix-wash", x: 40, y: 25, width: 0, height: 200 }),
    );
    for (let i = 0; i <= 4; i++) {
      const yy = 220 - i * 45;
      chart.append(
        svg("line", { x1: 40, x2: 920, y1: yy, y2: yy, class: "grid-line" }),
      );
      const label = svg("text", { x: 5, y: yy + 4 });
      label.textContent = ((chartPeak * i) / 4).toFixed(2);
      chart.append(label);
    }
    for (let i = 0; i < keys.length; i++)
      chart.append(
        svg("path", {
          d: chartErrors[i]
            .map(
              (v, j) =>
                `${j ? "L" : "M"}${x(j)},${220 - (v / chartPeak) * 180}`,
            )
            .join(" "),
          fill: "none",
          stroke: colors[i],
          "stroke-width": 2.5,
          "stroke-dasharray": i === 1 ? "6 4" : i === 2 ? "2 4" : "none",
          class: "trace-line",
        }),
      );
    chart.append(
      svg("line", {
        id: "prefix-cursor",
        x1: 0,
        x2: 0,
        y1: 25,
        y2: 225,
        "stroke-dasharray": "3 5",
      }),
    );
    for (let i = 0; i < keys.length; i++)
      chart.append(
        svg("circle", {
          id: `marker-${i}`,
          cx: 0,
          cy: 0,
          r: 4,
          fill: colors[i],
          class: "trace-marker",
        }),
      );
    for (const [label, xx] of [
      ["Prefix 1", 40],
      [String(result.count), 900],
    ]) {
      const t = svg("text", { x: xx, y: 246 });
      t.textContent = label;
      chart.append(t);
    }
    chartResult = result;
  }
  $("prefix-wash").style.width = `${x(step - 1) - 40}px`;
  $("prefix-cursor").style.transform = `translateX(${x(step - 1)}px)`;
  for (let i = 0; i < keys.length; i++)
    $(`marker-${i}`).style.transform =
      `translate(${x(step - 1)}px,${220 - (chartErrors[i][step - 1] / chartPeak) * 180}px)`;
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
$("edit-open").onclick = () => $("edit-dialog").showModal();
$("edit-close").onclick = () => $("edit-dialog").close();
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
