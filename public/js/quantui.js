// The gold "Bonus: quant checks" box under a strategy tester result.
import { esc, fmtPct } from "./api.js";
import { quantChecks } from "../lib/quant.js";
import { tr, trQuantGate, locale } from "./i18n.js";

export function mountQuantChecks(el, result) {
  el.innerHTML = `<div class="gold-box">
    <div class="gold-head"><span class="gold-badge">${esc(tr("qc.badge", "Bonus"))}</span><b>${esc(tr("qc.title", "Quant checks"))}</b></div>
    <p class="hint-text">${esc(tr("qc.desc", "The checks quant desks run before they trust a backtest: walk-forward, overfitting (PBO), deflated Sharpe, cost stress, nearby settings, and a Monte Carlo of these trades. It re-runs this strategy about 25 times with nearby settings, here on your computer."))}</p>
    <div class="row-flex"><button class="btn gold" data-run>${esc(tr("qc.run", "Run quant checks"))}</button></div>
    <div data-out></div>
  </div>`;
  el.querySelector("[data-run]").onclick = (e) => {
    const btn = e.currentTarget,
      out = el.querySelector("[data-out]");
    btn.disabled = true;
    btn.textContent = tr("qc.checking", "Checking…");
    setTimeout(() => {
      try {
        out.innerHTML = render(quantChecks(result.bars, result.strat, { subBars: result.subBars }));
      } catch (err) {
        out.innerHTML = `<p class="down">${esc(err.message)}</p>`;
      }
      btn.disabled = false;
      btn.textContent = tr("qc.runAgain", "Run again");
    }, 30);
  };
}

