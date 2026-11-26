// PTQ connector UI: "Check with PTQ" under the strategy tester, and the PTQ tab.
// The terminal only reads from PTQ and can only make it do less (stop, disarm).
// Arming a strategy to trade happens in PTQ itself, on the command line.
import { api, esc, fmtPrice, fmtNum, ticker } from "./api.js";
import { tr, locale } from "./i18n.js";

const $ = (s, el = document) => el.querySelector(s);
let cached = null,
  cachedAt = 0;

export async function ptqStatus(force = false) {
  if (!force && cached && Date.now() - cachedAt < 15000) return cached;
  try {
    cached = await api.get("/api/ptq/status");
  } catch (e) {
    cached = { connected: false, reason: e.message };
  }
  cachedAt = Date.now();
  return cached;
}

const VERDICT = () => ({
  approve: ["up", tr("ptq.vApprove", "Passed PTQ's checks")],
  reduce: ["warn", tr("ptq.vReduce", "Passed with warnings")],
  block: ["down", tr("ptq.vBlock", "Didn't pass PTQ's checks")],
});

const MARK = `<span class="ptq-logo"><span class="ptq-logo-mark"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 12 L7 6 L10 9 L13 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>PTQ</span>`;

function ptqHead(status = "") {
  return `<div class="ptq-top">${MARK}<span class="ptq-eyebrow">${esc(tr("ptq.brand", "Part-Time Quant"))}</span>${status ? `<span class="ptq-status">${status}</span>` : ""}</div>`;
}

function notConnected(st, tried = false) {
  const url = st.url || "http://127.0.0.1:8787";
  return `<div class="ptq-box ptq-brand">
    ${ptqHead(esc(tr("ptq.notConn", "Not connected")))}
    <p class="ptq-lead">${esc(tried ? tr("ptq.notFound", "PTQ wasn't found at {url}. Start PTQ on this computer and try again.", { url }) : tr("ptq.notRunning", "PTQ isn't running on {url}. Start PTQ locally to check and manage strategies here.", { url }))}</p>
    <div class="ptq-actions">
      <div class="ptq-action"><button class="btn ptq-outline" data-ptq-retry>${esc(tr("ptq.retry", "Retry connection"))}</button></div>
    </div>
  </div>`;
}

// Mounts the "Check with PTQ" box. ctx = { strategy, symbol, tf, name }
export async function mountPtqCheck(el, ctx) {
  const st = await ptqStatus();
  if (!st.connected) {
    el.innerHTML = "";
    return;
  }
  const lic = st.licensed ? "" : tr("ptq.noLic", " · no licence found on this computer");
  el.innerHTML = `<div class="ptq-box ptq-brand">
    ${ptqHead(`<i></i>${esc(tr("ptq.connected", "PTQ {ver} connected{lic}", { ver: st.version || "", lic }))}`)}
    <p class="ptq-lead">${esc(tr("ptq.lead", "Send these rules to your PTQ: it re-tests them on {sym} {tf} with its own engine, and a strategy that passes can trade through your own account once you arm it.", { sym: ticker(ctx.symbol), tf: ctx.tf }))}</p>
    <div class="ptq-actions"><button class="btn ptq" data-ptq-check>${esc(tr("ptq.checkBtn", "Check with PTQ"))}</button></div>
    <div data-ptq-out></div>
  </div>`;
  el.querySelector("[data-ptq-check]").onclick = async (e) => {
    const btn = e.currentTarget,
      out = el.querySelector("[data-ptq-out]");
    btn.disabled = true;
    btn.textContent = tr("ptq.testing", "PTQ is testing…");
    out.innerHTML =
      `<p class="hint-text">${esc(tr("ptq.testingHint", "This can take up to a minute the first time PTQ loads the price history."))}</p>`;
    try {
      const r = await api.post("/api/ptq/check", ctx);
      out.innerHTML = resultHtml(r);
      out.querySelector("[data-copy]")?.addEventListener("click", (ev) => {
        navigator.clipboard
          ?.writeText(ev.currentTarget.dataset.copy)
          .then(() => {
            ev.currentTarget.textContent = tr("ptq.copied", "Copied");
          });
      });
    } catch (err) {
      out.innerHTML = `<p class="down">${esc(err.message)}</p>`;
    }
    btn.disabled = false;
    btn.textContent = tr("ptq.checkAgain", "Check again");
  };
}

