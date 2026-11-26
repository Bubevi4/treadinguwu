import { api, download, esc, ticker, exchange } from "./api.js";
import { ChartPane, CHART_TYPES, newUid } from "./chart.js";
import { TOOLS } from "./drawings.js";
import {
  INDICATORS,
  BY_ID,
  registerIndicator,
  compute,
} from "../lib/indicators.js";
import { parseTf, toCsv, MAX_BARS } from "../lib/series.js";
import { LOOK_DEFAULTS } from "../lib/look.js";
import { initPanels } from "./panels.js";
import { tr, trGroup, setLang, getLangSetting, applyDomI18n } from "./i18n.js";

const $ = (s, el = document) => el.querySelector(s);
const TF_QUICK = ["1m", "5m", "15m", "1h", "4h", "1D", "1W"];
const LAYOUTS = { 1: 1, "2v": 2, "2h": 2, 3: 3, 4: 4, 6: 6, 8: 8, 16: 16 };
const DEFAULT_WATCHLISTS = {
  Main: [
    "BINANCE:BTCUSDT",
    "BINANCE:ETHUSDT",
    "BINANCE:SOLUSDT",
    "US:AAPL",
    "US:NVDA",
    "US:SPY",
    "US:QQQ",
    "FX:EURUSD",
  ],
};

class App {
  constructor() {
    this.panes = [];
    this.active = null;
    this.tool = "cursor";
    this.prices = {};
    this.priceListeners = new Set();
    this.saveTimer = null;
  }

  async init() {
    let state = {};
    try {
      state = await api.get("/api/state");
    } catch {
      /* first run */
    }
    this.state = {
      layout: "1",
      panes: [
        {
          symbol: "BINANCE:BTCUSDT",
          tf: "1D",
          type: "candles",
          indicators: [
            { uid: newUid(), id: "ema", params: { length: 21 } },
            { uid: newUid(), id: "rsi", params: {} },
          ],
        },
      ],
      watchlists: DEFAULT_WATCHLISTS,
      activeWatchlist: "Main",
      drawings: {},
      settings: {},
      paper: null,
      strategies: {},
      ...state,
    };
    this.settings = {
      theme: "dark",
      lang: "auto",
      volume: true,
      bars: 3000,
      utc: false,
      stayInDrawMode: false,
      syncCrosshair: false,
      ...this.state.settings,
    };
    this.state.settings = this.settings;
    setLang(this.settings.lang);
    applyDomI18n();
    document.documentElement.dataset.theme = this.settings.theme;
    await this.loadCustomIndicators();
    this.buildToolbar();
    this.buildDrawbar();
    this.setLayout(this.state.layout, false);
    this.panels = initPanels(this);
    this.bindKeys();
    this.listenAlerts();
    this.checkHealth();
    setInterval(() => this.checkHealth(), 60000);
    setTimeout(() => this.checkUpdateStatus(true), 5000);
    setInterval(() => this.checkUpdateStatus(true), 600000);
  }

  // ---------- persistence ----------
  persist() {
    this.state.panes = this.panes.map((p) => p.cfg);
    this.state.active = this.panes.indexOf(this.active);
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(
      () =>
        api
          .put("/api/state", this.state)
          .catch((e) => this.toast(tr("app.saveErr", "Couldn't save: {msg}", { msg: e.message }), "err")),
      400,
    );
  }
  getDrawings(symbol) {
    return structuredClone(this.state.drawings[symbol] || []);
  }
  saveDrawings(symbol, items) {
    this.state.drawings[symbol] = items.map(
      ({ id, type, points, text, color, rr }) => ({
        id,
        type,
        points,
        text,
        color,
        rr,
      }),
    );
    for (const p of this.panes)
      if (p.cfg.symbol === symbol && p.drawings.items !== items)
        p.drawings.setItems(this.getDrawings(symbol));
    this.persist();
  }

  // ---------- custom indicators ----------
  async loadCustomIndicators() {
    try {
      const list = await api.get("/api/custom");
      for (const c of list) await this.importCustom(c.file, c.mtime);
    } catch {
      /* none */
    }
  }
  async importCustom(file, v = Date.now()) {
    try {
      const mod = await import(`/custom/${encodeURIComponent(file)}?v=${v}`);
      return registerIndicator({
        ...mod.default,
        id: `custom:${file.replace(/\.js$/, "")}`,
      });
    } catch (e) {
      this.toast(
        tr("app.customLoadErr", "Custom indicator {file} failed to load: {msg}", {
          file,
          msg: e.message,
        }),
        "err",
      );
      return null;
    }
  }

