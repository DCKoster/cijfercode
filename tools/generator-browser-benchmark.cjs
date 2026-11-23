const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync, writeFileSync } = require("node:fs");
const { createServer } = require("node:http");
const { extname, join, resolve } = require("node:path");
const { chromium } = require("playwright");

const [baseline, candidate, output] = process.argv.slice(2);
assert(baseline && candidate && output, "Pass baseline dist, candidate dist, and the output JSON path");
const themes = { animals_familiar: "Bekende dieren", animals_all: "Alle dieren", general: "Geen thema" };
const workloads = [
  ...Array.from({ length: 5 }, (_, index) => ({ name: `play-${index + 1}`, mode: "play", theme: "animals_familiar", count: 4 })),
  ...Object.keys(themes).map((theme) => ({ name: `booklet-${theme}`, mode: "booklet", theme, count: 50 })),
];
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

function serveBuild(dir) {
  return createServer((request, response) => {
    try {
      const pathname = new URL(request.url, "http://localhost").pathname;
      const root = resolve(dir);
      const file = join(root, pathname === "/" ? "index.html" : pathname);
      assert(file.startsWith(root + "/"));
      const contents = readFileSync(file);
      response.writeHead(200, { "Content-Type": types[extname(file)] });
      response.end(contents);
    } catch {
      response.writeHead(404).end();
    }
  });
}

function instrumentWorker(name) {
  const OriginalWorker = window.Worker;
  window.outcomes = [];
  window.Worker = class extends OriginalWorker {
    constructor(url, options) {
      super(url, options);
      const original = this.postMessage.bind(this);
      const pending = new Map();
      let index = 0;
      this.postMessage = (request) => {
        if (request.type === "generate") {
          request = { ...request, seed: `browser-procedural-v1:${name}:${++index}` };
          pending.set(request.requestId, { start: performance.now(), seed: request.seed });
        }
        original(request);
      };
      this.addEventListener("message", ({ data }) => {
        const task = pending.get(data.requestId);
        if (!task || data.type === "progress") return;
        pending.delete(data.requestId);
        const puzzle = data.puzzle;
        window.outcomes.push({
          seed: task.seed,
          milliseconds: performance.now() - task.start,
          type: data.type,
          error: data.message,
          diagnostics: data.diagnostics,
          signature: puzzle && {
            layout: puzzle.grid.flat().map((code) => code === null ? "#" : ".").join(""),
            answers: puzzle.solution.entries.map(({ word }) => word),
            codes: new Set(puzzle.grid.flat().filter((code) => code !== null)).size,
            letters: new Set(puzzle.solution.grid.flat().filter((letter) => letter !== null)).size,
          },
        });
      });
    }
  };
}

const reflections = [0, 1, 2, 3].map((flip) => Array.from({ length: 340 }, (_, index) => {
  const row = Math.floor(index / 17), col = index % 17;
  return (flip & 1 ? 19 - row : row) * 17 + (flip & 2 ? 16 - col : col);
}));
function distance(left, right) {
  return Math.min(...reflections.map((reflection) => reflection.reduce((sum, index, position) =>
    sum + (left[position] !== right[index]), 0)));
}
function percentile(values, p) {
  return values.length ? [...values].sort((a, b) => a - b)[Math.ceil(p * values.length) - 1] : null;
}
function summarize(outcomes, wallMilliseconds, build) {
  const successes = outcomes.filter(({ type }) => type === "result");
  const signatures = successes.map(({ signature }) => ({ ...signature, answers: new Set(signature.answers) }));
  const nearest = [], maximumOverlap = [], minimumDistinct = [];
  let nearLayoutPairs = 0, nearAnswerPairs = 0, nearRepeatPairs = 0;
  for (let index = 1; index < signatures.length; index += 1) {
    const current = signatures[index];
    let nearestDistance = Infinity, mostOverlap = 0, leastDistinct = Infinity;
    for (const previous of signatures.slice(0, index)) {
      const changed = distance(current.layout, previous.layout);
      const smaller = Math.min(current.answers.size, previous.answers.size);
      const shared = [...current.answers].filter((word) => previous.answers.has(word)).length;
      nearestDistance = Math.min(nearestDistance, changed);
      mostOverlap = Math.max(mostOverlap, shared / smaller);
      leastDistinct = Math.min(leastDistinct, smaller - shared);
      nearLayoutPairs += Number(changed < 12);
      nearAnswerPairs += Number(smaller - shared < 3);
      nearRepeatPairs += Number(changed < 12 || smaller - shared < 3);
    }
    nearest.push(nearestDistance);
    maximumOverlap.push(mostOverlap);
    minimumDistinct.push(leastDistinct);
  }
  const latency = outcomes.map(({ milliseconds }) => milliseconds);
  return {
    completed: successes.length,
    failed: outcomes.length - successes.length,
    wallMilliseconds,
    medianMilliseconds: percentile(latency, 0.50),
    p95Milliseconds: percentile(latency, 0.95),
    nearest,
    maximumOverlap,
    minimumDistinct,
    nearLayoutPairs, nearAnswerPairs, nearRepeatPairs,
    fullAlphabet: successes.filter(({ signature }) => signature.codes === 26 && signature.letters === 26).length,
    fallbackEntries: build === "baseline" ? null : outcomes.filter(({ diagnostics }) => diagnostics?.fallbackEntered).length,
    templateAccepted: build === "baseline" ? successes.length : successes.filter(({ diagnostics }) => diagnostics?.source === "template").length,
  };
}

