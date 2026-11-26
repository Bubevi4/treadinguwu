// Side panel (watchlist, alerts, calendar) and bottom panel (tester, screener, heatmap, paper, editor).
import {
  api,
  download,
  esc,
  fmtPrice,
  fmtPct,
  fmtNum,
  ticker,
  exchange,
} from "./api.js";
import { INDICATORS, BY_ID, registerIndicator } from "../lib/indicators.js";
import { mountPtqCheck, renderPtqTab } from "./ptq.js";
import { renderNews, renderSeasonals, renderFinancials } from "./research.js";
import { mountQuantChecks } from "./quantui.js";
import { makeResizable, LIMITS } from "./resize.js";
import { moveSymbol, shownLists } from "./watchlist.js";
import {
  backtest,
  tradesCsv,
  EXAMPLE_STRATEGIES,
  OPS,
  magnifierTf,
} from "../lib/backtest.js";
import { parseTf } from "../lib/series.js";
import { tr, trStrategy, trExitReason, trFills, trFees, locale } from "./i18n.js";

const $ = (s, el = document) => el.querySelector(s);
const LW = window.LightweightCharts;
const css = (n) =>
  getComputedStyle(document.documentElement).getPropertyValue(n).trim();


// ---------- operand picker (shared by tester, alerts, screener scans) ----------
const PRICE = [
  "close",
  "open",
  "high",
  "low",
  "volume",
  "hl2",
  "hlc3",
  "ohlc4",
];
const OP_LABEL = {
  ">": () => tr("op.>", "is above"),
  "<": () => tr("op.<", "is below"),
  ">=": () => tr("op.>=", "is at or above"),
  "<=": () => tr("op.<=", "is at or below"),
  crossesAbove: () => tr("op.crossesAbove", "crosses above"),
  crossesBelow: () => tr("op.crossesBelow", "crosses below"),
  crosses: () => tr("op.crosses", "crosses"),
};
const opLabel = (o) => OP_LABEL[o]?.() || o;
const outputsOf = (def) => [
  ...def.outputs.map((o) => o.key),
  ...(def.id === "supertrend" ? ["direction"] : []),
];
const mainInput = (def) =>
  (def.inputs || []).find((i) => i.type === "int" || i.type === "float");

function operandHtml(o) {
  const val =
    o.kind === "line"
      ? "l"
      : o.kind === "value"
        ? "v"
        : o.kind === "price"
          ? `p:${o.field}`
          : `i:${o.id}`;
  const opts = [
    o.kind === "line" ? `<option value="l" selected>${esc(o.label || tr("rule.drawnLine", "Drawn line"))}</option>` : "",
    `<optgroup label="${esc(tr("app.priceGroup", "Price"))}">${PRICE.map((f) => `<option value="p:${f}" ${val === `p:${f}` ? "selected" : ""}>${esc(f === "close" ? tr("rule.priceClose", "Price (close)") : f)}</option>`).join("")}</optgroup>`,
    `<option value="v" ${val === "v" ? "selected" : ""}>${esc(tr("rule.value", "Value"))}</option>`,
    `<optgroup label="${esc(tr("rule.indicators", "Indicators"))}">${INDICATORS.filter((d) => d.outputs.length)
      .map(
        (d) =>
          `<option value="i:${esc(d.id)}" ${val === `i:${d.id}` ? "selected" : ""}>${esc(d.name)}</option>`,
      )
      .join("")}</optgroup>`,
  ].join("");
  let extra = "";
  if (o.kind === "value")
    extra = `<input class="num" data-v type="number" step="any" value="${o.v ?? 0}">`;
  if (o.kind === "ind") {
    const def = BY_ID[o.id];
    const mi = def && mainInput(def);
    if (mi)
      extra += `<input class="num" data-p="${mi.key}" type="number" step="any" title="${esc(mi.label)}" value="${o.params?.[mi.key] ?? mi.default}">`;
    const outs = def ? outputsOf(def) : [];
    if (outs.length > 1)
      extra += `<select data-out>${outs.map((k) => `<option ${k === o.output ? "selected" : ""}>${k}</option>`).join("")}</select>`;
  }
  const lineData = o.kind === "line" ? ` data-line="${esc(JSON.stringify(o.line))}" data-label="${esc(o.label || tr("rule.drawnLine", "Drawn line"))}"` : "";
  return `<span class="operand"${lineData}><select data-kind>${opts}</select>${extra}</span>`;
}

function readOperand(span) {
  const k = span.querySelector("[data-kind]").value;
  if (k === "l") return { kind: "line", line: JSON.parse(span.dataset.line), label: span.dataset.label };
  if (k === "v")
    return {
      kind: "value",
      v: Number(span.querySelector("[data-v]")?.value || 0),
    };
  if (k.startsWith("p:")) return { kind: "price", field: k.slice(2) };
  const id = k.slice(2),
    def = BY_ID[id];
  const params = {};
  const p = span.querySelector("[data-p]");
  if (p) params[p.dataset.p] = Number(p.value);
  return {
    kind: "ind",
    id,
    params,
    output: span.querySelector("[data-out]")?.value || outputsOf(def)[0],
  };
}

function ruleHtml(r) {
  return `<div class="rule">${operandHtml(r.left)}<select data-op>${OPS.map((o) => `<option value="${o}" ${o === r.op ? "selected" : ""}>${esc(opLabel(o))}</option>`).join("")}</select>${operandHtml(r.right)}<button class="x" title="${esc(tr("chart.remove", "Remove"))}">&times;</button></div>`;
}

function bindRules(container, onChange = () => {}) {
  container.addEventListener("change", (e) => {
    const span = e.target.closest(".operand");
    if (span && e.target.matches("[data-kind]")) {
      const k = e.target.value;
      const o =
        k === "v"
          ? { kind: "value", v: 0 }
          : k.startsWith("p:")
            ? { kind: "price", field: k.slice(2) }
            : {
                kind: "ind",
                id: k.slice(2),
                params: {},
                output: outputsOf(BY_ID[k.slice(2)])[0],
              };
      span.outerHTML = operandHtml(o);
    }
    onChange();
  });
  container.addEventListener("click", (e) => {
    if (e.target.matches(".rule .x")) {
      e.target.closest(".rule").remove();
      onChange();
    }
  });
}

const readRules = (container) =>
  [...container.querySelectorAll(".rule")].map((r) => {
    const ops = r.querySelectorAll(".operand");
    return {
      left: readOperand(ops[0]),
      op: r.querySelector("[data-op]").value,
      right: readOperand(ops[1]),
    };
  });

function compileRules(groups) {
  const indicators = {};
  const ref = (o) => {
    if (o.kind === "line") return { line: o.line };
    if (o.kind === "value") return Number(o.v);
    if (o.kind === "price") return o.field;
    const key = `${o.id}_${Object.values(o.params || {}).join("_")}`.replace(
      /[^a-z0-9_]/gi,
      "_",
    );
    indicators[key] = { id: o.id, params: o.params || {} };
    return `${key}.${o.output}`;
  };
  const out = { indicators };
  for (const [name, rules] of Object.entries(groups))
    out[name] = rules.map((r) => ({
      left: ref(r.left),
      op: r.op,
      right: ref(r.right),
    }));
  return out;
}

function toOperand(x, indicators) {
  if (x && typeof x === "object" && x.line) return { kind: "line", line: x.line, label: "Drawn line" };
  if (typeof x === "number") return { kind: "value", v: x };
  if (PRICE.includes(x)) return { kind: "price", field: x };
  const [k, out] = String(x).split(".");
  const s = indicators[k];
  const def = BY_ID[s?.id];
  if (!def) return { kind: "value", v: 0 };
  return {
    kind: "ind",
    id: s.id,
    params: { ...(s.params || {}) },
    output: out || s.output || outputsOf(def)[0],
  };
}

const defaultRule = () => ({
  left: { kind: "price", field: "close" },
  op: "crossesAbove",
  right: { kind: "ind", id: "ema", params: { length: 50 }, output: "value" },
});