  // ---------- layout ----------
  setLayout(layout, save = true) {
    const count = LAYOUTS[layout] || 1;
    this.state.layout = String(layout);
    const grid = $("#grid");
    grid.dataset.count = count;
    const cols = {
      1: "1fr",
      2: layout === "2h" ? "1fr" : "1fr 1fr",
      3: "2fr 1fr",
      4: "1fr 1fr",
      6: "1fr 1fr 1fr",
      8: "1fr 1fr 1fr 1fr",
      16: "repeat(4, 1fr)",
    }[count];
    const rows = {
      1: "1fr",
      2: layout === "2h" ? "1fr 1fr" : "1fr",
      3: "1fr 1fr",
      4: "1fr 1fr",
      6: "1fr 1fr",
      8: "1fr 1fr",
      16: "repeat(4, 1fr)",
    }[count];
    grid.style.gridTemplateColumns = cols;
    grid.style.gridTemplateRows = rows;
    const cfgs = this.panes.length
      ? this.panes.map((p) => p.cfg)
      : this.state.panes;
    while (this.panes.length > count) this.panes.pop().destroy();
    const tfs = ["1D", "4h", "1h", "15m", "1W", "5m", "30m", "2h"];
    for (let i = 0; i < count; i++) {
      if (this.panes[i]) continue;
      const el = document.createElement("div");
      el.className = "pane";
      grid.appendChild(el);
      const base = cfgs[i] || {
        ...structuredClone(cfgs[0] || {}),
        tf: tfs[i % tfs.length],
        indicators: [],
      };
      const pane = new ChartPane(this, el, base);
      this.panes.push(pane);
      pane.load();
    }
    [...grid.children].forEach((el) => {
      if (!this.panes.some((p) => p.el === el)) el.remove();
    });
    if (count === 3) this.panes[0].el.style.gridRow = "span 2";
    else if (this.panes[0]) this.panes[0].el.style.gridRow = "";
    this.setActive(
      this.panes[Math.min(this.state.active ?? 0, count - 1)] || this.panes[0],
    );
    $("#layoutSel").value = this.state.layout;
    if (save) this.persist();
  }

  setActive(pane) {
    if (!pane || this.active === pane) return;
    this.active?.el.classList.remove("active");
    this.active = pane;
    pane.el.classList.add("active");
    this.syncToolbar();
    this.panels?.onActiveChange?.();
  }

  onPaneLoaded(pane) {
    if (pane === this.active) {
      this.syncToolbar();
      this.panels?.onActiveChange?.();
    }
  }

  // ---------- toolbar ----------
  buildToolbar() {
    const tfBox = $("#tfButtons");
    tfBox.innerHTML = TF_QUICK.map(
      (t) => `<button data-tf="${t}">${t}</button>`,
    ).join("");
    tfBox.onclick = (e) => {
      const tf = e.target.dataset.tf;
      if (tf) this.setTf(tf);
    };
    $("#tfCustom").onkeydown = (e) => {
      if (e.key !== "Enter") return;
      const v = e.target.value
        .trim()
        .replace(/^(\d+)d$/i, "$1D")
        .replace(/^(\d+)w$/i, "$1W");
      try {
        parseTf(v);
        this.setTf(v);
        e.target.value = "";
        e.target.blur();
      } catch (err) {
        this.toast(err.message, "err");
      }
    };
    $("#chartType").innerHTML = CHART_TYPES.map(
      ([v, l]) => `<option value="${v}">${esc(tr(`ctype.${v}`, l))}</option>`,
    ).join("");
    $("#chartType").onchange = (e) => {
      this.active.cfg.type = e.target.value;
      this.active.render(true);
      this.persist();
    };
    $("#symbolBtn").onclick = () => this.openSymbolSearch();
    $("#indicatorsBtn").onclick = () => this.openIndicatorPicker();
    $("#compareBtn").onclick = () =>
      this.openSymbolSearch(
        "",
        (sym) => {
          this.active.cfg.compare.push(sym);
          this.persist();
          this.active.load({ keepView: true });
        },
        tr("app.compareWith", "Compare with…"),
      );
    $("#layoutSel").onchange = (e) => this.setLayout(e.target.value);
    $("#syncSymbol").checked = !!this.settings.syncSymbol;
    $("#syncSymbol").onchange = (e) => {
      this.settings.syncSymbol = e.target.checked;
      this.persist();
    };
    $("#replayBtn").onclick = () => {
      if (this.active.replay) return this.active.stopReplay();
      this.setTool("replay-pick");
      this.toast(tr("app.replayClick", "Click the bar you want replay to start from."));
    };
    $("#alertBtn").onclick = () => this.panels.openAlertDialog();
    $("#logBtn").onclick = () => {
      this.active.cfg.log = !this.active.cfg.log;
      this.active.render(false);
      this.syncToolbar();
      this.persist();
    };
    $("#snapBtn").onclick = () =>
      this.active
        .screenshot()
        .toBlob((b) =>
          download(
            `${ticker(this.active.cfg.symbol)}-${this.active.cfg.tf}.png`,
            b,
          ),
        );
    $("#csvBtn").onclick = () => this.exportCsv();
    $("#themeBtn").onclick = () => {
      this.settings.theme = this.settings.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = this.settings.theme;
      this.panes.forEach((p) => p.applyTheme());
      this.panels.onTheme?.();
      this.persist();
    };
    $("#settingsBtn").onclick = () => this.openSettings();
  }

  syncToolbar() {
    const p = this.active;
    if (!p) return;
    $("#symbolLabel").textContent = ticker(p.cfg.symbol);
    $("#symbolBtn").title = tr("app.symbolHintTitle", "{sym} — change symbol (or just start typing)", { sym: p.cfg.symbol });
    document
      .querySelectorAll("#tfButtons button")
      .forEach((b) => b.classList.toggle("active", b.dataset.tf === p.cfg.tf));
    $("#tfCustom").placeholder = TF_QUICK.includes(p.cfg.tf) ? "7m" : p.cfg.tf;
    $("#tfCustom").classList.toggle("on", !TF_QUICK.includes(p.cfg.tf));
    $("#chartType").value = p.cfg.type;
    $("#logBtn").classList.toggle("on", !!p.cfg.log);
    $("#replayBtn").classList.toggle("on", !!p.replay);
  }

  setTf(tf) {
    this.active.cfg.tf = tf;
    this.active.load();
    this.syncToolbar();
    this.persist();
  }

  setSymbol(sym, pane = this.active) {
    const targets = this.settings.syncSymbol ? this.panes : [pane];
    for (const p of targets) {
      p.cfg.symbol = sym;
      p.cfg.compare = p.cfg.compare.filter((s) => s !== sym);
      p.load();
    }
    this.syncToolbar();
    this.persist();
  }