function resultHtml(r) {
  const v = r.validation;
  const [cls, label] = VERDICT()[v?.verdict] || ["", tr("ptq.noVerdict", "No verdict")];
  const m = r.metrics || {};
  const metric = (k, val) =>
    `<div class="stat"><div class="k">${esc(k)}</div><div class="v">${val ?? "—"}</div></div>`;
  const pct = (x) => (x == null ? "—" : `${x >= 0 ? "+" : ""}${x}%`);
  let html = "";
  if (r.provenance !== "real-engine")
    html +=
      `<p class="down">${esc(tr("ptq.simPreview", "PTQ's engine wasn't running, so PTQ returned a simulated preview. This is not a real test: start the engine in PTQ and check again."))}</p>`;
  html += `<div class="ptq-verdict ${cls}">${esc(label)}</div>`;
  if (v?.gates?.length) {
    html += `<table class="t"><tbody>${v.gates.map((g) => `<tr><td class="l">${esc(g.label)}</td><td class="l muted">${esc(g.value)}</td><td class="${g.pass ? "up" : "down"}">${esc(g.pass ? tr("qc.pass", "Pass") : tr("qc.fail", "Fail"))}</td></tr>`).join("")}</tbody></table>`;
  } else if (r.validationError) {
    html += `<p class="down">${esc(r.validationError)}</p>`;
  }
  html += `<div class="stats" style="margin-top:8px">${metric(tr("ptq.netRet", "PTQ net return"), pct(m.netReturnPct))}${metric(tr("ptq.sharpe", "PTQ Sharpe"), m.sharpe)}${metric(tr("ptq.maxDd", "PTQ max drawdown"), m.maxDrawdownPct == null ? "—" : `-${m.maxDrawdownPct}%`)}${metric(tr("ptq.trades", "PTQ trades"), m.trades)}</div>`;
  html += `<p class="hint-text">${esc(tr("ptq.diffNote", "PTQ tested {inst} on {tf} with its own costs and fills, so its numbers won't match this tester's exactly.", { inst: r.instrument, tf: r.timeframe }))}</p>`;
  for (const n of r.notes || []) html += `<p class="hint-text">${esc(n)}</p>`;
  html += `<p>${tr("ptq.savedAs", "Saved in your PTQ as <b>{name}</b>.", { name: esc(r.strategyName) })} <a class="link" href="${esc(r.links.strategy)}" target="_blank" rel="noopener">${esc(tr("ptq.openInPtq", "Open it in PTQ"))}</a></p>`;
  if (v?.verdict === "block") {
    html +=
      `<p class="hint-text">${esc(tr("ptq.blockedHint", "PTQ wouldn't trade this as it stands. Change the rules and check again."))}</p>`;
  } else if (v) {
    const cmd = `ptq arm-strategy ${r.strategyId} --max-notional 100`;
    html += `<div class="ptq-arm"><b>${esc(tr("ptq.armTitle", "Let PTQ trade it on your exchange"))}</b>
      <ol>
        <li>${esc(tr("ptq.arm1", "Connect your exchange in PTQ:"))} <a class="link" href="${esc(r.links.integrations)}" target="_blank" rel="noopener">${esc(tr("ptq.arm1b", "Integrations"))}</a>${esc(tr("ptq.arm1c", ". Your keys stay in PTQ."))}</li>
        <li>${esc(tr("ptq.arm2a", "In a terminal, run"))} <code>${esc(cmd)}</code> <button class="btn small" data-copy="${esc(cmd)}">${esc(tr("ptq.copy", "Copy"))}</button><br><span class="hint-text">${tr("ptq.arm2b", "PTQ shows what you're agreeing to and asks you to add <code>--yes</code>. It asks you to confirm each trade unless you also add <code>--unattended</code>. <code>--max-notional</code> caps each order's size.")}</span></li>
        <li>${esc(tr("ptq.arm3a", "Watch it in the PTQ tab below, or on PTQ's"))} <a class="link" href="${esc(r.links.autopilot)}" target="_blank" rel="noopener">${esc(tr("ptq.arm3b", "Autopilot"))}</a></li>
      </ol>
      <p class="hint-text">${esc(tr("ptq.armNote", "Live trading in PTQ is new: start small. Past results don't predict future ones."))}</p></div>`;
  }
  return html;
}

