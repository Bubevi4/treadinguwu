// News (side tab), Seasonals and Financials (bottom tabs) for the active chart's symbol.
import { api, esc, fmtPct, fmtPrice, ticker, exchange } from "./api.js";
import { seasonals } from "../lib/seasonals.js";
import { tr, locale, getLang } from "./i18n.js";

const LW = window.LightweightCharts;
const css = (n) =>
  getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const ago = (t) => {
  if (!t) return "";
  const m = Math.round((Date.now() - t) / 60000);
  return m < 60
    ? tr("news.mAgo", "{m}m ago", { m })
    : m < 1440
      ? tr("news.hAgo", "{h}h ago", { h: Math.round(m / 60) })
      : new Date(t).toLocaleDateString(locale());
};

// ---------- news ----------
export async function renderNews(el, app) {
  const sym = app.active?.cfg.symbol;
  el.innerHTML = `<div class="pad row-flex"><b>${esc(ticker(sym))}</b><span class="spacer"></span><button class="btn small" data-refresh>${esc(tr("news.refresh", "Refresh"))}</button></div><div class="pad hint-text" data-note>${esc(tr("news.loading", "Loading headlines…"))}</div><div data-list></div>`;
  el.querySelector("[data-refresh]").onclick = () => renderNews(el, app);
  try {
    const r = await api.get(`/api/news?symbol=${encodeURIComponent(sym)}`);
    if (app.active?.cfg.symbol !== sym) return;
    el.querySelector("[data-note]").textContent = r.note;
    el.querySelector("[data-list]").innerHTML = r.items
      .map(
        (n) =>
          `<a class="card news" href="${esc(n.url)}" target="_blank" rel="noopener"><div class="news-title">${esc(n.title)}</div><div class="sub">${esc(n.source || "")}${n.time || n.ago ? ` · ${esc(n.ago || ago(n.time))}` : ""}</div>${n.summary ? `<div class="sub news-sum">${esc(n.summary)}</div>` : ""}</a>`,
      )
      .join("");
  } catch (e) {
    el.querySelector("[data-note]").textContent =
      tr("news.unavail", "Headlines unavailable: {msg}", { msg: e.message });
  }
}

// ---------- seasonals ----------
let seasChart = null;
const PALETTE = [
  "#2962ff",
  "#ff9800",
  "#e91e63",
  "#00bcd4",
  "#8bc34a",
  "#9c27b0",
  "#795548",
  "#607d8b",
  "#cddc39",
  "#3f51b5",
];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_RU = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