  buildDrawbar() {
    const bar = $("#drawbar");
    bar.innerHTML =
      TOOLS.map(
        (t, i) =>
          `${i === 1 ? "<hr>" : ""}<button data-tool="${t.id}" title="${esc(tr(`tool.${t.id}`, t.label))}"><svg viewBox="0 0 24 24">${t.icon}</svg></button>`,
      ).join("") +
      `<hr><button data-act="alert" title="${esc(tr("draw.alert", "Alert when price crosses the selected line"))}"><svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20h4"/></svg></button>` +
      `<button data-act="delete" title="${esc(tr("draw.delete", "Delete selected drawing (Delete key)"))}"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>` +
      `<button data-act="clear" title="${esc(tr("draw.clear", "Remove all drawings on this symbol"))}"><svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19"/></svg></button>`;
    bar.onclick = (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.tool)
        this.setTool(this.tool === b.dataset.tool ? "cursor" : b.dataset.tool);
      if (b.dataset.act === "alert") this.alertOnSelectedDrawing();
      if (b.dataset.act === "delete" && !this.active.deleteSelectedDrawing())
        this.toast(tr("draw.selectFirst", "Click a drawing first to select it."));
      if (
        b.dataset.act === "clear" &&
        confirm(tr("draw.clearConfirm", "Remove every drawing on {sym}?", { sym: ticker(this.active.cfg.symbol) }))
      )
        this.active.clearDrawings();
    };
    this.setTool("cursor");
  }

  setTool(tool) {
    this.tool = tool;
    document
      .querySelectorAll("#drawbar [data-tool]")
      .forEach((b) => b.classList.toggle("active", b.dataset.tool === tool));
    for (const p of this.panes) p.setInteractive(tool === "cursor");
    document.body.style.cursor = tool === "cursor" ? "" : "crosshair";
  }

  // ---------- modals ----------
  modal(title, bodyHtml, { foot = "", wide = false } = {}) {
    const card = $("#modalCard");
    card.style.width = wide ? "min(780px, 96vw)" : "";
    card.innerHTML = `<div class="modal-head"><span>${esc(title)}</span><button data-close title="${esc(tr("app.close", "Close"))}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div><div class="modal-body">${bodyHtml}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ""}`;
    $("#modal").classList.remove("hidden");
    card.querySelector("[data-close]").onclick = () => this.closeModal();
    $("#modal").onmousedown = (e) => {
      if (e.target.id === "modal") this.closeModal();
    };
    return card;
  }
  closeModal() {
    $("#modal").classList.add("hidden");
    $("#modalCard").innerHTML = "";
  }

  openSymbolSearch(initial = "", onPick = null, title = tr("app.symbolSearch", "Symbol search")) {
    const card = this.modal(
      title,
      `<input class="search-in" id="symQ" placeholder="${esc(tr("app.symbolPlaceholder", "BTC, AAPL, EURUSD, ^FTSE, VOD.L…"))}" autocomplete="off" value="${esc(initial)}"><div class="list" id="symList"></div><div class="hint-text" style="margin-top:8px">${esc(tr("app.symbolHelp", "Crypto: Binance (falls back to Coinbase and Kraken). US stocks and ETFs: Nasdaq. Forex: Kraken. Global indices, futures and non-US stocks use Yahoo symbols (YAHOO:^FTSE, YAHOO:GC=F) when Yahoo is reachable."))}</div>`,
    );
    const q = card.querySelector("#symQ"),
      list = card.querySelector("#symList");
    let sel = 0,
      results = [],
      timer;
    const pick = (sym) => {
      this.closeModal();
      if (onPick) onPick(sym);
      else this.setSymbol(sym);
    };
    const draw = () => {
      list.innerHTML =
        results
          .map(
            (r, i) =>
              `<div class="item ${i === sel ? "sel" : ""}" data-i="${i}"><span><b>${esc(ticker(r.symbol))}</b> <span class="muted">${esc(r.name || "")}</span></span><span class="meta">${esc(r.type || "")} · ${esc(r.exchange || "")}</span></div>`,
          )
          .join("") ||
        (q.value.trim()
          ? `<div class="item" data-raw="1"><span>${esc(tr("app.openRaw", "Open"))} <b>${esc(q.value.trim().toUpperCase())}</b></span><span class="meta">${esc(tr("app.pressEnter", "press Enter"))}</span></div>`
          : "");
    };
    const run = async () => {
      const v = q.value.trim();
      if (!v) {
        results = [];
        draw();
        return;
      }
      try {
        results = await api.search(v);
      } catch {
        results = [];
      }
      if (q.value.trim() === v) {
        sel = 0;
        draw();
      }
    };
    q.oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(run, 180);
    };
    q.onkeydown = (e) => {
      if (e.key === "ArrowDown") {
        sel = Math.min(sel + 1, results.length - 1);
        draw();
        e.preventDefault();
      }
      if (e.key === "ArrowUp") {
        sel = Math.max(sel - 1, 0);
        draw();
        e.preventDefault();
      }
      if (e.key === "Enter") pick(results[sel]?.symbol || q.value.trim());
    };
    list.onclick = (e) => {
      const it = e.target.closest(".item");
      if (!it) return;
      pick(
        it.dataset.raw ? q.value.trim() : results[Number(it.dataset.i)].symbol,
      );
    };
    q.focus();
    q.setSelectionRange(q.value.length, q.value.length);
    if (initial) run();
  }

  openIndicatorPicker() {
    const card = this.modal(
      tr("tb.indicators", "Indicators"),
      `<input class="search-in" id="indQ" placeholder="${esc(tr("app.indSearchPlaceholder", "Search {n} indicators…", { n: INDICATORS.length }))}" autocomplete="off"><div class="list" id="indList"></div>`,
      {
        foot: `<span class="hint-text" style="margin-right:auto">${esc(tr("app.indFoot", "No limit per chart. Write your own in the Indicator editor tab."))}</span><button class="btn" data-new>${esc(tr("app.indNewBtn", "New custom indicator"))}</button>`,
      },
    );
    const q = card.querySelector("#indQ"),
      list = card.querySelector("#indList");
    const draw = () => {
      const term = q.value.trim().toLowerCase();
      const groups = {};
      for (const d of INDICATORS) {
        const gLabel = trGroup(d.group || "Other");
        if (
          term &&
          !`${d.name} ${d.id} ${d.group} ${gLabel}`.toLowerCase().includes(term)
        )
          continue;
        (groups[d.group || "Other"] ||= []).push(d);
      }
      list.innerHTML = Object.entries(groups)
        .sort(([g1], [g2]) => (g2 === "Quant (bonus)") - (g1 === "Quant (bonus)"))
        .map(
          ([g, ds]) =>
            `<div class="group ${g === "Quant (bonus)" ? "gold-text" : ""}">${esc(trGroup(g))}</div>${ds.map((d) => `<div class="item" data-id="${esc(d.id)}"><span>${esc(d.name)}</span><span class="meta">${esc(d.overlay ? tr("app.indOverlay", "on price") : tr("app.indOwnPane", "own pane"))}</span></div>`).join("")}`,
        )
        .join("");
    };
    q.oninput = draw;
    list.onclick = (e) => {
      const it = e.target.closest("[data-id]");
      if (!it) return;
      const uid = this.active.addIndicator(it.dataset.id);
      const anchor = (BY_ID[it.dataset.id].inputs || []).find((i) => i.type === "time");
      if (anchor) {
        this.closeModal();
        this.pickAnchor(this.active, uid, anchor.key);
      } else this.toast(tr("app.indAdded", "Added {name}", { name: BY_ID[it.dataset.id].name }));
    };
    card.querySelector("[data-new]").onclick = () => {
      this.closeModal();
      this.panels.showBottom("editor");
    };
    draw();
    q.focus();
  }

  /** Wait for a click on the chart and anchor indicator `uid` there (Anchored VWAP). Escape keeps the current anchor. */
  pickAnchor(pane, uid, key) {
    this.pendingAnchor = { pane, uid, key };
    this.setTool("anchor-pick");
    this.toast(tr("app.pickAnchor", "Click the bar to anchor it to."));
  }

  openIndicatorSettings(pane, ind) {
    const def = BY_ID[ind.id];
    const fields = (def.inputs || [])
      .map((i) => {
        const v = ind.params?.[i.key] ?? i.default;
        if (i.type === "source") {
          // Indicators on indicators: any output of another indicator on this chart can be the source.
          const others = pane.cfg.indicators
            .filter((x) => x.uid !== ind.uid && !String(x.params?.source || "").includes(ind.uid) && BY_ID[x.id]?.outputs.length)
            .flatMap((x) => BY_ID[x.id].outputs.map((o) => [`ind:${x.uid}:${o.key}`, `${(/\(([^)]+)\)$/.exec(BY_ID[x.id].name)?.[1].split(" / ")[0] || BY_ID[x.id].name)} ${pane.indicatorParamsLabel(x)}: ${o.label}`]));
          const price = ["close", "open", "high", "low", "hl2", "hlc3", "ohlc4", "hlcc4"].map((s) => `<option ${s === v ? "selected" : ""}>${s}</option>`).join("");
          const inds = others.map(([val, label]) => `<option value="${esc(val)}" ${val === v ? "selected" : ""}>${esc(label)}</option>`).join("");
          return `<label class="field">${esc(i.label)}<select data-k="${i.key}"><optgroup label="${esc(tr("app.priceGroup", "Price"))}">${price}</optgroup>${inds ? `<optgroup label="${esc(tr("app.otherIndGroup", "Another indicator"))}">${inds}</optgroup>` : ""}</select></label>`;
        }
        if (i.type === "select")
          return `<label class="field">${esc(i.label)}<select data-k="${i.key}">${i.options.map((s) => `<option ${s === v ? "selected" : ""}>${s}</option>`).join("")}</select></label>`;
        if (i.type === "time") {
          const local = v ? new Date((v - new Date(v * 1000).getTimezoneOffset() * 60) * 1000).toISOString().slice(0, 16) : "";
          return `<label class="field">${esc(i.label)}<input data-k="${i.key}" data-type="time" type="datetime-local" value="${local}"><button class="btn small" type="button" data-pick="${i.key}">${esc(tr("app.pickOnChart", "Pick on chart"))}</button></label>`;
        }
        return `<label class="field">${esc(i.label)}<input data-k="${i.key}" data-type="${i.type}" type="number" step="${i.type === "int" ? 1 : "any"}" value="${v}"></label>`;
      })
      .join("");
    const colors = def.outputs
      .map(
        (o) =>
          `<label class="field">${esc(o.label)}<input data-c="${o.key}" type="color" value="${(ind.colors?.[o.key] || o.color).slice(0, 7)}"></label>`,
      )
      .join("");
    const card = this.modal(
      def.name,
      `<div class="form-grid">${fields || `<span class="hint-text">${esc(tr("app.noInputs", "No inputs."))}</span>`}<label class="field">${esc(tr("app.timeframe", "Timeframe"))}<select data-tf>${["", "5m", "15m", "1h", "4h", "1D", "1W", "1M"].map((t) => `<option value="${t}" ${(ind.tf || "") === t ? "selected" : ""}>${esc(t || tr("app.sameAsChart", "Same as chart ({tf})", { tf: pane.cfg.tf }))}</option>`).join("")}</select></label></div><p class="hint-text">${esc(tr("app.mtfHint", "A higher timeframe shows its value once each of its bars has closed, so history never peeks ahead."))}</p>${colors ? `<h4>${esc(tr("app.colours", "Colours"))}</h4><div class="form-grid">${colors}</div>` : ""}`,
      {
        foot: `<button class="btn" data-reset>${esc(tr("app.defaults", "Defaults"))}</button><button class="btn primary" data-ok>${esc(tr("app.apply", "Apply"))}</button>`,
      },
    );
    card.querySelector("[data-ok]").onclick = () => {
      ind.params = {};
      card.querySelectorAll("[data-k]").forEach((el) => {
        ind.params[el.dataset.k] =
          el.dataset.type === "time"
            ? el.value
              ? Math.floor(new Date(el.value).getTime() / 1000)
              : 0
            : el.dataset.type
              ? Number(el.value)
              : el.value;
      });
      ind.colors = {};
      card.querySelectorAll("[data-c]").forEach((el) => {
        ind.colors[el.dataset.c] = el.value;
      });
      ind.tf = card.querySelector("[data-tf]").value || undefined;
      this.closeModal();
      pane.render(false);
      this.persist();
    };
    card.querySelectorAll("[data-pick]").forEach((b) => {
      b.onclick = () => {
        this.closeModal();
        this.pickAnchor(pane, ind.uid, b.dataset.pick);
      };
    });
    card.querySelector("[data-reset]").onclick = () => {
      ind.params = {};
      ind.colors = {};
      this.closeModal();
      pane.render(false);
      this.persist();
    };
  }

  openSettings() {
    const s = this.settings;
    const look = { ...LOOK_DEFAULTS, ...s.look };
    const curLang = s.lang || getLangSetting() || "auto";
    const card = this.modal(
      tr("app.settings", "Settings"),
      `<div class="form-grid">
      <label class="field">${esc(tr("app.language", "Language"))}<select id="sLang"><option value="auto" ${curLang === "auto" ? "selected" : ""}>${esc(tr("app.langAuto", "Auto (RU region → Russian)"))}</option><option value="ru" ${curLang === "ru" ? "selected" : ""}>${esc(tr("app.langRu", "Russian"))}</option><option value="en" ${curLang === "en" ? "selected" : ""}>${esc(tr("app.langEn", "English"))}</option></select></label>
      <label class="field">${esc(tr("app.barsPerChart", "Bars to load per chart"))}<input id="sBars" type="number" min="200" max="${MAX_BARS}" step="100" value="${s.bars}"></label>
      <label class="field">${esc(tr("app.timeAxis", "Time axis"))}<select id="sUtc"><option value="0" ${!s.utc ? "selected" : ""}>${esc(tr("app.localTime", "My local time"))}</option><option value="1" ${s.utc ? "selected" : ""}>${esc(tr("app.utc", "UTC"))}</option></select></label>
      <label class="field">${esc(tr("app.volumeOnChart", "Volume on the price chart"))}<select id="sVol"><option value="1" ${s.volume ? "selected" : ""}>${esc(tr("app.show", "Show"))}</option><option value="0" ${!s.volume ? "selected" : ""}>${esc(tr("app.hide", "Hide"))}</option></select></label>
      <label class="field">${esc(tr("app.afterDraw", "After placing a drawing"))}<select id="sStay"><option value="0" ${!s.stayInDrawMode ? "selected" : ""}>${esc(tr("app.backToCursor", "Back to cursor"))}</option><option value="1" ${s.stayInDrawMode ? "selected" : ""}>${esc(tr("app.keepTool", "Keep the tool"))}</option></select></label>
      <label class="field">${esc(tr("app.crosshair", "Crosshair across charts"))}<select id="sSync"><option value="0" ${!s.syncCrosshair ? "selected" : ""}>${esc(tr("app.independent", "Independent"))}</option><option value="1" ${s.syncCrosshair ? "selected" : ""}>${esc(tr("app.synced", "Synced"))}</option></select></label>
    </div><h4>${esc(tr("app.chartLook", "Chart look"))}</h4><div class="form-grid">
      <label class="field">${esc(tr("app.upCandles", "Up candles"))}<input id="lUp" type="color" value="${look.up || "#089981"}"></label>
      <label class="field">${esc(tr("app.downCandles", "Down candles"))}<input id="lDown" type="color" value="${look.down || "#f23645"}"></label>
      <label class="field">${esc(tr("app.bg", "Background"))}<select id="lBgOn"><option value="0" ${!look.bg ? "selected" : ""}>${esc(tr("app.followTheme", "Follow the theme"))}</option><option value="1" ${look.bg ? "selected" : ""}>${esc(tr("app.myColour", "My colour"))}</option></select></label>
      <label class="field">${esc(tr("app.bgColour", "Background colour"))}<input id="lBg" type="color" value="${look.bg || "#131722"}"></label>
      <label class="field">${esc(tr("app.gridLines", "Grid lines"))}<select id="lGrid">${[["both", tr("app.gridBoth", "Both")], ["vert", tr("app.gridVert", "Vertical only")], ["horz", tr("app.gridHorz", "Horizontal only")], ["none", tr("app.gridNone", "None")]].map(([v, t]) => `<option value="${v}" ${look.grid === v ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>
      <label class="field">${esc(tr("app.candleBorders", "Candle borders"))}<select id="lBorders"><option value="0" ${!look.borders ? "selected" : ""}>${esc(tr("app.hide", "Hide"))}</option><option value="1" ${look.borders ? "selected" : ""}>${esc(tr("app.show", "Show"))}</option></select></label>
      <label class="field">${esc(tr("app.wicks", "Wicks"))}<select id="lWicks"><option value="1" ${look.wicks ? "selected" : ""}>${esc(tr("app.show", "Show"))}</option><option value="0" ${!look.wicks ? "selected" : ""}>${esc(tr("app.hide", "Hide"))}</option></select></label>
      <label class="field">${esc(tr("app.lastPriceLine", "Last price line"))}<select id="lLine"><option value="1" ${look.priceLine ? "selected" : ""}>${esc(tr("app.show", "Show"))}</option><option value="0" ${!look.priceLine ? "selected" : ""}>${esc(tr("app.hide", "Hide"))}</option></select></label>
    </div><h4>${esc(tr("app.updates", "Updates"))}</h4><div class="form-grid">
      <div class="field">${esc(tr("app.updateVersion", "Version"))}<div id="uVer" class="hint-text" style="margin:0">…</div></div>
      <div class="field">${esc(tr("app.updateLastCheck", "Last check"))}<div id="uLast" class="hint-text" style="margin:0">…</div></div>
    </div><div style="display:flex;align-items:center;gap:10px;margin:8px 0">
      <button class="btn" type="button" id="uCheckBtn">${esc(tr("app.updateCheckNow", "Check for updates"))}</button>
      <span id="uMsg" class="hint-text" style="margin:0"></span>
    </div><p class="hint-text">${tr("app.dataFolderHint", "Everything you save lives in the <code>data</code> folder next to the app, on your machine.")}</p>`,
      { foot: `<button class="btn" data-reset>${esc(tr("app.defaultLook", "Default look"))}</button><button class="btn primary" data-ok>${esc(tr("app.save", "Save"))}</button>` },
    );
    const renderUpdateInfo = (st) => {
      const ver = card.querySelector("#uVer");
      const last = card.querySelector("#uLast");
      const msg = card.querySelector("#uMsg");
      if (!ver || !last || !msg) return;
      const sha = st.currentSha ? ` (${st.currentSha.slice(0, 7)})` : "";
      ver.textContent = `${st.version || "1.0.0"}${sha}`;
      last.textContent = st.lastCheck
        ? new Date(st.lastCheck).toLocaleString()
        : tr("app.updateNever", "never");
      if (st.pendingRestart) {
        msg.textContent = tr("app.updateDownloaded", "Update downloaded. Restart the app to apply.");
      } else if (st.lastError || st.error) {
        msg.textContent = tr("app.updateErr", "Update error: {msg}", { msg: st.lastError || st.error });
      } else if (st.upToDate) {
        msg.textContent = tr("app.updateUpToDate", "You are on the latest version.");
      }
    };
    api.get("/api/updates/status").then(renderUpdateInfo).catch(() => {});
    card.querySelector("#uCheckBtn").onclick = async () => {
      const btn = card.querySelector("#uCheckBtn");
      const msg = card.querySelector("#uMsg");
      btn.disabled = true;
      msg.textContent = tr("app.updateChecking", "Checking...");
      try {
        const res = await api.post("/api/updates/check", {});
        renderUpdateInfo(res);
        if (res.updated) this.updateNotified = true;
      } catch (e) {
        msg.textContent = tr("app.updateErr", "Update error: {msg}", { msg: e.message });
      } finally {
        btn.disabled = false;
      }
    };
    card.querySelector("[data-reset]").onclick = () => {
      delete s.look;
      this.closeModal();
      this.persist();
      this.panes.forEach((p) => { p.applyTheme(); p.load({ keepView: true }); });
    };
    card.querySelector("[data-ok]").onclick = () => {
      const lookChanged = (v, def) => (v.toLowerCase() === def ? "" : v);
      const nextLang = $("#sLang").value;
      const langChanged = nextLang !== (s.lang || "auto");
      s.look = {
        up: lookChanged($("#lUp").value, "#089981"),
        down: lookChanged($("#lDown").value, "#f23645"),
        bg: $("#lBgOn").value === "1" ? $("#lBg").value : "",
        grid: $("#lGrid").value,
        borders: $("#lBorders").value === "1",
        wicks: $("#lWicks").value === "1",
        priceLine: $("#lLine").value === "1",
      };
      Object.assign(s, {
        lang: nextLang,
        bars: Math.max(200, Math.min(MAX_BARS, Number($("#sBars").value) || 3000)),
        utc: $("#sUtc").value === "1",
        volume: $("#sVol").value === "1",
        stayInDrawMode: $("#sStay").value === "1",
        syncCrosshair: $("#sSync").value === "1",
      });
      if (langChanged) {
        setLang(s.lang);
        applyDomI18n();
        this.buildToolbar();
        this.syncToolbar();
        this.buildDrawbar();
        this.panels?.onLangChange?.();
        this.checkHealth();
      }
      this.closeModal();
      this.persist();
      this.panes.forEach((p) => { p.applyTheme(); p.load({ keepView: true }); });
    };
  }

  syncCrosshair(src, p) {
    const utc = src.timeOfLogical(p.logical);
    for (const pane of this.panes) {
      if (pane === src || !pane.shown.length) continue;
      const l = pane.logicalOf(utc);
      const i = Math.max(0, Math.min(pane.shown.length - 1, Math.round(l)));
      const b = pane.shown[i];
      if (b) pane.chart.setCrosshairPosition(b.close, pane.times[i], pane.main);
    }
  }

  exportCsv() {
    const p = this.active;
    const extra = {};
    for (const ind of p.cfg.indicators) {
      const def = BY_ID[ind.id];
      const res = p.indResults[ind.uid] || {};
      for (const o of def?.outputs || [])
        if (Array.isArray(res[o.key])) extra[`${ind.id}_${o.key}`] = res[o.key];
    }
    const f = {
      time: "unix+iso",
      pattern: "YYYY-MM-DD HH:mm:ss",
      utc: true,
      delimiter: ",",
      decimals: null,
      decimalComma: false,
      header: true,
      off: [],
      ...this.settings.csv,
    };
    const cols = ["open", "high", "low", "close", "volume", ...Object.keys(extra)];
    const opt = (v, label, cur) =>
      `<option value="${esc(v)}" ${String(cur) === v ? "selected" : ""}>${esc(label)}</option>`;
    const card = this.modal(
      tr("app.exportCsv", "Export chart data (CSV)"),
      `<div class="form-grid">
      <label class="field">${esc(tr("app.csvTime", "Time"))}<select id="cTime">${opt("unix+iso", tr("app.csvUnixIso", "Unix seconds and ISO"), f.time)}${opt("unix", tr("app.csvUnix", "Unix seconds"), f.time)}${opt("unixms", tr("app.csvUnixMs", "Unix milliseconds"), f.time)}${opt("iso", "ISO (2026-11-24T14:30:00Z)", f.time)}${opt("custom", tr("app.csvCustom", "My own pattern"), f.time)}</select></label>
      <label class="field">${esc(tr("app.csvPattern", "Pattern"))}<input id="cPat" value="${esc(f.pattern)}" placeholder="DD/MM/YYYY HH:mm"></label>
      <label class="field">${esc(tr("app.csvTz", "Pattern time zone"))}<select id="cUtc">${opt("1", tr("app.utc", "UTC"), f.utc ? "1" : "0")}${opt("0", tr("app.localTime", "My local time"), f.utc ? "1" : "0")}</select></label>
      <label class="field">${esc(tr("app.csvSep", "Separator"))}<select id="cDelim">${opt(",", tr("app.csvComma", "Comma ,"), f.delimiter)}${opt(";", tr("app.csvSemi", "Semicolon ;"), f.delimiter)}${opt("\t", tr("app.csvTab", "Tab"), f.delimiter)}${opt("|", tr("app.csvPipe", "Pipe |"), f.delimiter)}</select></label>
      <label class="field">${esc(tr("app.csvDecimals", "Decimals"))}<input id="cDec" type="number" min="0" max="12" value="${f.decimals ?? ""}" placeholder="${esc(tr("app.csvAsIs", "As is"))}"></label>
      <label class="field">${esc(tr("app.csvDecMark", "Decimal mark"))}<select id="cComma">${opt("0", tr("app.csvPoint", "Point 1234.5"), f.decimalComma ? "1" : "0")}${opt("1", tr("app.csvDecComma", "Comma 1234,5"), f.decimalComma ? "1" : "0")}</select></label>
      <label class="field">${esc(tr("app.csvHeader", "Header row"))}<select id="cHead">${opt("1", tr("app.yes", "Yes"), f.header ? "1" : "0")}${opt("0", tr("app.no", "No"), f.header ? "1" : "0")}</select></label>
    </div><h4>${esc(tr("app.columns", "Columns"))}</h4><div class="row-flex" style="flex-wrap:wrap;gap:6px 16px">${cols.map((k) => `<label class="hint-text"><input type="checkbox" data-col="${esc(k)}" ${f.off.includes(k) ? "" : "checked"}> ${esc(k)}</label>`).join("")}</div>
    <p class="hint-text">${esc(tr("app.csvHint", "Pattern tokens: YYYY YY MM DD HH mm ss. Put the separator inside the pattern (YYYY.MM.DD,HH:mm) to get separate date and time columns, the way MetaTrader writes them. Your choices are remembered."))}</p>`,
      { foot: `<button class="btn" data-reset>${esc(tr("app.defaults", "Defaults"))}</button><button class="btn primary" data-ok>${esc(tr("app.download", "Download"))}</button>` },
    );
    card.querySelector("[data-reset]").onclick = () => {
      delete this.settings.csv;
      this.persist();
      this.closeModal();
      this.exportCsv();
    };
    card.querySelector("[data-ok]").onclick = () => {
      const dec = $("#cDec").value;
      const off = [...card.querySelectorAll("[data-col]")].filter((el) => !el.checked).map((el) => el.dataset.col);
      this.settings.csv = {
        time: $("#cTime").value,
        pattern: $("#cPat").value || "YYYY-MM-DD HH:mm:ss",
        utc: $("#cUtc").value === "1",
        delimiter: $("#cDelim").value,
        decimals: dec === "" ? null : Math.max(0, Math.min(12, Number(dec))),
        decimalComma: $("#cComma").value === "1",
        header: $("#cHead").value === "1",
        off,
      };
      this.persist();
      const ext = this.settings.csv.delimiter === "\t" ? "tsv" : "csv";
      download(
        `${ticker(p.cfg.symbol)}-${p.cfg.tf}.${ext}`,
        toCsv(p.shown, extra, { ...this.settings.csv, columns: cols.filter((k) => !off.includes(k)) }),
      );
      this.closeModal();
    };
  }

  // ---------- keys ----------
  bindKeys() {
    document.addEventListener("keydown", (e) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(
        document.activeElement?.tagName,
      );
      if (e.key === "Escape") {
        if (!$("#modal").classList.contains("hidden")) return this.closeModal();
        if (this.tool !== "cursor") return this.setTool("cursor");
        if (this.active?.drawings.selected) {
          this.active.drawings.selected = null;
          this.active.drawings.update();
        }
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        this.active?.deleteSelectedDrawing()
      ) {
        e.preventDefault();
        return;
      }
      if (!$("#modal").classList.contains("hidden")) return;
      if (/^[a-z0-9^]$/i.test(e.key)) {
        e.preventDefault();
        this.openSymbolSearch(e.key.toUpperCase());
      }
    });
  }

  // A drawn line as an alert condition: trend lines and rays are checked at the line's price on
  // each bar, on the server, so they fire with this tab closed.
  lineOperandFor(d) {
    const [a, b] = d.points;
    const line = (extend, label) => ({ kind: "line", label, line: { t1: a.time, p1: a.price, t2: b.time, p2: b.price, extend } });
    switch (d.type) {
      case "hline": return { kind: "value", v: Number(a.price.toPrecision(8)) };
      case "hray": return { kind: "line", label: tr("app.lineHray", "Horizontal ray"), line: { t1: a.time, p1: a.price, t2: a.time + 1, p2: a.price, extend: "right" } };
      case "trend": return line("none", tr("app.lineTrend", "Trend line (between its two points)"));
      case "ray": return line("right", tr("app.lineRay", "Ray"));
      case "extended": return line("both", tr("app.lineExt", "Extended line"));
      case "channel": return line("none", tr("app.lineChan", "Channel's first line"));
      default: return null;
    }
  }

  alertOnSelectedDrawing() {
    const d = this.active?.drawings.selected;
    if (!d) return this.toast(tr("app.selectLineFirst", "Click a line on the chart first to select it."));
    const right = this.lineOperandFor(d);
    if (!right) return this.toast(tr("app.alertLineTypes", "Alerts work on trend lines, rays, extended and horizontal lines."));
    this.panels.openAlertDialog({ rules: [{ left: { kind: "price", field: "close" }, op: "crosses", right }] });
  }

  // ---------- replay across charts ----------
  syncReplayFrom(pane, bar) {
    if (!bar) return;
    const end = bar.time + parseTf(pane.cfg.tf).seconds;
    for (const p of this.panes) if (p !== pane && p.bars.length && !(p.replay && !p.replay.follower)) p.replayTo(end);
  }
  onReplayStart(pane) {
    if (this.settings.syncReplay && !pane.replay?.follower) this.syncReplayFrom(pane, pane.bars[pane.replay.index]);
    this.syncToolbar();
    this.panels?.onReplayChange?.();
  }
  onReplayBar(pane, bar) {
    if (this.settings.syncReplay && !pane.replay?.follower) this.syncReplayFrom(pane, bar);
    this.panels?.onReplayBar?.(pane, bar);
  }
  onReplayStop(pane) {
    for (const p of this.panes) if (p !== pane && p.replay?.follower) p.stopReplay();
    this.syncToolbar();
    this.panels?.onReplayChange?.();
  }

  // ---------- prices, alerts, status ----------
  onPrice(symbol, price) {
    this.prices[symbol] = price;
    for (const fn of this.priceListeners) fn(symbol, price);
  }

  listenAlerts() {
    const es = new EventSource("/api/events");
    es.addEventListener("alert", (m) => {
      const e = JSON.parse(m.data);
      this.toast(`<b>${esc(tr("app.alertBanner", "Alert"))}</b><br>${esc(e.text)}`, "alert", 12000);
      this.beep();
      if ("Notification" in window && Notification.permission === "granted")
        new Notification(tr("app.alertNotifTitle", "Quant Terminal alert"), { body: e.text });
      this.panels?.onAlertFired?.(e);
    });
  }

  beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(),
        g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = 880;
      g.gain.value = 0.08;
      o.start();
      o.stop(ctx.currentTime + 0.25);
    } catch {
      /* no audio */
    }
  }

  async checkUpdateStatus(notify = false) {
    try {
      const st = await api.get("/api/updates/status");
      if (st.pendingRestart && notify && !this.updateNotified) {
        this.updateNotified = true;
        this.toast(
          tr("app.updatePendingToast", "Update downloaded. Restart the app to apply it."),
          "ok",
          10000,
        );
      }
    } catch {
      /* ignore */
    }
  }

  async checkHealth() {
    try {
      const h = await api.get("/api/health");
      const failing = Object.entries(h.providers || {})
        .filter(([, v]) => !v.ok)
        .map(([k]) => k);
      this.setStatus(
        failing.length ? "warn" : "ok",
        failing.length
          ? tr("app.healthWarn", "Some sources are failing ({list}); fallbacks are in use.", { list: failing.join(", ") })
          : tr("app.healthOk", "All data sources responding"),
      );
    } catch {
      this.setStatus(
        "bad",
        tr("app.healthBad", "The local server is not responding. Is it still running?"),
      );
    }
  }
  setStatus(level, title) {
    const el = $("#status");
    el.className = `status ${level}`;
    if (title) el.title = title;
  }

  toast(html, kind = "", ms = 3500) {
    const el = document.createElement("div");
    el.className = `toast ${kind}`;
    el.innerHTML = html;
    $("#toasts").appendChild(el);
    setTimeout(() => el.remove(), ms);
  }
}

const app = new App();
window.app = app;
app.init().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="toast err" style="position:fixed;left:20px;bottom:20px">${esc(tr("app.startupErr", "Startup failed: {msg}", { msg: e.message }))}</div>`,
  );
});