// ---------- PTQ tab ----------
let tabTimer = null;
export async function renderPtqTab(el, app, tried = false) {
  clearTimeout(tabTimer);
  const st = await ptqStatus(true);
  if (!st.connected) {
    el.innerHTML = `<div class="pad ptq-tab">${notConnected(st, tried)}</div>`;
    el.querySelector("[data-ptq-retry]").onclick = () => renderPtqTab(el, app, true);
    return;
  }
  let o;
  try {
    o = await api.get("/api/ptq/overview");
  } catch (e) {
    el.innerHTML = `<div class="pad down">${esc(e.message)}</div>`;
    return;
  }
  const ks = o.killSwitch || {},
    pf = o.portfolio || {},
    auto = o.autopilot || {};
  const arms = Array.isArray(o.arms) ? o.arms : [];
  const journal = Array.isArray(o.journal) ? o.journal : [];
  const errLine = (x) =>
    x?.error ? `<p class="down">${esc(x.error)}</p>` : "";
  const when = (t) => (t ? new Date(t).toLocaleString(locale()) : "—");
  const lic = st.licensed ? "" : tr("ptq.noLic", " · no licence on this computer");
  el.innerHTML = `<div class="tester ptq-brand ptq-tab"><div class="left">
      <div class="row-flex">${MARK}<span class="ptq-status"><i></i>${esc(tr("ptq.connected", "{ver} connected", { ver: st.version || "", lic: "" }))} · ${esc(st.url)}${esc(lic)}</span><span class="spacer"></span><button class="btn small ptq-ghost" data-refresh>${esc(tr("ptq.refresh", "Refresh"))}</button><a class="btn small ptq" href="${esc(o.links.app)}" target="_blank" rel="noopener">${esc(tr("ptq.openApp", "Open PTQ"))}</a></div>
      <h4>${esc(tr("ptq.trading", "Trading"))}</h4>
      ${
        ks.engaged
          ? `<p class="down">${tr("ptq.ksEngaged", "<b>Stopped.</b> PTQ's stop is on, so it places no new orders. Release it in PTQ when you're ready.")}</p>`
          : `<p>${esc(auto.running ? tr("ptq.autoRunning", "PTQ's autopilot is running") : tr("ptq.autoPaused", "PTQ's autopilot is paused"))}${auto.unattendedLiveEnabled === false ? esc(tr("ptq.unattendedOff", " (unattended live is switched off)")) : ""}.</p><button class="btn danger" data-kill>${esc(tr("ptq.killBtn", "Stop all PTQ trading"))}</button><p class="hint-text">${esc(tr("ptq.killHint", "Stops new orders straight away. Open positions stay as they are; close them in PTQ or on your exchange."))}</p>`
      }
      ${errLine(ks)}
      <h4>${esc(tr("ptq.account", "Account"))}</h4>
      ${
        pf.connected
          ? `<div class="stats">${[
              [tr("ptq.equity", "Equity"), fmtPrice(pf.equity)],
              [tr("ptq.cash", "Cash"), fmtPrice(pf.cash)],
              [tr("ptq.today", "Today"), pf.dayPnlUsd == null ? "—" : fmtPrice(pf.dayPnlUsd)],
              [
                tr("ptq.exposure", "Exposure"),
                pf.grossExposurePct == null ? "—" : `${pf.grossExposurePct}%`,
              ],
            ]
              .map(
                ([k, v]) =>
                  `<div class="stat"><div class="k">${esc(k)}</div><div class="v">${v}</div></div>`,
              )
              .join(
                "",
              )}</div><p class="hint-text">${esc(tr("ptq.fromBroker", "From {src}.", { src: pf.source || "your broker" }))}</p>`
          : `<p class="hint-text">${esc(pf.message || tr("ptq.noExch", "No exchange connected in PTQ yet."))} <a class="link" href="${esc(o.links.integrations)}" target="_blank" rel="noopener">${esc(tr("ptq.connectExch", "Connect one in PTQ"))}</a></p>`
      }
      ${errLine(pf)}
    </div><div class="right">
      <h4 style="margin-top:0">${esc(tr("ptq.positions", "Positions"))}</h4>
      <table class="t"><thead><tr><th>${esc(tr("ptq.mkt", "Market"))}</th><th>${esc(tr("ptq.qty", "Qty"))}</th><th>${esc(tr("ptq.entry", "Entry"))}</th><th>${esc(tr("ptq.val", "Value"))}</th><th>${esc(tr("ptq.pnl", "P&L"))}</th></tr></thead><tbody>${(pf.positions || []).map((p) => `<tr><td><b>${esc(p.instrument || p.symbol || "")}</b></td><td>${fmtNum(p.qty, 4)}</td><td>${fmtPrice(p.avgPrice ?? p.entry ?? p.avgEntryPrice)}</td><td>${fmtPrice(p.marketValue ?? p.value)}</td><td class="${(p.unrealizedPnl ?? p.pnl ?? 0) >= 0 ? "up" : "down"}">${fmtPrice(p.unrealizedPnl ?? p.pnl)}</td></tr>`).join("") || `<tr><td colspan="5" class="l muted">${esc(tr("ptq.noPos", "No open positions."))}</td></tr>`}</tbody></table>
      <h4>${esc(tr("ptq.armed", "Armed strategies"))}</h4>
      <table class="t"><thead><tr><th>${esc(tr("ptq.strat", "Strategy"))}</th><th>${esc(tr("ptq.mkts", "Markets"))}</th><th>${esc(tr("ptq.maxOrd", "Max per order"))}</th><th>${esc(tr("ptq.confTrades", "Confirm trades"))}</th><th>${esc(tr("ptq.exp", "Expires"))}</th><th></th></tr></thead><tbody>${arms.map((a) => `<tr><td><b>${esc(a.strategyName || a.strategyId)}</b>${a.halted ? ` <span class="down">${esc(tr("ptq.halted", "halted"))}${a.haltedReason ? `: ${esc(a.haltedReason)}` : ""}</span>` : ""}</td><td>${esc((a.scope?.symbols || []).join(", "))}</td><td>${fmtNum(a.scope?.maxNotional, 2)}</td><td>${esc(a.requirePerTradeConfirm ? tr("app.yes", "Yes") : tr("ptq.unattended", "No (unattended)"))}</td><td>${when(a.scope?.expiresAt)}</td><td>${a.armed ? `<button class="btn small danger" data-disarm="${esc(a.strategyId)}">${esc(tr("ptq.disarm", "Disarm"))}</button>` : `<span class="muted">${esc(tr("ptq.disarmed", "disarmed"))}</span>`}</td></tr>`).join("") || `<tr><td colspan="6" class="l muted">${esc(tr("ptq.noArms", 'Nothing armed. Run "Check with PTQ" in the Strategy tester tab to send a strategy over.'))}</td></tr>`}</tbody></table>
      ${errLine(o.arms)}
      <h4>${esc(tr("ptq.recentOrders", "Recent PTQ orders"))}</h4>
      <table class="t"><thead><tr><th>${esc(tr("ptq.time", "Time"))}</th><th>${esc(tr("ptq.mkt", "Market"))}</th><th>${esc(tr("ptq.side", "Side"))}</th><th>${esc(tr("ptq.qty", "Qty"))}</th><th>${esc(tr("ptq.price", "Price"))}</th><th>${esc(tr("ptq.status", "Status"))}</th></tr></thead><tbody>${
        journal
          .slice(0, 25)
          .map(
            (j) =>
              `<tr><td>${when(j.ts)}</td><td>${esc(j.instrument || "")}</td><td>${esc(j.direction || "")}</td><td>${fmtNum(j.filledQty ?? j.qty, 4)}</td><td>${fmtPrice(j.fillPrice ?? j.limitPrice)}</td><td class="${j.status === "rejected" ? "down" : ""}">${esc(j.status || "")}${j.simulated ? esc(tr("ptq.sim", " (simulated)")) : j.live ? esc(tr("ptq.live", " (live)")) : ""}</td></tr>`,
          )
          .join("") ||
        `<tr><td colspan="6" class="l muted">${esc(tr("ptq.noOrders", "No orders yet."))}</td></tr>`
      }</tbody></table>
    </div></div>`;
  el.querySelector("[data-refresh]").onclick = () => renderPtqTab(el, app);
  el.querySelector("[data-kill]")?.addEventListener("click", async () => {
    if (
      !confirm(
        tr("ptq.killConfirm", "Stop all PTQ trading now? PTQ places no new orders until you release the stop in PTQ."),
      )
    )
      return;
    try {
      await api.post("/api/ptq/kill-switch", {});
      app.toast(tr("ptq.killToast", "PTQ stopped. No new orders."));
    } catch (e) {
      app.toast(e.message, "err");
    }
    renderPtqTab(el, app);
  });
  el.querySelectorAll("[data-disarm]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm(tr("ptq.disarmConfirm", "Disarm this strategy? PTQ stops trading it."))) return;
      try {
        await api.post(
          `/api/ptq/arms/${encodeURIComponent(b.dataset.disarm)}/disarm`,
          {},
        );
        app.toast(tr("ptq.disarmToast", "Disarmed."));
      } catch (e) {
        app.toast(e.message, "err");
      }
      renderPtqTab(el, app);
    }),
  );
  tabTimer = setTimeout(() => {
    if (el.isConnected && el.querySelector("[data-refresh]"))
      renderPtqTab(el, app);
  }, 15000);
}