export async function renderSeasonals(el, app, opts = {}) {
  const sym = app.active?.cfg.symbol;
  const showYears = opts.years || 6;
  const MONTHS = getLang() === "ru" ? MONTHS_RU : MONTHS_EN;
  el.innerHTML = `<div class="seas"><div class="seas-left"><div class="row-flex pad" style="padding-bottom:4px"><b>${esc(tr("seas.byYear", "{sym} by calendar year", { sym: ticker(sym) }))}</b><label class="field" style="flex-direction:row;align-items:center;gap:6px">${esc(tr("seas.years", "Years"))}<select data-years>${[3, 6, 10, 20].map((n) => `<option ${n === showYears ? "selected" : ""}>${n}</option>`).join("")}</select></label><span class="hint-text" data-note>${esc(tr("seas.loading", "Loading daily history…"))}</span></div><div class="seas-chart" data-chart></div><div class="seas-legend" data-legend></div></div><div class="seas-right" data-table></div></div>`;
  el.querySelector("[data-years]").onchange = (e) =>
    renderSeasonals(el, app, { years: Number(e.target.value) });
  let bars;
  try {
    bars = (await api.candles(sym, "1D", 8000)).candles;
  } catch (e) {
    el.querySelector("[data-note]").textContent = e.message;
    return;
  }
  if (app.active?.cfg.symbol !== sym || !el.isConnected) return;
  const s = seasonals(bars);
  el.querySelector("[data-note]").textContent =
    tr("seas.note", "{n} years of daily bars · average of {c} complete years", {
      n: s.years.length,
      c: s.completeYears,
    });
  seasChart?.remove();
  const box = el.querySelector("[data-chart]");
  const T0 = Date.UTC(2000, 0, 1) / 1000; // a leap year, so 29 February has a slot
  const md = (t) =>
    new Date(t * 1000).toLocaleDateString(locale(), {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  seasChart = LW.createChart(box, {
    autoSize: true,
    layout: {
      background: { type: "solid", color: css("--bg") },
      textColor: css("--text"),
      fontSize: 10,
    },
    grid: {
      vertLines: { color: css("--grid") },
      horzLines: { color: css("--grid") },
    },
    rightPriceScale: { borderColor: css("--border") },
    timeScale: {
      borderColor: css("--border"),
      tickMarkFormatter: (t) => md(t),
    },
    localization: {
      locale: locale(),
      timeFormatter: (t) => md(t),
      priceFormatter: (p) => `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`,
    },
  });
  const recent = s.years.slice(-showYears);
  const legend = [];
  recent.forEach((y, k) => {
    const current = y.year === new Date().getUTCFullYear();
    const color = current ? css("--text") : PALETTE[k % PALETTE.length];
    const line = seasChart.addSeries(LW.LineSeries, {
      color,
      lineWidth: current ? 3 : 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    const seen = new Set();
    line.setData(
      y.points
        .filter((p) => !seen.has(p.doy) && seen.add(p.doy))
        .map((p) => ({ time: T0 + (p.doy - 1) * 86400, value: p.pct })),
    );
    legend.push(
      `<span><i style="background:${color}"></i>${y.year} <b class="${(y.total ?? 0) >= 0 ? "up" : "down"}">${fmtPct(y.total)}</b></span>`,
    );
  });
  if (s.average.length) {
    const avg = seasChart.addSeries(LW.LineSeries, {
      color: "#9598a1",
      lineWidth: 2,
      lineStyle: LW.LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    avg.setData(
      s.average.map((p) => ({ time: T0 + (p.doy - 1) * 86400, value: p.pct })),
    );
    legend.push(
      `<span><i style="background:#9598a1"></i>${esc(tr("seas.avgN", "Average of {c} years", { c: s.completeYears }))}</span>`,
    );
  }
  seasChart.timeScale().fitContent();
  el.querySelector("[data-legend]").innerHTML = legend.join("");
  const cell = (v) => {
    if (v == null) return '<td class="muted">·</td>';
    const a = Math.min(1, Math.abs(v) / 15);
    const bg =
      v >= 0
        ? `rgba(8,153,129,${0.12 + a * 0.55})`
        : `rgba(242,54,69,${0.12 + a * 0.55})`;
    return `<td style="background:${bg}">${v >= 0 ? "+" : ""}${v.toFixed(1)}</td>`;
  };
  el.querySelector("[data-table]").innerHTML =
    `<table class="t seas-table"><thead><tr><th>${esc(tr("seas.year", "Year"))}</th>${MONTHS.map((m) => `<th>${m}</th>`).join("")}<th>${esc(tr("seas.year", "Year"))}</th></tr></thead><tbody>
    ${[...s.monthly]
      .reverse()
      .map(
        (r) =>
          `<tr><td class="l"><b>${r.year}</b></td>${r.months.map(cell).join("")}${cell(r.total)}</tr>`,
      )
      .join("")}
    <tr class="seas-sum"><td class="l">${esc(tr("seas.average", "Average"))}</td>${s.monthAvg.map((m) => cell(m?.avg ?? null)).join("")}<td></td></tr>
    <tr class="seas-sum"><td class="l">${esc(tr("seas.pctUp", "% of years up"))}</td>${s.monthAvg.map((m) => `<td>${m ? `${Math.round(m.upPct)}%` : "·"}</td>`).join("")}<td></td></tr>
  </tbody></table><p class="hint-text pad">${esc(tr("seas.foot", "Monthly moves in %. Past seasonality doesn't make next year's move."))}</p>`;
}

// ---------- financials ----------
export async function renderFinancials(el, app, opts = {}) {
  const sym = app.active?.cfg.symbol;
  const freq = opts.freq || "annual",
    tab = opts.tab || "income";
  const crypto = ["BINANCE", "COINBASE", "KRAKEN", "BYBIT", "BLOFIN"].includes(exchange(sym));
  if (exchange(sym) !== "US" && !crypto) {
    el.innerHTML = `<div class="pad hint-text">${esc(tr("fin.notSupported", "Financials are for US-listed stocks and crypto. Open a stock (AAPL, NVDA, JPM…) for its income statement, balance sheet, cash flow and key stats, or a coin (BTCUSDT, SOLUSDT…) for its market cap, supply and all-time high."))}</div>`;
    return;
  }
  el.innerHTML = `<div class="pad hint-text">${esc(tr("fin.loading", "Loading financials…"))}</div>`;
  let f;
  try {
    f = await api.get(
      `/api/financials?symbol=${encodeURIComponent(sym)}&frequency=${freq}`,
    );
  } catch (e) {
    el.innerHTML = `<div class="pad hint-text">${esc(e.message)}</div>`;
    return;
  }
  if (app.active?.cfg.symbol !== sym || !el.isConnected) return;
  if (f.kind === "crypto") {
    el.innerHTML = `<div class="pad">
      <h4 style="margin-top:0">${esc(tr("fin.keyStats", "{sym} key stats", { sym: f.coin }))}</h4>
      <div class="fin-stats">${f.stats.map((x) => `<div><span class="muted">${esc(x.label)}</span><b>${esc(x.value)}</b></div>`).join("")}</div>
      <p class="hint-text">${esc(f.note)} ${esc(tr("fin.source", "Source: {src}.", { src: f.source }))}</p>
    </div>`;
    return;
  }
  const tables = {
    income: [tr("fin.income", "Income statement"), f.income],
    balance: [tr("fin.balance", "Balance sheet"), f.balance],
    cashflow: [tr("fin.cashflow", "Cash flow"), f.cashflow],
    ratios: [tr("fin.ratios", "Ratios"), f.ratios],
  };
  const t = tables[tab][1];
  // revenue and net income bars, oldest first
  const find = (re) => f.income?.rows.find((r) => re.test(r.label));
  const rev = find(/^total revenue/i),
    ni = find(/^net income$/i) || find(/net income/i);
  const toNum = (v) => {
    const str = String(v ?? "").trim(),
      n = parseFloat(str.replace(/[$,()]/g, ""));
    return Number.isFinite(n) ? (str.startsWith("(") ? -Math.abs(n) : n) : null;
  };
  let bars = "";
  if (rev && f.income) {
    const periods = f.income.periods
      .map((p, k) => ({
        p,
        r: toNum(rev.values[k]),
        n: ni ? toNum(ni.values[k]) : null,
      }))
      .reverse();
    const max = Math.max(...periods.map((x) => Math.abs(x.r || 0)), 1);
    const money = (v) => (v == null ? "—" : `$${(v / 1e6).toFixed(1)}B`);
    bars = `<div class="fin-bars">${periods.map((x) => `<div class="fin-col"><div class="fin-stack"><div class="fin-bar rev" style="height:${(Math.abs(x.r || 0) / max) * 100}%" title="${esc(tr("fin.rev", "Revenue"))} ${money(x.r)}"></div><div class="fin-bar ni ${x.n < 0 ? "neg" : ""}" style="height:${(Math.abs(x.n || 0) / max) * 100}%" title="${esc(tr("fin.ni", "Net income"))} ${money(x.n)}"></div></div><div class="sub">${esc(x.p)}</div><div class="sub">${money(x.r)} · ${money(x.n)}</div></div>`).join("")}</div><div class="hint-text">${esc(tr("fin.barsLegend", "Blue: revenue. Green: net income."))}</div>`;
  }
  el.innerHTML = `<div class="tester"><div class="left">
      <h4 style="margin-top:0">${esc(tr("fin.keyStats", "{sym} key stats", { sym: ticker(sym) }))}</h4>
      <div class="fin-stats">${f.stats.map((x) => `<div><span class="muted">${esc(x.label)}</span><b>${esc(x.value)}</b></div>`).join("")}</div>
      ${f.nextEarnings ? `<p class="hint-text">${esc(f.nextEarnings)}</p>` : ""}
      ${bars}
    </div><div class="right">
      <div class="row-flex">${Object.entries(tables)
        .map(
          ([k, [label, tb]]) =>
            `<button class="btn small ${k === tab ? "primary" : ""}" data-tab="${k}" ${tb ? "" : "disabled"}>${esc(label)}</button>`,
        )
        .join(
          "",
        )}<span class="spacer"></span><select class="in" data-freq><option value="annual">${esc(tr("fin.annual", "Annual"))}</option><option value="quarterly">${esc(tr("fin.quarterly", "Quarterly"))}</option></select></div>
      ${t ? `<table class="t"><thead><tr><th class="l"></th>${t.periods.map((p) => `<th>${esc(p)}</th>`).join("")}</tr></thead><tbody>${t.rows.map((r) => `<tr><td class="l">${esc(r.label)}</td>${r.values.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table>` : `<p class="hint-text">${esc(tr("fin.notAvail", "Not available for this company."))}</p>`}
      <p class="hint-text">${esc(f.note)} ${esc(tr("fin.source", "Source: {src}.", { src: f.source || "Nasdaq" }))}</p>
    </div></div>`;
  el.querySelector("[data-freq]").value = freq;
  el.querySelector("[data-freq]").onchange = (e) =>
    renderFinancials(el, app, { freq: e.target.value, tab });
  el.querySelectorAll("[data-tab]").forEach(
    (b) =>
      (b.onclick = () =>
        renderFinancials(el, app, { freq, tab: b.dataset.tab })),
  );
}