async function run(browser, origin, build, workload) {
  const page = await browser.newPage();
  try {
    await page.addInitScript(instrumentWorker, workload.name);
    await page.goto(origin);
    let start;
    if (workload.mode === "play") {
      await page.getByLabel("Onderwerp").selectOption(workload.theme);
      await page.locator('input[name="difficulty"][value="2"]').check();
      start = performance.now();
      for (let index = 0; index < workload.count; index += 1) {
        await page.getByRole("button", { name: "Nieuwe puzzel" }).click();
        await page.waitForFunction((count) => window.outcomes.length === count, index + 1, { timeout: 120_000 });
      }
    } else {
      await page.getByRole("button", { name: "Boekje maken", exact: true }).click();
      for (const level of [1, 2, 3, 4]) {
        await page.getByRole("spinbutton", { name: `Geen thema, niveau ${level}` }).fill("0");
      }
      const theme = themes[workload.theme];
      await page.getByRole("spinbutton", { name: `${theme}, niveau 2` }).fill(String(workload.count));
      if (workload.theme !== "animals_familiar") {
        await page.locator(".theme-count-row").filter({ has: page.getByRole("heading", { name: theme }) })
          .getByLabel("Alle 26 letters gebruiken").check();
      }
      start = performance.now();
      await page.getByRole("button", { name: "Boekje genereren" }).click();
      await page.getByRole("button", { name: "Boekje genereren" }).waitFor({ timeout: 900_000 });
    }
    const wall = performance.now() - start;
    const outcomes = await page.evaluate(() => window.outcomes);
    const status = await page.getByRole("status").textContent({ timeout: 100 }).catch(() => "");
    const summary = summarize(outcomes, wall, build);
    if (workload.mode === "booklet" && summary.completed === workload.count) {
      assert.match(status, new RegExp(`^${workload.count} puzzels klaar`));
    }
    return { build, ...workload, status, summary, outcomes };
  } finally {
    await page.close();
  }
}

async function main() {
  const lexiconHash = (dir) => createHash("sha256").update(readFileSync(join(dir, "lexicon.json"))).digest("hex");
  assert.equal(lexiconHash(baseline), lexiconHash(candidate));
  const servers = { baseline: serveBuild(baseline), candidate: serveBuild(candidate) };
  try {
    for (const server of Object.values(servers)) {
      await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
    }
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE });
    try {
      const report = { chromium: browser.version(), lexiconSHA256: lexiconHash(baseline), rows: [] };
      for (const build of ["baseline", "candidate"]) {
        for (const workload of workloads) {
          const row = await run(browser, `http://127.0.0.1:${servers[build].address().port}`, build, workload);
          report.rows.push(row);
          writeFileSync(output, JSON.stringify(report, null, 2));
          const { nearest, maximumOverlap, minimumDistinct, ...summary } = row.summary;
          console.log(JSON.stringify({ build, workload: workload.name, ...summary, nearestMinimum: Math.min(...nearest) }));
        }
      }
      const failures = [];
      for (const { name, count, theme, summary } of report.rows.filter(({ build }) => build === "candidate")) {
        if (summary.completed !== count || summary.failed) failures.push(`${name} completion`);
        if (summary.nearRepeatPairs) failures.push(`${name} repeats`);
        if (summary.templateAccepted > summary.completed / 2) failures.push(`${name} template ceiling`);
        if (theme !== "animals_familiar" && summary.fullAlphabet !== summary.completed) failures.push(`${name} full alphabet`);
      }
      assert.deepEqual(failures, []);
    } finally {
      await browser.close();
    }
  } finally {
    for (const server of Object.values(servers)) server.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