function render(q) {
  const total = q.gates.length;
  const cls =
    q.passed === total ? "up" : q.passed >= total / 2 ? "warn" : "down";
  const verdict =
    q.passed === total
      ? tr("qc.vAll", "It holds up on every check here. Paper trade it next before any real money.")
      : q.passed === 0
        ? tr("qc.vZero", "It failed every check. The backtest result is most likely luck or tuned to the past.")
        : tr("qc.vSome", "Some checks failed. Part of this result may be luck or tuned to the past.");
  let html = `<div class="ptq-verdict ${cls}">${esc(tr("qc.passed", "Passed {p} of {t} checks", { p: q.passed, t: total }))}</div><p>${esc(verdict)}</p>`;
  html += `<table class="t"><tbody>${q.gates.map((raw) => { const g = trQuantGate(raw); return `<tr><td class="l"><b>${esc(g.label)}</b></td><td class="l muted">${esc(g.value)}</td><td class="${g.pass ? "up" : "down"}">${esc(g.pass ? tr("qc.pass", "Pass") : tr("qc.fail", "Fail"))}</td></tr>`; }).join("")}</tbody></table>`;

  if (q.walkForward) {
    const wf = q.walkForward;
    const day = (t) =>
      t
        ? new Date(t * 1000).toLocaleDateString(locale(), {
            month: "short",
            year: "numeric",
          })
        : "";
    html += `<h4>${esc(tr("qc.wf", "Walk-forward"))}</h4><p class="hint-text">${esc(tr("qc.wfDesc", "For each stretch, the settings that had done best up to then, then how they did on the stretch itself. {pos} of {tot} stretches made money.", { pos: wf.positiveFolds, tot: wf.folds.length }))}</p>
      <table class="t"><thead><tr><th class="l">${esc(tr("qc.stretch", "Stretch"))}</th><th>${esc(tr("qc.picked", "Settings picked"))}</th><th>${esc(tr("qc.ret", "Return"))}</th><th>${esc(tr("ts.sharpe", "Sharpe"))}</th></tr></thead><tbody>${wf.folds.map((f) => `<tr><td class="l">${day(f.from)} — ${day(f.to)}</td><td>${f.chosen.join(" / ") || esc(tr("qc.asSet", "as set"))}</td><td class="${f.testReturnPct >= 0 ? "up" : "down"}">${fmtPct(f.testReturnPct)}</td><td>${f.testSharpe.toFixed(2)}</td></tr>`).join("")}</tbody></table>`;
  }

  if (q.tunables.length === 2) {
    const [a, b] = q.tunables;
    const cell = (v) =>
      q.variants.find((x) => x.values[0] === v[0] && x.values[1] === v[1]);
    html += `<h4>${esc(tr("qc.nearby", "Nearby settings"))}</h4><p class="hint-text">${esc(tr("qc.nearbyDesc", "Net return for each pair of settings. A real edge is a broad patch of green, not one lucky square. Outlined: yours."))}</p>
      <table class="t heat"><thead><tr><th class="l">${esc(a.label)} \\ ${esc(b.label)}</th>${b.values.map((v) => `<th>${v}</th>`).join("")}</tr></thead><tbody>${a.values
        .map(
          (va) =>
            `<tr><td class="l"><b>${va}</b></td>${b.values
              .map((vb) => {
                const v = cell([va, vb]);
                const n = v?.netPct ?? 0,
                  k = Math.min(1, Math.abs(n) / 100);
                const bg =
                  n >= 0
                    ? `rgba(8,153,129,${0.12 + 0.55 * k})`
                    : `rgba(242,54,69,${0.12 + 0.55 * k})`;
                return `<td style="background:${bg}" class="${v?.isBase ? "base" : ""}">${fmtPct(n)}</td>`;
              })
              .join("")}</tr>`,
        )
        .join("")}</tbody></table>`;
  } else if (q.tunables.length === 1) {
    const [a] = q.tunables;
    html += `<h4>${esc(tr("qc.nearby", "Nearby settings"))}</h4><table class="t"><thead><tr><th class="l">${esc(a.label)}</th>${q.variants.map((v) => `<th>${v.values[0]}${v.isBase ? ` ${esc(tr("qc.yours", "(yours)"))}` : ""}</th>`).join("")}</tr></thead><tbody><tr><td class="l">${esc(tr("qc.netRet", "Net return"))}</td>${q.variants.map((v) => `<td class="${v.netPct >= 0 ? "up" : "down"}">${fmtPct(v.netPct)}</td>`).join("")}</tr></tbody></table>`;
  }

  const mc = q.monteCarlo;
  if (mc) {
    html += `<h4>${esc(tr("qc.mc", "Monte Carlo"))}</h4><p>${esc(tr("qc.mcText", "Reshuffling these {trades} trades {runs} times: the worst 5% of runs ended at {p5}, the middle at {p50}, the best 5% at {p95}. The usual worst drop was {dd50}%, and 1 run in 20 fell {dd95}% or more. {loss}% of runs ended down.", {
      trades: q.base.trades,
      runs: mc.runs.toLocaleString(locale()),
      p5: fmtPct(mc.p5),
      p50: fmtPct(mc.p50),
      p95: fmtPct(mc.p95),
      dd50: mc.ddP50.toFixed(1),
      dd95: mc.ddP95.toFixed(1),
      loss: mc.lossProb.toFixed(0),
    }))}</p>`;
  }
  if (!q.tunables.length)
    html += `<p class="hint-text">${esc(tr("qc.noTunables", "Walk-forward, overfitting and nearby settings need a whole-number setting to vary, like an indicator's length, so they don't run on fixed rules or an imported signal."))}</p>`;
  html += `<p class="hint-text">${esc(tr("qc.foot", "Probabilistic Sharpe {psr}; the best Sharpe {trials} random versions would be expected to show is {sr0}. These checks use past prices only: passing them doesn't mean a strategy will make money.", {
    psr: q.psr == null ? "n/a" : q.psr.toFixed(3),
    trials: q.trials,
    sr0: q.sr0.toFixed(2),
  }))}</p>`;
  return html;
}