// ==========================================================================================
export function initPanels(app) {
  const side = $("#sideBody"),
    bottom = $("#bottomBody"),
    bottomEl = $("#bottom");
  let sideTab = "watchlist",
    bottomTab = "tester";
  const P = {};
  const redraw = () => { if (bottomTab === "heatmap" && !bottomEl.classList.contains("collapsed")) drawHeatmap(); };
  makeResizable(bottomEl, bottomEl.parentElement, { axis: "y", key: "qt-bottom-height", limits: LIMITS.bottom, onResize: redraw });
  makeResizable($(".side"), $(".main"), { axis: "x", key: "qt-side-width", limits: LIMITS.side });

  // ---------- tabs ----------
  $("#sideTabs").onclick = (e) => {
    const t = e.target.dataset.tab;
    if (t) showSide(t);
  };
  $("#bottomTabs").onclick = (e) => {
    const t = e.target.closest("[data-tab]")?.dataset.tab;
    if (t) showBottom(t, true);
  };
  $("#bottomToggle").onclick = () => {
    bottomEl.classList.toggle("collapsed");
    if (!bottomEl.classList.contains("collapsed")) renderBottom();
  };

  function showSide(t) {
    sideTab = t;
    document
      .querySelectorAll("#sideTabs button")
      .forEach((b) => b.classList.toggle("active", b.dataset.tab === t));
    renderSide();
  }
  function showBottom(t, toggle = false) {
    if (
      toggle &&
      t === bottomTab &&
      !bottomEl.classList.contains("collapsed")
    ) {
      bottomEl.classList.add("collapsed");
      return;
    }
    bottomTab = t;
    bottomEl.classList.remove("collapsed");
    document
      .querySelectorAll("#bottomTabs [data-tab]")
      .forEach((b) => b.classList.toggle("active", b.dataset.tab === t));
    renderBottom();
  }
  const renderSide = () =>
    ({
      watchlist: renderWatchlist,
      alerts: renderAlerts,
      calendar: renderCalendar,
      news: () => renderNews(side, app),
    })[sideTab]();
  const renderBottom = () => {
    if (!bottomEl.classList.contains("collapsed"))
      ({
        tester: renderTester,
        screener: renderScreener,
        heatmap: renderHeatmap,
        seasonals: () => renderSeasonals(bottom, app),
        financials: () => renderFinancials(bottom, app),
        paper: renderPaper,
        editor: renderEditor,
        ptq: () => renderPtqTab(bottom, app),
      })[bottomTab]();
  };

  // ======================= WATCHLIST =======================
  let quotes = {};
  function wlSymbols() {
    return app.state.watchlists[app.state.activeWatchlist] || [];
  }
  const showAll = () => !!app.state.watchlistShowAll;
  function renderWatchlist() {
    const names = Object.keys(app.state.watchlists);
    side.innerHTML = `<div class="wl-head"><select class="in" id="wlSel"><option value="" ${showAll() ? "selected" : ""}>${esc(tr("wl.all", "All lists"))}</option>${names.map((n) => `<option ${!showAll() && n === app.state.activeWatchlist ? "selected" : ""}>${esc(n)}</option>`).join("")}</select><button class="btn small" id="wlNew" title="${esc(tr("wl.newTitle", "New list"))}">${esc(tr("wl.newBtn", "+ List"))}</button><button class="btn small" id="wlDel" title="${esc(tr("wl.delTitle", "Delete this list"))}">${esc(tr("wl.delBtn", "Delete"))}</button></div>
      <div style="padding:8px"><input class="in" id="wlAdd" placeholder="${esc(tr("wl.addPlaceholder", "Add symbol to {list} (Enter)", { list: app.state.activeWatchlist }))}" style="width:100%"></div><div id="wlRows"></div>`;
    $("#wlSel").onchange = (e) => {
      app.state.watchlistShowAll = !e.target.value;
      if (e.target.value) app.state.activeWatchlist = e.target.value;
      app.persist();
      renderWatchlist();
      refreshQuotes();
    };
    $("#wlNew").onclick = () => {
      const n = prompt(tr("wl.newPrompt", "Name for the new list:"));
      if (!n || app.state.watchlists[n]) return;
      app.state.watchlists[n] = [];
      app.state.activeWatchlist = n;
      app.persist();
      renderWatchlist();
    };
    $("#wlDel").onclick = () => {
      if (names.length < 2) return app.toast(tr("wl.keepOne", "Keep at least one list."));
      if (!confirm(tr("wl.delConfirm", 'Delete the list "{list}"?', { list: app.state.activeWatchlist }))) return;
      delete app.state.watchlists[app.state.activeWatchlist];
      app.state.activeWatchlist = Object.keys(app.state.watchlists)[0];
      app.persist();
      renderWatchlist();
    };
    $("#wlAdd").onkeydown = async (e) => {
      if (e.key !== "Enter" || !e.target.value.trim()) return;
      try {
        const r = await api.get(
          `/api/resolve?symbol=${encodeURIComponent(e.target.value.trim())}`,
        );
        const list = wlSymbols();
        if (!list.includes(r.id)) list.push(r.id);
        e.target.value = "";
        app.persist();
        drawRows();
        refreshQuotes();
      } catch (err) {
        app.toast(err.message, "err");
      }
    };
    const rows = $("#wlRows");
    rows.onclick = (e) => {
      const head = e.target.closest(".wl-list-head");
      if (head) {
        app.state.activeWatchlist = head.dataset.list;
        app.persist();
        return renderWatchlist();
      }
      const row = e.target.closest(".wl-row");
      if (!row) return;
      if (e.target.closest(".x")) {
        const l = row.dataset.list;
        app.state.watchlists[l] = app.state.watchlists[l].filter((s) => s !== row.dataset.sym);
        app.persist();
        return drawRows();
      }
      app.setSymbol(row.dataset.sym);
    };
    // Drag a row to reorder it, or onto another list (in "All lists") to move it there.
    let dragged = null;
    const clearMarks = () => rows.querySelectorAll(".drop-before,.drop-after,.drop-into").forEach((el) => el.classList.remove("drop-before", "drop-after", "drop-into"));
    const target = (e) => {
      const row = e.target.closest(".wl-row");
      if (row) {
        const r = row.getBoundingClientRect();
        const after = e.clientY > r.top + r.height / 2;
        const next = after ? row.nextElementSibling : row;
        return { el: row, cls: after ? "drop-after" : "drop-before", list: row.dataset.list, before: next?.classList.contains("wl-row") ? next.dataset.sym : undefined };
      }
      const sec = e.target.closest(".wl-list");
      return sec && { el: sec, cls: "drop-into", list: sec.dataset.list };
    };
    rows.ondragstart = (e) => {
      const row = e.target.closest(".wl-row");
      if (!row) return;
      dragged = { sym: row.dataset.sym, list: row.dataset.list };
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", row.dataset.sym);
      row.classList.add("dragging");
    };
    rows.ondragover = (e) => {
      const t = dragged && target(e);
      if (!t) return;
      e.preventDefault();
      clearMarks();
      t.el.classList.add(t.cls);
    };
    rows.ondragleave = (e) => { if (!rows.contains(e.relatedTarget)) clearMarks(); };
    rows.ondrop = (e) => {
      const t = dragged && target(e);
      clearMarks();
      if (!t) return;
      e.preventDefault();
      if (moveSymbol(app.state.watchlists, dragged.list, dragged.sym, t.list, t.before)) {
        app.persist();
        drawRows();
      }
    };
    rows.ondragend = () => { dragged = null; clearMarks(); rows.querySelector(".dragging")?.classList.remove("dragging"); };
    drawRows();
  }
  function drawRows() {
    const box = $("#wlRows");
    if (!box) return;
    const cur = app.active?.cfg.symbol;
    const row = (s, l) => {
      const q = quotes[s] || {};
      const live = app.prices[s] ?? q.price;
      return `<div class="wl-row ${s === cur ? "current" : ""}" draggable="true" data-sym="${esc(s)}" data-list="${esc(l)}" title="${esc(tr("wl.dragTitle", "Drag to reorder"))}"><span class="sym">${esc(ticker(s))} <span class="ex">${esc(exchange(s))}</span></span><span class="px">${fmtPrice(live)}</span><span class="chg ${q.changePct >= 0 ? "up" : "down"}">${fmtPct(q.changePct)}</span><button class="x" title="${esc(tr("chart.remove", "Remove"))}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>`;
    };
    const lists = app.state.watchlists;
    box.innerHTML = shownLists(lists, app.state.activeWatchlist, showAll())
      .map((l) => {
        const head = showAll() ? `<div class="wl-list-head ${l === app.state.activeWatchlist ? "active" : ""}" data-list="${esc(l)}" title="${esc(tr("wl.headTitle", "Add new symbols to this list"))}">${esc(l)} <span class="muted">${lists[l].length}</span></div>` : "";
        const body = lists[l].map((s) => row(s, l)).join("") || `<div class="pad hint-text">${esc(showAll() ? tr("wl.emptyAll", "Empty. Drag a symbol here.") : tr("wl.emptyOne", "Empty list. Add a symbol above."))}</div>`;
        return `<div class="wl-list" data-list="${esc(l)}">${head}${body}</div>`;
      })
      .join("");
  }
  async function refreshQuotes() {
    const shown = shownLists(app.state.watchlists, app.state.activeWatchlist, showAll()).flatMap((l) => app.state.watchlists[l]);
    const syms = [...new Set([...shown, ...paperSymbols()])];
    if (!syms.length) return;
    try {
      const q = await api.quotes(syms);
      Object.assign(quotes, q);
      for (const [s, v] of Object.entries(q))
        if (v.price) app.onPrice(s, v.price);
      if (sideTab === "watchlist") drawRows();
    } catch {
      /* offline */
    }
  }
  setInterval(refreshQuotes, 5000);
  refreshQuotes();

  // ======================= ALERTS =======================
  async function renderAlerts() {
    side.innerHTML =
      `<div class="pad row-flex"><button class="btn primary" id="alNew">${esc(tr("al.new", "New alert"))}</button><button class="btn" id="alPerm">${esc(tr("al.perm", "Desktop notifications"))}</button></div><div id="alList"></div><h4 class="pad" style="margin:0;padding-bottom:0">${esc(tr("al.recent", "Recent"))}</h4><div id="alLog"></div>`;
    $("#alNew").onclick = () => openAlertDialog();
    const perm = $("#alPerm");
    if (!("Notification" in window) || Notification.permission === "granted")
      perm.remove();
    else
      perm.onclick = () =>
        Notification.requestPermission().then(() => renderAlerts());
    let list = [],
      log = [];
    try {
      [list, log] = await Promise.all([
        api.get("/api/alerts"),
        api.get("/api/alerts/log"),
      ]);
    } catch {
      /* server down */
    }
    const trigLabel = (t) => ({
      once: tr("al.once", "only once"),
      oncePerBar: tr("al.oncePerBar", "once per bar"),
      oncePerBarClose: tr("al.oncePerBarClose", "once per bar close"),
    }[t] || t);
    $("#alList").innerHTML =
      list
        .map(
          (a) =>
            `<div class="card" data-id="${a.id}"><div class="top"><div><b>${a.watchlist ? esc(tr("al.wlPrefix", "Watchlist: {name}", { name: a.watchlist })) : esc(ticker(a.symbol))}</b> <span class="muted">${esc(a.tf)}</span><div>${esc(describeAlert(a))}</div><div class="sub">${esc(a.active ? tr("al.active", "Active") : tr("al.stopped", "Stopped"))} · ${esc(trigLabel(a.trigger))}${a.webhook ? " · webhook" : ""}${a.fired ? ` · ${esc(tr("al.fired", "fired {n}x", { n: a.fired }))}` : ""}</div></div><div class="row-flex" style="flex-wrap:nowrap"><button class="btn small" data-act="toggle">${esc(a.active ? tr("al.stop", "Stop") : tr("al.restart", "Restart"))}</button><button class="btn small danger" data-act="del">${esc(tr("al.delete", "Delete"))}</button></div></div></div>`,
        )
        .join("") ||
      `<div class="pad hint-text">${esc(tr("al.empty", "No alerts yet. They run inside the app, so they keep firing with this tab closed as long as the app is running."))}</div>`;
    $("#alLog").innerHTML =
      log
        .slice(0, 30)
        .map(
          (e) =>
            `<div class="card"><div>${esc(e.text)}</div><div class="sub">${new Date(e.at).toLocaleString(locale())}${e.webhook ? ` · webhook ${esc(e.webhook)}` : ""}</div></div>`,
        )
        .join("") || `<div class="pad hint-text">${esc(tr("al.logEmpty", "Nothing has fired yet."))}</div>`;
    $("#alList").onclick = async (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const id = btn.closest("[data-id]").dataset.id;
      const a = list.find((x) => x.id === id);
      if (btn.dataset.act === "del") await api.del(`/api/alerts/${id}`);
      if (btn.dataset.act === "toggle")
        await api.patch(`/api/alerts/${id}`, {
          active: !a.active,
          lastBar: null,
          lastBars: {},
        });
      renderAlerts();
    };
  }
  function describeAlert(a) {
    if (a.message) return a.message;
    const name = (x) => {
      if (typeof x === "number") return fmtPrice(x);
      if (PRICE.includes(x)) return x === "close" ? tr("al.price", "Price") : x;
      const [k, out] = String(x).split(".");
      const s = a.indicators?.[k];
      const def = BY_ID[s?.id];
      return def
        ? `${def.name.replace(/ \(.*\)$/, "")} ${Object.values(s.params || {}).join(" ")}${out && outputsOf(def).length > 1 ? ` ${out}` : ""}`
        : x;
    };
    const conds = a.conditions?.length ? a.conditions : [{ left: a.left, op: a.op, right: a.right }];
    const nm = (x) => (x && typeof x === "object" && x.line ? tr("al.yourLine", "your drawn line") : name(x));
    return conds.map((c) => `${nm(c.left)} ${opLabel(c.op)} ${nm(c.right)}`).join(a.match === "any" ? tr("al.or", " or ") : tr("al.and", " and "));
  }
  function openAlertDialog(preset = {}) {
    const p = app.active;
    const price = p?.shown.at(-1)?.close ?? 0;
    const rules = preset.rules || [preset.rule || {
      left: { kind: "price", field: "close" },
      op: "crossesAbove",
      right: { kind: "value", v: Number(price.toPrecision(6)) },
    }];
    const card = app.modal(
      tr("al.createTitle", "Create alert"),
      `<div class="form-grid"><label class="field">${esc(tr("al.symbol", "Symbol"))}<input id="aSym" value="${esc(preset.symbol || p?.cfg.symbol || "")}"></label><label class="field">${esc(tr("al.check", "Check"))}<select id="aScope"><option value="">${esc(tr("al.justThis", "Just this symbol"))}</option>${Object.keys(app.state.watchlists || {}).map((n) => `<option value="${esc(n)}">${esc(tr("al.everyIn", "Every symbol on {name}", { name: n }))}</option>`).join("")}</select></label><label class="field">${esc(tr("al.tf", "Timeframe"))}<input id="aTf" value="${esc(p?.cfg.tf || "1h")}"></label></div>
      <h4>${esc(tr("al.conditions", "Conditions"))}</h4><div class="rules" id="aRule">${rules.map(ruleHtml).join("")}</div>
      <div class="row-flex"><button class="btn small" id="aAdd">${esc(tr("al.addCond", "+ Condition"))}</button><label class="field" style="flex-direction:row;align-items:center;gap:6px">${esc(tr("al.fireWhen", "Fire when"))}<select id="aMatch"><option value="all">${esc(tr("al.matchAll", "all are true"))}</option><option value="any">${esc(tr("al.matchAny", "any is true"))}</option></select></label><span class="hint-text">${esc(tr("al.max5", "Up to 5."))}</span></div>
      <div class="form-grid"><label class="field">${esc(tr("al.trigger", "Trigger"))}<select id="aTrig"><option value="once">${esc(tr("al.trigOnce", "Only once"))}</option><option value="oncePerBar">${esc(tr("al.trigBar", "Once per bar"))}</option><option value="oncePerBarClose">${esc(tr("al.trigClose", "Once per bar close"))}</option></select></label><label class="field">${esc(tr("al.msgOpt", "Message (optional)"))}<input id="aMsg" placeholder="${esc(tr("al.msgPh", "BTC broke out"))}"></label></div>
      <h4>${esc(tr("al.sendTo", "Also send to (optional)"))}</h4><div class="row-flex"><input class="in" id="aHook" placeholder="${esc(tr("al.hookPh", "Discord, Slack or Telegram webhook URL"))}" style="flex:1"><button class="btn" id="aTest">${esc(tr("al.test", "Test"))}</button></div>
      <p class="hint-text">${tr("al.tgHint", "Telegram: https://api.telegram.org/bot&lt;token&gt;/sendMessage?chat_id=&lt;your id&gt;. Alerts are checked every 15 seconds while the app runs.")}</p>`,
      {
        foot: `<button class="btn primary" id="aOk">${esc(tr("al.createBtn", "Create alert"))}</button>`,
        wide: true,
      },
    );
    bindRules(card.querySelector("#aRule"));
    card.querySelector("#aAdd").onclick = () => {
      const box = card.querySelector("#aRule");
      if (box.querySelectorAll(".rule").length >= 5) return app.toast(tr("al.max5Toast", "An alert can have up to 5 conditions."));
      box.insertAdjacentHTML("beforeend", ruleHtml({ left: { kind: "price", field: "close" }, op: ">", right: { kind: "value", v: Number(price.toPrecision(6)) } }));
    };
    card.querySelector("#aTest").onclick = async () => {
      try {
        const r = await api.post("/api/webhook-test", {
          url: card.querySelector("#aHook").value.trim(),
        });
        app.toast(
          r.ok ? tr("al.testSent", "Test message sent.") : tr("al.hookErr", "Webhook replied HTTP {status}", { status: r.status }),
          r.ok ? "" : "err",
        );
      } catch (e) {
        app.toast(e.message, "err");
      }
    };
    card.querySelector("#aOk").onclick = async () => {
      const rs = readRules(card.querySelector("#aRule"));
      if (!rs.length) return app.toast(tr("al.needCond", "Add a condition."), "err");
      const c = compileRules({ rules: rs });
      try {
        const watchlist = card.querySelector("#aScope").value;
        await api.post("/api/alerts", {
          symbol: card.querySelector("#aSym").value.trim(),
          watchlist: watchlist || undefined,
          tf: card.querySelector("#aTf").value.trim(),
          left: c.rules[0].left,
          op: c.rules[0].op,
          right: c.rules[0].right,
          conditions: c.rules,
          match: card.querySelector("#aMatch").value,
          indicators: c.indicators,
          trigger: card.querySelector("#aTrig").value,
          message: card.querySelector("#aMsg").value.trim(),
          webhook: card.querySelector("#aHook").value.trim(),
        });
        app.closeModal();
        app.toast(tr("al.created", "Alert created."));
        if ("Notification" in window && Notification.permission === "default")
          Notification.requestPermission();
        showSide("alerts");
      } catch (e) {
        app.toast(e.message, "err");
      }
    };
  }

  // ======================= CALENDAR =======================
  let calFilter = "High", calView = "economic", calMine = false;
  async function renderCalendar() {
    side.innerHTML = `<div class="pad row-flex"><select class="in" id="calV"><option value="economic">${esc(tr("cal.economic", "Economic"))}</option><option value="earnings">${esc(tr("cal.earnings", "Earnings"))}</option><option value="dividends">${esc(tr("cal.dividends", "Dividends"))}</option></select><span class="spacer"></span>${
      calView === "economic"
        ? `<select class="in" id="calF"><option value="all">${esc(tr("cal.all", "All"))}</option><option value="Medium">${esc(tr("cal.medHigh", "Medium + high"))}</option><option value="High">${esc(tr("cal.high", "High impact"))}</option></select>`
        : `<label class="hint-text"><input type="checkbox" id="calMine" ${calMine ? "checked" : ""}> ${esc(tr("cal.myLists", "My watchlists"))}</label>`
    }</div><div id="calList" class="pad hint-text">${esc(tr("cal.loading", "Loading…"))}</div>`;
    $("#calV").value = calView;
    $("#calV").onchange = (e) => { calView = e.target.value; renderCalendar(); };
    if ($("#calF")) { $("#calF").value = calFilter; $("#calF").onchange = (e) => { calFilter = e.target.value; renderCalendar(); }; }
    if ($("#calMine")) $("#calMine").onchange = (e) => { calMine = e.target.checked; renderCalendar(); };
    const list = $("#calList");
    const dayHead = (label) => `<h4 class="pad" style="margin:0;padding-bottom:0">${esc(label)}</h4>`;
    const fmtDay = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "short" });
    const mine = new Set(Object.values(app.state.watchlists || {}).flat());
    try {
      if (calView === "economic") {
        const rows = await api.get("/api/calendar");
        const keep = (r) => calFilter === "all" || r.impact === "High" || (calFilter === "Medium" && r.impact === "Medium");
        let day = "";
        list.className = "";
        list.innerHTML = rows.filter(keep).map((r) => {
          const d = new Date(r.date);
          const label = d.toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "short" });
          const head = label !== day ? dayHead((day = label)) : "";
          return `${head}<div class="card"><div class="top"><span><b>${esc(r.country)}</b> ${esc(r.title)}</span><span class="impact-${esc(r.impact)}">${esc(r.impact)}</span></div><div class="sub">${d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" })}${r.forecast ? ` · ${esc(tr("cal.forecast", "forecast"))} ${esc(r.forecast)}` : ""}${r.previous ? ` · ${esc(tr("cal.previous", "previous"))} ${esc(r.previous)}` : ""}</div></div>`;
        }).join("") || `<div class="pad hint-text">${esc(tr("cal.emptyEcon", "Nothing at this impact level this week."))}</div>`;
        return;
      }
      const rows = (await api.get(`/api/${calView}?days=5`)).filter((r) => !calMine || mine.has(r.symbol));
      rows.sort((x, y) => x.date.localeCompare(y.date) || (mine.has(y.symbol) - mine.has(x.symbol)) || (y.marketCap || 0) - (x.marketCap || 0));
      let day = "";
      list.className = "";
      list.innerHTML = rows.slice(0, 250).map((r) => {
        const head = r.date !== day ? dayHead(fmtDay((day = r.date))) : "";
        const star = mine.has(r.symbol) ? ` <span class="up" title="${esc(tr("cal.onWatchlist", "On your watchlist"))}">●</span>` : "";
        const sub = calView === "earnings"
          ? `${esc(r.when)}${r.epsForecast ? ` · ${esc(tr("cal.epsForecast", "EPS forecast"))} ${esc(r.epsForecast)}` : ""}${r.lastYearEps ? ` · ${esc(tr("cal.lastYear", "last year"))} ${esc(r.lastYearEps)}` : ""}${r.marketCap ? ` · ${esc(tr("cal.cap", "cap"))} ${fmtNum(r.marketCap)}` : ""}`
          : `${r.amount != null ? `${fmtPrice(r.amount)} ${esc(tr("cal.perShare", "a share"))}` : ""}${r.payDate ? ` · ${esc(tr("cal.paid", "paid"))} ${esc(r.payDate)}` : ""}${r.annual ? ` · ${fmtPrice(r.annual)} ${esc(tr("cal.perYear", "a year"))}` : ""}`;
        return `${head}<div class="card cal-row" data-sym="${esc(r.symbol)}" style="cursor:pointer"><div class="top"><span><b>${esc(r.ticker)}</b>${star} <span class="muted">${esc((r.name || "").slice(0, 34))}</span></span></div><div class="sub">${sub}</div></div>`;
      }).join("") || `<div class="pad hint-text">${esc(calMine ? tr("cal.emptyMine", "None of your watchlist symbols in the next five trading days.") : tr("cal.emptyOther", "Nothing listed for the next five trading days."))}</div>`;
      list.onclick = (e) => { const row = e.target.closest(".cal-row"); if (row) app.setSymbol(row.dataset.sym); };
    } catch (e) {
      list.textContent = tr("cal.unavail", "Calendar unavailable: {msg}", { msg: e.message });
    }
  }

  // ======================= STRATEGY TESTER =======================
  let lastResult = null,
    equityChart = null;
  const tState = {
    groups: null,
    settings: {
      direction: "long",
      stopLossPct: 0,
      takeProfitPct: 0,
      trailingStopPct: 0,
      exitMatch: "all",
      maxBarsInTrade: 0,
      initialCapital: 10000,
      positionPct: 100,
      feePct: 0.1,
      slippagePct: 0.05,
      spreadPct: 0,
      intrabar: "worst",
    },
  };
  function strategyToUi(s) {
    const ind = s.indicators || {};
    const g = (k) =>
      (s[k] || []).map((r) => ({
        left: toOperand(r.left, ind),
        op: r.op,
        right: toOperand(r.right, ind),
      }));
    tState.groups = {
      entryLong: g("entryLong"),
      exitLong: g("exitLong"),
      entryShort: g("entryShort"),
      exitShort: g("exitShort"),
    };
    for (const k of ["stopLossPct", "takeProfitPct", "trailingStopPct", "maxBarsInTrade"])
      tState.settings[k] = s[k] || 0;
    tState.settings.exitMatch = s.exitMatch === "any" ? "any" : "all";
  }
  if (!tState.groups) strategyToUi(EXAMPLE_STRATEGIES["EMA cross (9/21)"]);

  function readTester() {
    const groups = {};
    for (const k of ["entryLong", "exitLong", "entryShort", "exitShort"])
      groups[k] = readRules(bottom.querySelector(`[data-g="${k}"]`));
    tState.groups = groups;
    bottom.querySelectorAll("[data-s]").forEach((el) => {
      tState.settings[el.dataset.s] =
        el.type === "number" ? Number(el.value) : el.value;
    });
    return { ...compileRules(groups), ...tState.settings };
  }

  function renderTester() {
    const group = (k, title) =>
      `<h4>${esc(title)}</h4><div class="rules" data-g="${k}">${(tState.groups[k] || []).map(ruleHtml).join("")}</div><button class="btn small" data-add="${k}">${esc(tr("al.addCond", "+ Condition"))}</button>`;
    const num = (k, label, step = "any") =>
      `<label class="field">${esc(label)}<input data-s="${k}" type="number" step="${step}" value="${tState.settings[k]}"></label>`;
    const saved = Object.keys(app.state.strategies || {});
    bottom.innerHTML = `<div class="tester"><div class="left">
      <div class="row-flex"><select class="in" id="tPreset"><option value="">${esc(tr("ts.load", "Load a strategy…"))}</option><optgroup label="${esc(tr("ts.examples", "Examples"))}">${Object.keys(
        EXAMPLE_STRATEGIES,
      )
        .map((n) => `<option value="ex:${esc(n)}">${esc(trStrategy(n))}</option>`)
        .join(
          "",
        )}</optgroup>${saved.length ? `<optgroup label="${esc(tr("ts.saved", "Saved"))}">${saved.map((n) => `<option value="sv:${esc(n)}">${esc(n)}</option>`).join("")}</optgroup>` : ""}</select><button class="btn primary" id="tRun">${esc(tr("ts.run", "Run on chart"))}</button></div>
      <p class="hint-text">${esc(tr("ts.intro", "Entry conditions must all be true. Exits can need all of theirs or just one. Leave a section empty to skip it. Signals use the bar's close and fill at the next bar's open."))}</p>
      ${group("entryLong", tr("ts.entryLong", "Buy (enter long) when"))}${group("exitLong", tr("ts.exitLong", "Sell (exit long) when"))}${group("entryShort", tr("ts.entryShort", "Enter short when"))}${group("exitShort", tr("ts.exitShort", "Exit short when"))}
      <h4>${esc(tr("ts.exits", "Exits"))}</h4><div class="row-flex"><label class="field">${esc(tr("ts.exitWhen", "Exit when"))}<select class="in" data-s="exitMatch"><option value="all"${tState.settings.exitMatch === "any" ? "" : " selected"}>${esc(tr("ts.exitAll", "all exit conditions are true"))}</option><option value="any"${tState.settings.exitMatch === "any" ? " selected" : ""}>${esc(tr("ts.exitAny", "any one exit condition is true"))}</option></select></label>${num("maxBarsInTrade", tr("ts.maxBars", "Exit after this many bars (0 = off)"), 1)}</div>
      <h4>${esc(tr("ts.risk", "Risk"))}</h4><div class="row-flex">${num("stopLossPct", tr("ts.sl", "Stop loss %"))}${num("takeProfitPct", tr("ts.tp", "Take profit %"))}${num("trailingStopPct", tr("ts.trail", "Trailing stop %"))}</div>
      <h4>${esc(tr("ts.money", "Money"))}</h4><div class="row-flex">${num("initialCapital", tr("ts.cap", "Starting capital"))}${num("positionPct", tr("ts.pos", "Position size %"))}${num("feePct", tr("ts.fee", "Fee % per side"))}${num("slippagePct", tr("ts.slip", "Slippage % per side"))}${num("spreadPct", tr("ts.spread", "Spread % (bid to ask)"))}<button class="btn small" id="tSpread" title="${esc(tr("ts.liveSpreadTitle", "Read the live bid and ask (crypto)"))}">${esc(tr("ts.liveSpread", "Live spread"))}</button></div>
      <h4>${esc(tr("ts.fillsHdr", "Fills inside a bar"))}</h4><div class="row-flex"><label class="field">${esc(tr("ts.stopsTargets", "Stops and targets"))}<select class="in" data-s="intrabar">${[
        ["worst", tr("ts.intrabar.worst", "Stop first when a bar touches both (cautious)")],
        ["ohlc", tr("ts.intrabar.ohlc", "TradingView's path: open, nearer extreme, far extreme, close")],
        ["magnifier", tr("ts.intrabar.magnifier", "Bar magnifier: real lower-timeframe bars inside each bar")],
      ]
        .map(([v, t]) => `<option value="${v}"${tState.settings.intrabar === v ? " selected" : ""}>${esc(t)}</option>`)
        .join("")}</select></label></div>
      <h4>${esc(tr("ts.ownData", "Your own data"))}</h4><div class="row-flex"><button class="btn small" id="tImpBars">${esc(tr("ts.impBars", "Import bars (CSV)"))}</button><button class="btn small" id="tImpSig">${esc(tr("ts.impSig", "Import signal (CSV)"))}</button><input type="file" id="tImpFile" accept=".csv,.txt,text/csv" hidden></div>
      <p class="hint-text">${esc(tr("ts.impHint", "Bars: time, open, high, low, close and volume, one symbol per file (an Alpaca export works as it is). They chart as CSV:NAME on their own timeframe and longer. Signal: time and position, 1 long, 0 flat, -1 short, from that bar's close. It loads here as rules, so Run on chart and the quant checks test your strategy as written."))}</p>
      <div class="row-flex" style="margin-top:12px"><button class="btn" id="tSave">${esc(tr("ts.saveStrat", "Save strategy"))}</button><button class="btn" id="tJson">${esc(tr("ts.editJson", "Edit as JSON"))}</button></div>
    </div><div class="right" id="tOut"><div class="hint-text">${tr("ts.emptyOut", "Pick or build a strategy, then press <b>Run on chart</b>. It runs on the active chart's symbol and timeframe.")}</div></div></div>`;
    for (const k of ["entryLong", "exitLong", "entryShort", "exitShort"])
      bindRules(bottom.querySelector(`[data-g="${k}"]`));
    bottom.querySelectorAll("[data-add]").forEach((b) => {
      b.onclick = () => {
        bottom
          .querySelector(`[data-g="${b.dataset.add}"]`)
          .insertAdjacentHTML("beforeend", ruleHtml(defaultRule()));
      };
    });
    $("#tPreset").onchange = (e) => {
      const v = e.target.value;
      if (!v) return;
      const s = v.startsWith("ex:")
        ? EXAMPLE_STRATEGIES[v.slice(3)]
        : app.state.strategies[v.slice(3)];
      strategyToUi(s);
      tState.name = v.slice(3);
      for (const k of [
        "initialCapital",
        "positionPct",
        "feePct",
        "slippagePct",
        "spreadPct",
        "intrabar",
      ])
        if (s[k] != null) tState.settings[k] = s[k];
      renderTester();
    };
    $("#tRun").onclick = runTester;
    let impKind = "bars";
    const pickFile = (kind) => {
      impKind = kind;
      $("#tImpFile").value = "";
      $("#tImpFile").click();
    };
    $("#tImpBars").onclick = () => pickFile("bars");
    $("#tImpSig").onclick = () => pickFile("signal");
    $("#tImpFile").onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        app.toast(tr("ts.reading", "Reading {name}…", { name: f.name }));
        const res = await fetch(`/api/import/${impKind}?name=${encodeURIComponent(f.name)}`, {
          method: "POST",
          headers: { "x-qt": "1", "Content-Type": "text/csv" },
          body: await f.text(),
        });
        const r = await res.json();
        if (!res.ok) throw new Error(r.error || `HTTP ${res.status}`);
        if (impKind === "bars") {
          const pane = app.active;
          if (pane && parseTf(pane.cfg.tf).seconds < parseTf(r.tf).seconds) pane.cfg.tf = r.tf;
          app.setSymbol(r.symbol);
          app.toast(tr("ts.importedBars", "Imported {bars} {tf} bars as {sym}{skip}. Pick any timeframe from {tf} up.", {
            bars: r.bars.toLocaleString(locale()),
            tf: r.tf,
            sym: r.symbol,
            skip: r.skipped ? tr("ts.skippedRows", " (skipped {n} rows with no price)", { n: r.skipped }) : "",
          }));
        } else {
          if (!(await app.importCustom(r.file))) return;
          strategyToUi(r.strategy);
          tState.name = tr("ts.signalName", "Signal {name}", { name: r.name });
          renderTester();
          app.toast(tr("ts.loadedSig", "Loaded your signal {name}: {changes} position changes. Open the bars it was made on, then press Run on chart.", {
            name: r.name,
            changes: r.changes.toLocaleString(locale()),
          }));
        }
      } catch (err) {
        app.toast(err.message, "err");
      }
    };
    $("#tSpread").onclick = async () => {
      const sym = app.active?.cfg.symbol;
      try {
        const r = await api.get(`/api/spread?symbol=${encodeURIComponent(sym)}`);
        bottom.querySelector('[data-s="spreadPct"]').value = Number(r.spreadPct.toPrecision(2));
        app.toast(tr("ts.spreadToast", "{sym} on {src}: bid {bid}, ask {ask}. Spread set to {sp}%.", {
          sym: ticker(r.symbol),
          src: r.source,
          bid: fmtPrice(r.bid),
          ask: fmtPrice(r.ask),
          sp: Number(r.spreadPct.toPrecision(2)),
        }));
      } catch (e) {
        app.toast(e.message, "err");
      }
    };
    $("#tSave").onclick = () => {
      const name = prompt(tr("ts.namePrompt", "Name this strategy:"));
      if (!name) return;
      app.state.strategies = {
        ...(app.state.strategies || {}),
        [name]: readTester(),
      };
      app.persist();
      app.toast(tr("ts.savedToast", 'Saved "{name}".', { name }));
    };
    $("#tJson").onclick = () => {
      const card = app.modal(
        tr("ts.jsonTitle", "Strategy JSON"),
        `<p class="hint-text">${esc(tr("ts.jsonHint", "The same format your AI agent can write. Operands: numbers, price fields, indicator keys, or key.output."))}</p><textarea class="in" id="tJ" rows="22">${esc(JSON.stringify(readTester(), null, 2))}</textarea>`,
        {
          foot: `<button class="btn primary" id="tJOk">${esc(tr("app.apply", "Apply"))}</button>`,
          wide: true,
        },
      );
      card.querySelector("#tJOk").onclick = () => {
        try {
          const s = JSON.parse(card.querySelector("#tJ").value);
          strategyToUi(s);
          for (const k of [
            "initialCapital",
            "positionPct",
            "feePct",
            "slippagePct",
            "spreadPct",
            "intrabar",
          ])
            if (s[k] != null) tState.settings[k] = s[k];
          app.closeModal();
          renderTester();
        } catch (e) {
          app.toast(tr("ts.badJson", "Invalid JSON: {msg}", { msg: e.message }), "err");
        }
      };
    };
    if (lastResult) showResult(lastResult);
  }

  async function runTester() {
    const p = app.active;
    if (!p?.bars.length)
      return app.toast(tr("ts.noChartData", "The active chart has no data yet."), "err");
    let strat;
    try {
      strat = readTester();
    } catch (e) {
      return app.toast(e.message, "err");
    }
    if (!strat.entryLong.length && !strat.entryShort.length)
      return app.toast(tr("ts.needEntry", "Add at least one entry condition."), "err");
    try {
      const bars = p.replay ? p.bars.slice(0, p.replay.index + 1) : p.bars;
      let subBars = null;
      if (strat.intrabar === "magnifier") {
        const sec = parseTf(p.cfg.tf).seconds;
        const m = magnifierTf(sec, bars.at(-1).time - bars[0].time + sec);
        if (!m) app.toast(tr("ts.magFinest", "This chart is already as fine as the bar magnifier goes, so it uses the OHLC path."));
        else {
          app.toast(tr("ts.magLoading", "Loading {tf} bars for the bar magnifier…", { tf: m.tf }));
          const span = bars.at(-1).time - bars[0].time + sec;
          const r = await api.candles(p.cfg.symbol, m.tf, Math.ceil(span / m.seconds) + 10);
          subBars = r.candles.filter((c) => c.time >= bars[0].time && c.time < bars.at(-1).time + sec);
        }
      }
      const r = backtest(bars, strat, { subBars });
      lastResult = { ...r, symbol: p.cfg.symbol, tf: p.cfg.tf, bars, strat, subBars };
      p.extraMarkers = r.trades.flatMap((t) => [
        {
          time: t.entryTime,
          position: t.side === "long" ? "belowBar" : "aboveBar",
          shape: t.side === "long" ? "arrowUp" : "arrowDown",
          color: t.side === "long" ? "#2962ff" : "#ff6d00",
          text: t.side === "long" ? tr("ts.buyMarker", "Buy") : tr("ts.shortMarker", "Short"),
        },
        {
          time: t.exitTime,
          position: t.side === "long" ? "aboveBar" : "belowBar",
          shape: "circle",
          color: t.pnl >= 0 ? "#089981" : "#f23645",
          text: `${t.pnlPct >= 0 ? "+" : ""}${t.pnlPct.toFixed(1)}%`,
        },
      ]);
      p.render(false);
      showResult(lastResult);
    } catch (e) {
      app.toast(e.message, "err");
    }
  }

  function showResult(r) {
    const out = $("#tOut");
    if (!out) return;
    const s = r.stats;
    const stat = (k, v, cls = "") =>
      `<div class="stat"><div class="k">${esc(k)}</div><div class="v ${cls}">${v ?? "—"}</div></div>`;
    const pc = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v}%`);
    out.innerHTML = `<div class="row-flex"><b>${esc(ticker(r.symbol))} ${esc(r.tf)}</b><span class="hint-text">${esc(tr("ts.barsCount", "{n} bars", { n: r.bars.length }))} · ${new Date(r.bars[0].time * 1000).toLocaleDateString(locale())} ${esc(tr("ts.to", "to"))} ${new Date(r.bars.at(-1).time * 1000).toLocaleDateString(locale())} · ${esc(trFees(s.feesAndSlippage))} · ${esc(trFills(s.fills))}</span><span class="spacer"></span><button class="btn small" id="tCsv">${esc(tr("ts.expTrades", "Export trades (CSV)"))}</button><button class="btn small" id="tClear">${esc(tr("ts.clearMarks", "Clear chart marks"))}</button></div>
      <div class="stats">${stat(tr("ts.netProfit", "Net profit"), pc(s.netProfitPct), s.netProfitPct >= 0 ? "up" : "down")}${stat(tr("ts.buyHold", "Buy and hold"), pc(s.buyHoldPct), s.buyHoldPct >= 0 ? "up" : "down")}${stat(tr("ts.maxDd", "Max drawdown"), s.maxDrawdownPct == null ? "—" : `-${s.maxDrawdownPct}%`, "down")}${stat(tr("ts.trades", "Trades"), s.totalTrades)}${stat(tr("ts.winRate", "Win rate"), s.winRatePct == null ? "—" : `${s.winRatePct}%`)}${stat(tr("ts.pf", "Profit factor"), s.profitFactor)}${stat(tr("ts.sharpe", "Sharpe"), s.sharpe)}${stat(tr("ts.sortino", "Sortino"), s.sortino)}${stat(tr("ts.avgTrade", "Avg trade"), pc(s.avgTradePct))}${stat(tr("ts.exposure", "Time in market"), s.exposurePct == null ? "—" : `${s.exposurePct}%`)}</div>
      <div class="equity" id="tEq"></div>
      <div id="tQuant"></div>
      <div id="tPtq"></div>
      <table class="t"><thead><tr><th>${esc(tr("ts.side", "Side"))}</th><th>${esc(tr("ts.entryTime", "Entry"))}</th><th>${esc(tr("ts.exitTime", "Exit"))}</th><th>${esc(tr("ts.entryPx", "Entry price"))}</th><th>${esc(tr("ts.exitPx", "Exit price"))}</th><th>${esc(tr("ts.pnlPct", "P&L %"))}</th><th>${esc(tr("ts.bars", "Bars"))}</th><th class="l">${esc(tr("ts.exitReason", "Exit reason"))}</th></tr></thead><tbody>${r.trades
        .slice()
        .reverse()
        .slice(0, 300)
        .map(
          (t) =>
            `<tr data-t="${t.entryTime}"><td>${esc(t.side === "long" ? tr("ts.sideLong", "long") : tr("ts.sideShort", "short"))}</td><td>${new Date(t.entryTime * 1000).toLocaleString(locale())}</td><td>${new Date(t.exitTime * 1000).toLocaleString(locale())}</td><td>${fmtPrice(t.entryPrice)}</td><td>${fmtPrice(t.exitPrice)}</td><td class="${t.pnl >= 0 ? "up" : "down"}">${t.pnlPct.toFixed(2)}%</td><td>${t.bars}</td><td class="l">${esc(trExitReason(t.exitReason))}</td></tr>`,
        )
        .join("")}</tbody></table>`;
    $("#tCsv").onclick = () =>
      download(`${ticker(r.symbol)}-${r.tf}-trades.csv`, tradesCsv(r.trades));
    $("#tClear").onclick = () => {
      app.active.extraMarkers = [];
      app.active.render(false);
    };
    equityChart?.remove();
    const el = $("#tEq");
    equityChart = LW.createChart(el, {
      autoSize: true,
      layout: {
        background: { type: "solid", color: css("--bg") },
        textColor: css("--text"),
        fontSize: 10,
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: css("--grid") },
      },
      localization: { locale: locale() },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
    });
    const eq = equityChart.addSeries(LW.AreaSeries, {
      lineColor: "#2962ff",
      topColor: "rgba(41,98,255,.3)",
      bottomColor: "rgba(41,98,255,0)",
      lineWidth: 2,
      title: tr("ts.eqStrat", "Strategy"),
    });
    eq.setData(r.equity.map((e) => ({ time: e.time, value: e.value })));
    const bh = equityChart.addSeries(LW.LineSeries, {
      color: "#787b86",
      lineWidth: 1,
      title: tr("ts.eqBh", "Buy & hold"),
      priceLineVisible: false,
    });
    const c0 = r.bars[0].close;
    bh.setData(
      r.bars.map((b) => ({
        time: b.time,
        value: (r.strat.initialCapital * b.close) / c0,
      })),
    );
    equityChart.timeScale().fitContent();
    mountQuantChecks($("#tQuant"), r);
    mountPtqCheck($("#tPtq"), { strategy: r.strat, symbol: r.symbol, tf: r.tf, name: tState.name || `${ticker(r.symbol)} ${r.tf}` });
  }

  // ======================= SCREENER =======================
  const sc = {
    universe: "crypto",
    rows: [],
    sort: "volume",
    dir: -1,
    filters: {},
    scan: null,
    rule: {
      left: { kind: "ind", id: "rsi", params: { length: 14 }, output: "value" },
      op: "<",
      right: { kind: "value", v: 30 },
    },
    tf: "1D",
  };
  async function loadScreener() {
    $("#scTable").innerHTML = `<div class="pad hint-text">${esc(tr("cal.loading", "Loading…"))}</div>`;
    try {
      sc.rows = await api.get(`/api/screener?universe=${sc.universe}`);
      sc.scan = null;
    } catch (e) {
      sc.rows = [];
      app.toast(e.message, "err");
    }
    drawScreener();
  }
  function filtered() {
    const f = sc.filters;
    const term = (f.q || "").toLowerCase();
    return sc.rows
      .filter(
        (r) =>
          (!term || `${r.ticker} ${r.name}`.toLowerCase().includes(term)) &&
          (f.minPrice == null || r.price >= f.minPrice) &&
          (f.maxPrice == null || r.price <= f.maxPrice) &&
          (f.minChg == null || r.changePct >= f.minChg) &&
          (f.maxChg == null || r.changePct <= f.maxChg) &&
          (f.minVol == null || r.volume >= f.minVol) &&
          (f.minCap == null || (r.marketCap || 0) >= f.minCap) &&
          (!f.sector || r.sector === f.sector) &&
          (!sc.scan || sc.scan[r.symbol]?.pass),
      )
      .sort(
        (a, b) =>
          sc.dir *
          (typeof a[sc.sort] === "string"
            ? a[sc.sort].localeCompare(b[sc.sort])
            : (a[sc.sort] || 0) - (b[sc.sort] || 0)),
      );
  }
  function renderScreener() {
    const sectors = [
      ...new Set(sc.rows.map((r) => r.sector).filter(Boolean)),
    ].sort();
    const n = (k, label, w = 80) =>
      `<label class="field">${esc(label)}<input data-f="${k}" type="number" step="any" style="width:${w}px" value="${sc.filters[k] ?? ""}"></label>`;
    bottom.innerHTML = `<div class="pad"><div class="row-flex">
      <label class="field">${esc(tr("sc.market", "Market"))}<select id="scU"><option value="crypto">${esc(tr("sc.crypto", "Crypto (USDT pairs)"))}</option><option value="us">${esc(tr("sc.us", "US stocks"))}</option><option value="etf">${esc(tr("sc.etf", "US ETFs"))}</option><option value="india">${esc(tr("sc.india", "India (NSE, 100 largest)"))}</option></select></label>
      <label class="field">${esc(tr("sc.search", "Search"))}<input data-f="q" value="${esc(sc.filters.q || "")}" style="width:120px"></label>
      ${n("minPrice", tr("sc.priceFrom", "Price from"))}${n("maxPrice", tr("sc.priceTo", "Price to"))}${n("minChg", tr("sc.chgFrom", "Change % from"), 70)}${n("maxChg", tr("sc.chgTo", "Change % to"), 70)}${n("minVol", tr("sc.minVol", "Min volume"), 100)}${["us", "etf"].includes(sc.universe) ? n("minCap", tr("sc.minCap", "Min market cap"), 110) : ""}
      ${sectors.length > 1 ? `<label class="field">${esc(tr("sc.sector", "Sector"))}<select data-f="sector"><option value="">${esc(tr("sc.all", "All"))}</option>${sectors.map((s) => `<option ${s === sc.filters.sector ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></label>` : ""}
      <button class="btn" id="scRefresh" style="align-self:end">${esc(tr("news.refresh", "Refresh"))}</button></div>
      <div class="row-flex" style="margin-top:8px"><span class="hint-text">${esc(tr("sc.techFilter", "Technical filter:"))}</span><div class="rules" id="scRule" style="margin:0">${ruleHtml(sc.rule)}</div><label class="field">${esc(tr("sc.on", "On"))}<select id="scTf">${["1h", "4h", "1D", "1W"].map((t) => `<option ${t === sc.tf ? "selected" : ""}>${t}</option>`).join("")}</select></label><button class="btn primary" id="scScan" style="align-self:end">${esc(tr("sc.scan100", "Scan top 100"))}</button>${sc.scan ? `<button class="btn" id="scClear" style="align-self:end">${esc(tr("sc.clearScan", "Clear scan"))}</button>` : ""}</div></div>
      <div id="scTable"></div>`;
    $("#scU").value = sc.universe;
    $("#scU").onchange = (e) => {
      sc.universe = e.target.value;
      sc.filters = {};
      renderScreener();
      loadScreener();
    };
    bottom.querySelectorAll("[data-f]").forEach((el) => {
      el.oninput = () => {
        const v = el.value.trim();
        sc.filters[el.dataset.f] =
          v === "" ? null : el.type === "number" ? Number(v) : v;
        drawScreener();
      };
    });
    bindRules($("#scRule"));
    $("#scRule .x")?.remove();
    $("#scRefresh").onclick = loadScreener;
    $("#scClear") &&
      ($("#scClear").onclick = () => {
        sc.scan = null;
        renderScreener();
      });
    $("#scScan").onclick = async () => {
      const [rule] = readRules($("#scRule"));
      sc.rule = rule;
      sc.tf = $("#scTf").value;
      const c = compileRules({ rules: [rule] });
      const prev = sc.scan;
      sc.scan = null;
      const targets = filtered()
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 100)
        .map((r) => r.symbol);
      sc.scan = prev;
      $("#scScan").textContent = tr("sc.scanning", "Scanning {n}…", { n: targets.length });
      try {
        const res = await api.post("/api/scan", {
          symbols: targets,
          tf: sc.tf,
          indicators: c.indicators,
          rules: c.rules,
        });
        sc.scan = Object.fromEntries(res.map((x) => [x.symbol, x]));
        const hits = res.filter((x) => x.pass).length;
        app.toast(tr("sc.matched", "{h} of {t} match.", { h: hits, t: targets.length }));
      } catch (e) {
        app.toast(e.message, "err");
      }
      renderScreener();
    };
    if (!sc.rows.length) loadScreener();
    else drawScreener();
  }
  function drawScreener() {
    const box = $("#scTable");
    if (!box) return;
    const rows = filtered();
    const cols = [
      ["ticker", tr("sc.colSym", "Symbol")],
      ["name", tr("sc.colName", "Name")],
      ["price", tr("sc.colPrice", "Price")],
      ["changePct", tr("sc.colChg", "Change %")],
      ["volume", sc.universe === "crypto" ? tr("sc.colVolUsdt", "Volume (USDT)") : tr("sc.colVol", "Volume")],
      ...(["us", "etf"].includes(sc.universe) ? [["marketCap", tr("sc.colCap", "Market cap")]] : []),
      ...(sc.universe !== "crypto" ? [["sector", tr("sc.colSec", "Sector")]] : []),
    ];
    box.innerHTML = `<table class="t"><thead><tr>${cols.map(([k, l]) => `<th data-k="${k}" class="${k === "name" || k === "sector" ? "l" : ""}">${esc(l)}${sc.sort === k ? (sc.dir < 0 ? " ↓" : " ↑") : ""}</th>`).join("")}</tr></thead><tbody>${rows
      .slice(0, 500)
      .map(
        (r) =>
          `<tr data-s="${esc(r.symbol)}"><td><b>${esc(r.ticker)}</b></td><td class="l muted">${esc((r.name || "").slice(0, 40))}</td><td>${fmtPrice(r.price)}</td><td class="${r.changePct >= 0 ? "up" : "down"}">${fmtPct(r.changePct)}</td><td>${fmtNum(r.volume, 0)}</td>${["us", "etf"].includes(sc.universe) ? `<td>${fmtNum(r.marketCap, 0)}</td>` : ""}${sc.universe !== "crypto" ? `<td class="l muted">${esc(r.sector)}</td>` : ""}</tr>`,
      )
      .join(
        "",
      )}</tbody></table><div class="pad hint-text">${esc(tr("sc.footCount", "{n} matches{more}. Click a row to open its chart.", { n: rows.length, more: rows.length > 500 ? tr("sc.showing500", " (showing 500)") : "" }))}${esc(["us", "etf"].includes(sc.universe) ? tr("sc.usNote", " Live prices for the 200 largest companies; the rest show the last close.") : sc.universe === "india" ? tr("sc.inNote", " Prices from Yahoo, in rupees. Volume is shares traded today.") : "")}</div>`;
    box.querySelector("thead").onclick = (e) => {
      const k = e.target.closest("th")?.dataset.k;
      if (!k) return;
      sc.dir = sc.sort === k ? -sc.dir : -1;
      sc.sort = k;
      drawScreener();
    };
    box.querySelector("tbody").onclick = (e) => {
      const s = e.target.closest("tr")?.dataset.s;
      if (s) app.setSymbol(s);
    };
  }

  // ======================= HEATMAP =======================
  const hm = { universe: "us", size: "marketCap" };
  async function renderHeatmap() {
    bottom.innerHTML = `<div class="pad row-flex"><label class="field">${esc(tr("sc.market", "Market"))}<select id="hmU"><option value="us">${esc(tr("hm.us", "US stocks (200 largest)"))}</option><option value="crypto">${esc(tr("hm.crypto", "Crypto (100 most traded)"))}</option></select></label><label class="field">${esc(tr("hm.sizeBy", "Size by"))}<select id="hmS"><option value="marketCap">${esc(tr("hm.cap", "Market cap"))}</option><option value="volume">${esc(tr("hm.vol", "Volume"))}</option></select></label><span class="hint-text" style="align-self:end">${esc(tr("hm.hint", "Colour = today's change. Click a tile to open its chart."))}</span></div><div class="heatmap-wrap" style="height:calc(100% - 64px)"><canvas id="hmC"></canvas></div>`;
    $("#hmU").value = hm.universe;
    $("#hmS").value = hm.size;
    $("#hmU").onchange = (e) => {
      hm.universe = e.target.value;
      renderHeatmap();
    };
    $("#hmS").onchange = (e) => {
      hm.size = e.target.value;
      drawHeatmap();
    };
    try {
      const rows = await api.get(`/api/screener?universe=${hm.universe}`);
      hm.rows =
        hm.universe === "us"
          ? rows
              .filter((r) => r.marketCap > 0)
              .sort((a, b) => b.marketCap - a.marketCap)
              .slice(0, 200)
          : rows.sort((a, b) => b.volume - a.volume).slice(0, 100);
      drawHeatmap();
    } catch (e) {
      app.toast(e.message, "err");
    }
  }
  function squarify(items, x, y, w, h) {
    const out = [];
    let rest = items.filter((i) => i.value > 0);
    const total = rest.reduce((a, i) => a + i.value, 0);
    if (!total) return out;
    const scale = (w * h) / total;
    let rx = x,
      ry = y,
      rw = w,
      rh = h;
    while (rest.length) {
      const short = Math.min(rw, rh);
      const row = [];
      let best = Infinity;
      for (const it of rest) {
        const test = [...row, it];
        const s = test.reduce((a, i) => a + i.value * scale, 0);
        const max = Math.max(...test.map((i) => i.value * scale)),
          min = Math.min(...test.map((i) => i.value * scale));
        const worst = Math.max(
          (short * short * max) / (s * s),
          (s * s) / (short * short * min),
        );
        if (worst > best) break;
        best = worst;
        row.push(it);
      }
      const area = row.reduce((a, i) => a + i.value * scale, 0);
      const thick = area / short;
      let off = 0;
      for (const it of row) {
        const len = (it.value * scale) / thick;
        if (rw >= rh) out.push({ ...it, x: rx, y: ry + off, w: thick, h: len });
        else out.push({ ...it, x: rx + off, y: ry, w: len, h: thick });
        off += len;
      }
      if (rw >= rh) {
        rx += thick;
        rw -= thick;
      } else {
        ry += thick;
        rh -= thick;
      }
      rest = rest.slice(row.length);
    }
    return out;
  }
  function drawHeatmap() {
    const c = $("#hmC");
    if (!c || !hm.rows) return;
    const dpr = window.devicePixelRatio || 1,
      W = c.clientWidth,
      H = c.clientHeight;
    c.width = W * dpr;
    c.height = H * dpr;
    const ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    const cap = hm.universe === "us" ? 3 : 8;
    const color = (ch) => {
      const t = Math.max(-1, Math.min(1, ch / cap));
      const base = [66, 69, 80],
        up = [8, 153, 129],
        dn = [242, 54, 69];
      const tgt = t >= 0 ? up : dn,
        k = Math.abs(t);
      return `rgb(${base.map((b, i) => Math.round(b + (tgt[i] - b) * k)).join(",")})`;
    };
    const val = (r) =>
      Math.max(
        1,
        hm.size === "volume"
          ? r.volume * (hm.universe === "us" ? r.price : 1)
          : r.marketCap || r.volume,
      );
    let tiles = [];
    if (hm.universe === "us") {
      const bySector = {};
      for (const r of hm.rows) (bySector[r.sector || tr("hm.other", "Other")] ||= []).push(r);
      const groups = Object.entries(bySector)
        .map(([name, rs]) => ({
          name,
          value: rs.reduce((a, r) => a + val(r), 0),
          rs,
        }))
        .sort((a, b) => b.value - a.value);
      for (const g of squarify(groups, 0, 0, W, H)) {
        const inner = squarify(
          g.rs
            .map((r) => ({ ...r, value: val(r) }))
            .sort((a, b) => b.value - a.value),
          g.x + 1,
          g.y + 14,
          g.w - 2,
          g.h - 15,
        );
        tiles.push(...inner);
        ctx.fillStyle = css("--panel");
        ctx.fillRect(g.x, g.y, g.w, g.h);
        ctx.fillStyle = css("--muted");
        ctx.font = "600 10px -apple-system, Segoe UI, sans-serif";
        ctx.textBaseline = "top";
        if (g.w > 50)
          ctx.fillText(
            g.name.toUpperCase().slice(0, Math.floor(g.w / 7)),
            g.x + 4,
            g.y + 2,
          );
      }
    } else
      tiles = squarify(
        hm.rows
          .map((r) => ({ ...r, value: val(r) }))
          .sort((a, b) => b.value - a.value),
        0,
        0,
        W,
        H,
      );
    for (const t of tiles) {
      ctx.fillStyle = color(t.changePct);
      ctx.fillRect(t.x + 0.5, t.y + 0.5, t.w - 1, t.h - 1);
      if (t.w > 34 && t.h > 22) {
        const fs = Math.max(10, Math.min(22, Math.sqrt(t.w * t.h) / 5));
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `600 ${fs}px -apple-system, Segoe UI, sans-serif`;
        ctx.fillText(
          t.ticker.replace(/USDT$/, ""),
          t.x + t.w / 2,
          t.y + t.h / 2 - (t.h > 40 ? fs * 0.45 : 0),
        );
        if (t.h > 40) {
          ctx.font = `${fs * 0.75}px -apple-system, Segoe UI, sans-serif`;
          ctx.fillText(
            fmtPct(t.changePct),
            t.x + t.w / 2,
            t.y + t.h / 2 + fs * 0.6,
          );
        }
        ctx.textAlign = "left";
      }
    }
    hm.tiles = tiles;
    let tip = document.querySelector(".tip");
    c.onmousemove = (e) => {
      const r = c.getBoundingClientRect(),
        x = e.clientX - r.left,
        y = e.clientY - r.top;
      const t = tiles.find(
        (q) => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h,
      );
      if (!t) {
        tip?.remove();
        tip = null;
        return;
      }
      if (!tip) {
        tip = document.createElement("div");
        tip.className = "tip";
        document.body.appendChild(tip);
      }
      tip.innerHTML = `<b>${esc(t.ticker)}</b> ${esc(t.name || "")}<br>${fmtPrice(t.price)} <span class="${t.changePct >= 0 ? "up" : "down"}">${fmtPct(t.changePct)}</span>${t.marketCap ? `<br>${esc(tr("hm.tipCap", "Market cap {v}", { v: fmtNum(t.marketCap) }))}` : ""}`;
      tip.style.left = `${e.clientX + 14}px`;
      tip.style.top = `${e.clientY + 14}px`;
    };
    c.onmouseleave = () => {
      tip?.remove();
      tip = null;
    };
    c.onclick = (e) => {
      const r = c.getBoundingClientRect(),
        x = e.clientX - r.left,
        y = e.clientY - r.top;
      const t = tiles.find(
        (q) => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h,
      );
      if (t) app.setSymbol(t.symbol);
    };
  }
  window.addEventListener("resize", () => {
    if (bottomTab === "heatmap") drawHeatmap();
  });

  // ======================= PAPER TRADING =======================
  // While the active chart is in bar replay, paper trading uses a separate practice account that
  // fills at the replayed bar's prices, so replay trades never mix with the live paper account.
  const replayPane = () => (app.active?.replay ? app.active : null);
  const freshAccount = () => ({ initial: 100000, cash: 100000, feePct: 0.05, positions: {}, orders: [], history: [] });
  const paper = () => (replayPane() ? (app.state.replayPaper ||= freshAccount()) : livePaper());
  const livePaper = () =>
    (app.state.paper ||= {
      initial: 100000,
      cash: 100000,
      feePct: 0.05,
      positions: {},
      orders: [],
      history: [],
    });
  const price = (s) => {
    const rp = replayPane();
    if (rp && s === rp.cfg.symbol) return rp.bars[rp.replay.index]?.close;
    return rp ? null : app.prices[s];
  };
  function paperSymbols() {
    const p = app.state.paper;
    return p
      ? [...Object.keys(p.positions), ...p.orders.map((o) => o.symbol)]
      : [];
  }
  function fill(sym, side, qty, px, note = "", acct = null) {
    const p = acct || paper();
    const rp = acct ? null : replayPane();
    const signed = side === "buy" ? qty : -qty;
    const pos = p.positions[sym] || { qty: 0, avg: 0 };
    const fee = Math.abs(qty * px) * (p.feePct / 100);
    let realized = 0;
    if (pos.qty !== 0 && Math.sign(pos.qty) !== Math.sign(signed)) {
      const closing =
        Math.sign(signed) * Math.min(Math.abs(signed), Math.abs(pos.qty));
      realized = -closing * (px - pos.avg);
    }
    const nq = pos.qty + signed;
    if (nq === 0) delete p.positions[sym];
    else if (pos.qty === 0 || Math.sign(nq) !== Math.sign(pos.qty))
      p.positions[sym] = { qty: nq, avg: px };
    else if (Math.sign(signed) === Math.sign(pos.qty))
      p.positions[sym] = {
        qty: nq,
        avg: (pos.qty * pos.avg + signed * px) / nq,
      };
    else p.positions[sym] = { qty: nq, avg: pos.avg };
    p.cash -= signed * px + fee;
    p.history.unshift({
      time: rp ? rp.bars[rp.replay.index].time * 1000 : Date.now(),
      symbol: sym,
      side,
      qty,
      price: px,
      fee,
      realized: realized - fee,
      note,
    });
    p.history = p.history.slice(0, 500);
    app.persist();
    app.toast(
      tr("pp.fillToast", "Paper {side} {qty} {sym} at {px}", {
        side: side === "buy" ? tr("pp.sideBuy", "buy") : tr("pp.sideSell", "sell"),
        qty: fmtNum(qty, 4),
        sym: ticker(sym),
        px: fmtPrice(px),
      }),
    );
  }
  function checkOrders(sym, px) {
    const p = app.state.paper;
    if (!p?.orders.length) return;
    let changed = false;
    for (const o of [...p.orders]) {
      if (o.symbol !== sym) continue;
      const hit =
        o.type === "limit"
          ? o.side === "buy"
            ? px <= o.price
            : px >= o.price
          : o.side === "buy"
            ? px >= o.price
            : px <= o.price;
      if (!hit) continue;
      p.orders = p.orders.filter((x) => x !== o && (!o.oco || x.oco !== o.oco));
      fill(
        sym,
        o.side,
        o.qty,
        o.type === "limit" ? o.price : px,
        o.note || `${o.type} order`,
        p,
      );
      changed = true;
    }
    if (changed && bottomTab === "paper") renderPaper();
  }
  app.priceListeners.add((sym, px) => {
    checkOrders(sym, px);
    if (
      bottomTab === "paper" &&
      !bottomEl.classList.contains("collapsed") &&
      app.state.paper?.positions[sym]
    )
      drawPaperNumbers();
  });
  function equity() {
    const p = paper();
    return (
      p.cash +
      Object.entries(p.positions).reduce(
        (a, [s, pos]) => a + pos.qty * (price(s) ?? pos.avg),
        0,
      )
    );
  }
  function drawPaperNumbers() {
    const p = paper();
    const eq = equity();
    const el = $("#ppEq");
    if (el) {
      el.innerHTML = `<div class="stat"><div class="k">${esc(tr("pp.equity", "Equity"))}</div><div class="v">${fmtPrice(eq)}</div></div><div class="stat"><div class="k">${esc(tr("pp.cash", "Cash"))}</div><div class="v">${fmtPrice(p.cash)}</div></div><div class="stat"><div class="k">${esc(tr("pp.totalPnl", "Total P&L"))}</div><div class="v ${eq >= p.initial ? "up" : "down"}">${fmtPrice(eq - p.initial)} (${fmtPct(((eq - p.initial) / p.initial) * 100)})</div></div>`;
    }
    const pos = $("#ppPos");
    if (pos) {
      pos.innerHTML =
        Object.entries(p.positions)
          .map(([s, x]) => {
            const px = price(s) ?? x.avg,
              pnl = x.qty * (px - x.avg);
            return `<tr data-s="${esc(s)}"><td><b>${esc(ticker(s))}</b></td><td>${x.qty > 0 ? "Long" : "Short"}</td><td>${fmtNum(Math.abs(x.qty), 4)}</td><td>${fmtPrice(x.avg)}</td><td>${fmtPrice(px)}</td><td class="${pnl >= 0 ? "up" : "down"}">${fmtPrice(pnl)} (${fmtPct(((px - x.avg) / x.avg) * 100 * Math.sign(x.qty))})</td><td><button class="btn small" data-close="${esc(s)}">${esc(tr("pp.close", "Close"))}</button></td></tr>`;
          })
          .join("") ||
        `<tr><td colspan="7" class="l muted">${esc(tr("pp.noPos", "No open positions."))}</td></tr>`;
    }
  }
  function renderPaper() {
    const p = paper();
    const sym = app.active?.cfg.symbol || "";
    const px = price(sym) ?? app.active?.bars.at(-1)?.close;
    const typeLabel = (t) => ({ market: tr("pp.market", "Market"), limit: tr("pp.limit", "Limit"), stop: tr("pp.stop", "Stop") }[t] || t);
    const sideLabel = (s) => (s === "buy" ? tr("pp.sideBuy", "buy") : tr("pp.sideSell", "sell"));
    bottom.innerHTML = `<div class="tester"><div class="left">
      <h4 style="margin-top:0">${esc(tr("pp.ticket", "Order ticket · {sym}", { sym: ticker(sym) }))} ${px ? `<span class="muted">${fmtPrice(px)}</span>` : ""}</h4>
      <div class="row-flex"><label class="field">${esc(tr("pp.type", "Type"))}<select id="ppType"><option value="market">${esc(tr("pp.market", "Market"))}</option><option value="limit">${esc(tr("pp.limit", "Limit"))}</option><option value="stop">${esc(tr("pp.stop", "Stop"))}</option></select></label><label class="field">${esc(tr("pp.price", "Price"))}<input id="ppPrice" type="number" step="any" value="${px ? Number(px.toPrecision(6)) : ""}" style="width:110px"></label><label class="field">${esc(tr("pp.amt", "Amount ($)"))}<input id="ppAmt" type="number" step="any" value="1000" style="width:100px"></label></div>
      <div class="row-flex" style="margin-top:6px"><label class="field">${esc(tr("pp.sl", "Stop loss % (optional)"))}<input id="ppSl" type="number" step="any" style="width:90px"></label><label class="field">${esc(tr("pp.tp", "Take profit % (optional)"))}<input id="ppTp" type="number" step="any" style="width:90px"></label></div>
      <div class="row-flex" style="margin-top:10px"><button class="btn primary" id="ppBuy" style="background:var(--up);border-color:var(--up)">${esc(tr("pp.buy", "Buy"))}</button><button class="btn primary" id="ppSell" style="background:var(--down);border-color:var(--down)">${esc(tr("pp.sell", "Sell / short"))}</button></div>
      <h4>${esc(tr("pp.account", "Account"))}</h4><div class="row-flex"><label class="field">${esc(tr("pp.initBal", "Starting balance"))}<input id="ppInit" type="number" value="${p.initial}" style="width:110px"></label><label class="field">${esc(tr("pp.fee", "Fee % per trade"))}<input id="ppFee" type="number" step="any" value="${p.feePct}" style="width:80px"></label><button class="btn danger" id="ppReset" style="align-self:end">${esc(tr("pp.reset", "Reset account"))}</button></div>
      <p class="hint-text">${replayPane() ? tr("pp.replayNote", "<b>Replay trading.</b> Orders fill at the replayed bars' prices in a separate practice account. Step or play the replay to fill limit and stop orders. Exit replay to go back to your live paper account.") : esc(tr("pp.liveNote", "Simulated fills at the live price. No real money, no exchange connection."))}</p>
    </div><div class="right"><div class="stats" id="ppEq"></div>
      <h4>${esc(tr("pp.positions", "Positions"))}</h4><table class="t"><thead><tr><th>${esc(tr("sc.colSym", "Symbol"))}</th><th>${esc(tr("ts.side", "Side"))}</th><th>${esc(tr("ptq.qty", "Qty"))}</th><th>${esc(tr("ptq.entry", "Avg price"))}</th><th>${esc(tr("ptq.price", "Last"))}</th><th>${esc(tr("ptq.pnl", "P&L"))}</th><th></th></tr></thead><tbody id="ppPos"></tbody></table>
      <h4>${esc(tr("pp.working", "Working orders"))}</h4><table class="t"><thead><tr><th>${esc(tr("sc.colSym", "Symbol"))}</th><th>${esc(tr("ts.side", "Side"))}</th><th>${esc(tr("pp.type", "Type"))}</th><th>${esc(tr("pp.price", "Price"))}</th><th>${esc(tr("ptq.qty", "Qty"))}</th><th></th></tr></thead><tbody>${p.orders.map((o) => `<tr><td><b>${esc(ticker(o.symbol))}</b></td><td>${esc(sideLabel(o.side))}</td><td>${esc(typeLabel(o.type))}${o.oco ? esc(tr("pp.bracket", " (bracket)")) : ""}</td><td>${fmtPrice(o.price)}</td><td>${fmtNum(o.qty, 4)}</td><td><button class="btn small" data-cancel="${o.id}">${esc(tr("pp.cancel", "Cancel"))}</button></td></tr>`).join("") || `<tr><td colspan="6" class="l muted">${esc(tr("pp.none", "None."))}</td></tr>`}</tbody></table>
      <h4>${esc(tr("pp.history", "History"))}</h4><table class="t"><thead><tr><th>${esc(tr("ptq.time", "Time"))}</th><th>${esc(tr("sc.colSym", "Symbol"))}</th><th>${esc(tr("ts.side", "Side"))}</th><th>${esc(tr("ptq.qty", "Qty"))}</th><th>${esc(tr("pp.price", "Price"))}</th><th>${esc(tr("pp.realized", "Realised"))}</th></tr></thead><tbody>${p.history
        .slice(0, 100)
        .map(
          (h) =>
            `<tr><td>${new Date(h.time).toLocaleString(locale())}</td><td>${esc(ticker(h.symbol))}</td><td>${esc(sideLabel(h.side))}</td><td>${fmtNum(h.qty, 4)}</td><td>${fmtPrice(h.price)}</td><td class="${h.realized >= 0 ? "up" : "down"}">${h.realized ? fmtPrice(h.realized) : ""}</td></tr>`,
        )
        .join("")}</tbody></table>
    </div></div>`;
    drawPaperNumbers();
    const place = async (side) => {
      const type = $("#ppType").value,
        amt = Number($("#ppAmt").value);
      let cur = price(sym) ?? app.active?.bars.at(-1)?.close;
      if (!cur) {
        try {
          cur = (await api.quotes([sym]))[sym]?.price;
        } catch {
          /* none */
        }
      }
      if (!cur || !(amt > 0))
        return app.toast(tr("pp.needPriceAmt", "Need a live price and an amount."), "err");
      const qty = amt / cur;
      const sl = Number($("#ppSl").value),
        tp = Number($("#ppTp").value);
      const entry = type === "market" ? cur : Number($("#ppPrice").value);
      const exitSide = side === "buy" ? "sell" : "buy",
        dir = side === "buy" ? 1 : -1;
      const addBracket = () => {
        const oco = sl > 0 && tp > 0 ? `oco${Date.now()}` : null;
        if (sl > 0)
          paper().orders.push({
            id: `o${Date.now()}s`,
            symbol: sym,
            side: exitSide,
            type: "stop",
            price: entry * (1 - (dir * sl) / 100),
            qty,
            oco,
            note: "stop loss",
          });
        if (tp > 0)
          paper().orders.push({
            id: `o${Date.now()}t`,
            symbol: sym,
            side: exitSide,
            type: "limit",
            price: entry * (1 + (dir * tp) / 100),
            qty,
            oco,
            note: "take profit",
          });
      };
      if (type === "market") {
        fill(sym, side, qty, cur);
        addBracket();
      } else {
        if (!(entry > 0)) return app.toast(tr("pp.setPrice", "Set a price for the order."), "err");
        paper().orders.push({
          id: `o${Date.now()}`,
          symbol: sym,
          side,
          type,
          price: entry,
          qty: amt / entry,
        });
        addBracket();
        app.toast(tr("pp.placed", "{type} {side} order placed.", { type: typeLabel(type), side: sideLabel(side) }));
      }
      app.persist();
      renderPaper();
      refreshQuotes();
    };
    $("#ppBuy").onclick = () => place("buy");
    $("#ppSell").onclick = () => place("sell");
    $("#ppReset").onclick = () => {
      if (
        !confirm(
          tr("pp.resetConfirm", "Reset the paper account? Positions, orders and history are cleared."),
        )
      )
        return;
      app.state[replayPane() ? "replayPaper" : "paper"] = {
        initial: Number($("#ppInit").value) || 100000,
        cash: Number($("#ppInit").value) || 100000,
        feePct: Number($("#ppFee").value) || 0,
        positions: {},
        orders: [],
        history: [],
      };
      app.persist();
      renderPaper();
    };
    $("#ppFee").onchange = (e) => {
      paper().feePct = Number(e.target.value) || 0;
      app.persist();
    };
    bottom.onclick = (e) => {
      const close = e.target.closest("[data-close]")?.dataset.close;
      if (close) {
        const pos = paper().positions[close];
        const px2 = price(close) ?? pos.avg;
        fill(
          close,
          pos.qty > 0 ? "sell" : "buy",
          Math.abs(pos.qty),
          px2,
          "closed",
        );
        paper().orders = paper().orders.filter((o) => o.symbol !== close);
        app.persist();
        renderPaper();
      }
      const cancel = e.target.closest("[data-cancel]")?.dataset.cancel;
      if (cancel) {
        paper().orders = paper().orders.filter((o) => o.id !== cancel);
        app.persist();
        renderPaper();
      }
    };
  }

  // ======================= INDICATOR EDITOR =======================
  const TEMPLATE = `export default {
  name: 'EMA ribbon squeeze',
  overlay: true, // true = drawn on the price chart, false = its own pane
  inputs: [
    { key: 'fast', label: 'Fast EMA', type: 'int', default: 8 },
    { key: 'slow', label: 'Slow EMA', type: 'int', default: 34 },
  ],
  outputs: [
    { key: 'fast', label: 'Fast', kind: 'line', color: '#26a69a' },
    { key: 'slow', label: 'Slow', kind: 'line', color: '#ef5350' },
  ],
  // bars: [{ time, open, high, low, close, volume }], p: your inputs,
  // ta: sma, ema, rma, wma, hma, rsi, atr, stdev, highest, lowest, crossover, crossunder, source, compute(...)
  calc(bars, p, ta) {
    const close = ta.source(bars, 'close');
    const fast = ta.ema(close, p.fast), slow = ta.ema(close, p.slow);
    const up = ta.crossover(fast, slow);
    return {
      fast,
      slow,
      markers: bars.filter((b, i) => up[i]).map((b) => ({ time: b.time, position: 'belowBar', shape: 'arrowUp', color: '#26a69a', text: 'Cross' })),
    };
  },
};
`;
  let edFile = null;
  const edListHtml = (list) =>
    list.map((c) => `<div class="card" data-file="${esc(c.file)}"><div class="top"><span>${esc(c.file)}</span><span class="row-flex"><button class="btn small" data-act="open">${esc(tr("ed.edit", "Edit"))}</button><button class="btn small" data-act="add">${esc(tr("ed.addToChart", "Add to chart"))}</button><button class="btn small danger" data-act="del">${esc(tr("al.delete", "Delete"))}</button></span></div>${c.error ? `<div class="sub down" style="white-space:pre-line">${esc(c.error)}</div>` : ""}</div>`).join("") || `<p class="hint-text">${esc(tr("ed.none", "None yet."))}</p>`;
  async function renderEditor() {
    let list = [];
    try {
      list = await api.get("/api/custom");
    } catch {
      /* none */
    }
    bottom.innerHTML = `<div class="tester"><div class="left"><div class="row-flex"><button class="btn primary" id="edNew">${esc(tr("ed.new", "New indicator"))}</button></div>
      <h4>${esc(tr("ed.yours", "Your indicators"))}</h4><div id="edList">${edListHtml(list)}</div>
      <p class="hint-text">${tr("ed.hint", 'Each indicator is a small JavaScript file in the app\'s <code>custom</code> folder, in the format in <code>docs/custom-indicators.md</code> (start from <code>docs/indicator-template.js</code>). Each one is checked before it\'s saved. You can also ask your AI agent: "add an indicator to Quant Terminal that…" and it will write the file for you.')}</p></div>
      <div class="right"><div class="row-flex"><input class="in" id="edName" placeholder="${esc(tr("ed.namePh", "Indicator name"))}" style="flex:1"><button class="btn" id="edSave">${esc(tr("ed.save", "Save"))}</button><button class="btn primary" id="edSaveAdd">${esc(tr("ed.saveAdd", "Save and add to chart"))}</button></div><textarea class="in" id="edCode" spellcheck="false" style="flex:1;min-height:220px"></textarea><div id="edErr" class="down" style="white-space:pre-line"></div></div></div>`;
    const code = $("#edCode");
    code.value = TEMPLATE;
    $("#edName").value = "EMA ribbon squeeze";
    code.onkeydown = (e) => {
      if (e.key !== "Tab") return;
      e.preventDefault();
      const s = code.selectionStart;
      code.setRangeText("  ", s, code.selectionEnd, "end");
    };
    $("#edNew").onclick = () => {
      edFile = null;
      code.value = TEMPLATE.replace("'EMA ribbon squeeze'", "'My indicator'");
      $("#edName").value = "My indicator";
    };
    const save = async (add) => {
      $("#edErr").textContent = "";
      const name = $("#edName").value.trim() || "indicator";
      let src = code.value;
      try {
        const r = await api.post("/api/custom", { name, code: src });
        const def = await app.importCustom(r.file);
        if (!def)
          throw new Error(
            tr("ed.loadErr", "Saved, but the browser could not load it. Check the code."),
          );
        app.toast(tr("ed.saved", "Saved {file}", { file: r.file }));
        if (add) app.active.addIndicator(def.id);
        else app.panes.forEach((p) => p.render(false));
        edFile = r.file;
        renderEditorList();
      } catch (e) {
        $("#edErr").textContent = e.message;
      }
    };
    $("#edSave").onclick = () => save(false);
    $("#edSaveAdd").onclick = () => save(true);
    $("#edList").onclick = async (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const file = btn.closest("[data-file]").dataset.file;
      if (btn.dataset.act === "open") {
        code.value = await (
          await fetch(`/custom/${encodeURIComponent(file)}?v=${Date.now()}`)
        ).text();
        $("#edName").value = file.replace(/\.js$/, "").replace(/-/g, " ");
        edFile = file;
      }
      if (btn.dataset.act === "add") {
        const def = await app.importCustom(file);
        if (def) app.active.addIndicator(def.id);
      }
      if (btn.dataset.act === "del" && confirm(tr("ed.delConfirm", "Delete {file}?", { file }))) {
        await api.del(`/api/custom/${encodeURIComponent(file)}`);
        renderEditor();
      }
    };
  }
  const renderEditorList = async () => {
    const box = $("#edList");
    if (box) box.innerHTML = edListHtml(await api.get("/api/custom").catch(() => []));
  };

  // Limit and stop orders in the replay account fill when a replayed bar's range reaches them.
  function checkReplayOrders(pane, bar) {
    const p = app.state.replayPaper;
    if (!p?.orders.length) return;
    for (const o of [...p.orders]) {
      if (o.symbol !== pane.cfg.symbol) continue;
      let px = null;
      if (o.type === "limit" && o.side === "buy" && bar.low <= o.price) px = Math.min(o.price, bar.open);
      if (o.type === "limit" && o.side === "sell" && bar.high >= o.price) px = Math.max(o.price, bar.open);
      if (o.type === "stop" && o.side === "buy" && bar.high >= o.price) px = Math.max(o.price, bar.open);
      if (o.type === "stop" && o.side === "sell" && bar.low <= o.price) px = Math.min(o.price, bar.open);
      if (px == null) continue;
      p.orders = p.orders.filter((x) => x !== o && (!o.oco || x.oco !== o.oco));
      fill(o.symbol, o.side, o.qty, px, o.note || `${o.type} order`);
    }
  }
  let paperRenderAt = 0;
  P.onReplayBar = (pane, bar) => {
    if (pane !== app.active || !bar) return;
    checkReplayOrders(pane, bar);
    if (bottomTab === "paper" && !bottomEl.classList.contains("collapsed") && Date.now() - paperRenderAt > 250) { paperRenderAt = Date.now(); renderPaper(); }
  };
  P.onReplayChange = () => {
    if (bottomTab === "paper" && !bottomEl.classList.contains("collapsed")) renderPaper();
  };

  // ---------- hooks for the app ----------
  P.showBottom = showBottom;
  P.openAlertDialog = openAlertDialog;
  let lastSymbol = null;
  P.onActiveChange = () => {
    if (sideTab === "watchlist") drawRows();
    const sym = app.active?.cfg.symbol;
    if (sym !== lastSymbol) {
      lastSymbol = sym;
      if (sideTab === "news") renderNews(side, app);
      if (!bottomEl.classList.contains("collapsed") && bottomTab === "seasonals") renderSeasonals(bottom, app);
      if (!bottomEl.classList.contains("collapsed") && bottomTab === "financials") renderFinancials(bottom, app);
    }
    if (bottomTab === "paper" && !bottomEl.classList.contains("collapsed"))
      renderPaper();
  };
  P.onAlertFired = () => {
    if (sideTab === "alerts") renderAlerts();
  };
  P.onTheme = () => {
    renderBottom();
  };
  P.onLangChange = () => {
    renderSide();
    renderBottom();
  };
  showSide("watchlist");
  return P;
}
