// Provider fallbacks with a fake network: no live calls. Each case is a real bug found by
// blocking hosts: Binance blocked made "BTCUSDT" resolve to a US stock, and a firewall that
// silently drops Binance cost a full timeout on every chart.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

process.env.QT_TIMEOUT_MS = "300";
const btc = JSON.parse(
  readFileSync(new URL("./fixtures/btc-1d.json", import.meta.url), "utf8"),
);
let mode = {}; // host -> 'drop' | 'dns' | status code
const calls = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  calls.push(u.host);
  const m = mode[u.host] ?? mode["*"];
  if (m === "drop") {
    // A real dropped connection holds a socket open. The fake one has nothing keeping the event
    // loop alive, and Node before 24 unrefs AbortSignal.timeout, so hold a timer until the abort.
    const keepAlive = setTimeout(() => {}, 10000);
    return new Promise((_, rej) =>
      opts.signal?.addEventListener("abort", () => {
        clearTimeout(keepAlive);
        rej(opts.signal.reason);
      }),
    );
  }
  if (m === "dns")
    throw new TypeError("fetch failed", { cause: { code: "ENOTFOUND" } });
  if (m) return new Response("blocked", { status: m });
  if (u.host === "api.exchange.coinbase.com") {
    const end = Date.parse(u.searchParams.get("end")) / 1000;
    const rows = btc
      .filter((b) => b.time < end)
      .slice(-300)
      .reverse()
      .map((b) => [b.time, b.low, b.high, b.open, b.close, b.volume]);
    return Response.json(rows);
  }
  return new Response("not mocked", { status: 404 });
};
const P = await import("../lib/providers.js");

test("with Binance blocked, crypto still resolves as crypto and loads from Coinbase", async () => {
  mode = {
    "api.binance.com": 451,
    "data-api.binance.vision": 451,
    "api.binance.us": 451,
  };
  for (const s of ["BTCUSDT", "btc", "ETH-USD", "SOL/USDT"])
    assert.equal((await P.resolve(s)).exchange, "BINANCE", s);
  assert.equal((await P.resolve("AAPL")).exchange, "US");
  const r = await P.getCandles("BTCUSDT", "1D", 100);
  assert.equal(r.provider, "Coinbase");
  assert.equal(r.candles.length, 100);
});

test("a silently dropped host costs one timeout, then is skipped", async () => {
  mode = {
    "api.binance.com": "drop",
    "data-api.binance.vision": "drop",
    "api.binance.us": "drop",
  };
  let t = Date.now();
  const a = await P.getCandles("BINANCE:ETHUSDT", "1D", 50);
  assert.equal(a.provider, "Coinbase");
  assert.ok(
    Date.now() - t < 1500,
    `first fallback took ${Date.now() - t} ms (three hosts should time out together)`,
  );
  t = Date.now();
  calls.length = 0;
  const b = await P.getCandles("BINANCE:SOLUSDT", "1D", 50);
  assert.equal(b.provider, "Coinbase");
  assert.ok(Date.now() - t < 200, "second chart skips the dead hosts");
  assert.ok(
    !calls.some((h) => h.includes("binance")),
    "no new Binance calls while it is marked down",
  );
});

test("network failures are upstream errors (the server answers 502)", async () => {
  mode = { "*": "dns" };
  await assert.rejects(P.economicCalendar(), (e) => e.upstream === true);
});

test("the chart note for a fallback is plain words: no hostnames or HTTP codes", async () => {
  // A Skool member saw "Using Kraken (Yahoo: query1.finance.yahoo.com returned HTTP 429)" on a chart and had to ask what it meant.
  mode = { "api.binance.com": 451, "data-api.binance.vision": 451, "api.binance.us": 451 };
  const r = await P.getCandles("BTCUSDT", "1D", 100);
  const text = r.notes.join(" ");
  assert.match(text, /Binance isn't answering right now, so this chart uses Coinbase\./);
  assert.doesNotMatch(text, /HTTP|\.com|returned/);
});

test("Kraken pairs are keyed by the names everyone else uses (BTC, DOGE), valued by Kraken's own", async () => {
  const { krakenPairMap } = await import("../lib/providers.js");
  const m = krakenPairMap({
    XXBTZUSD: { altname: "XBTUSD", wsname: "XBT/USD", status: "online" },
    XDGUSD: { altname: "XDGUSD", wsname: "XDG/USD", status: "online" },
    SOLUSD: { altname: "SOLUSD", wsname: "SOL/USD", status: "online" },
    OLDUSD: { altname: "OLDUSD", wsname: "OLD/USD", status: "delisted" },
  });
  assert.equal(m.get("BTCUSD"), "XBTUSD");
  assert.equal(m.get("DOGEUSD"), "XDGUSD");
  assert.equal(m.get("SOLUSD"), "SOLUSD");
  assert.equal(m.has("OLDUSD"), false);
});

test("XAUUSD charts gold, and falls back to PAXG when Yahoo is down", async () => {
  mode = { "query1.finance.yahoo.com": 429, "query2.finance.yahoo.com": 429 };
  for (const s of ["XAUUSD", "xau/usd", "FX:XAUUSD"])
    assert.equal((await P.resolve(s)).id, "FX:XAUUSD", s);
  assert.equal((await P.resolve("XAGUSD")).id, "FX:XAGUSD");
  assert.equal((await P.resolve("GOLD")).exchange, "US", "Barrick's ticker stays a stock");
  for (const s of ["^FTSE", "YAHOO:^FTSE"])
    assert.equal((await P.resolve(s)).id, "YAHOO:^FTSE", s);
  calls.length = 0;
  const r = await P.getCandles("XAUUSD", "1D", 50).catch((e) => e);
  assert.ok(
    calls.some((h) => h.includes("binance") || h.includes("coinbase")),
    "gold tries the PAXG token feeds after Yahoo",
  );
  if (!(r instanceof Error)) assert.ok(r.notes.some((n) => n.includes("PAXG")));
});

test("Bybit and BloFin perpetuals: BYBIT:BTCUSDT.P and BLOFIN:BTCUSDT.P chart that exchange's own feed", async () => {
  // A YouTube comment: "Bybit perpetual are not an option, or BloFin perpetual?"
  for (const [typed, id] of [
    ["BYBIT:BTCUSDT.P", "BYBIT:BTCUSDT.P"],
    ["bybit:eth.p", "BYBIT:ETHUSDT.P"],
    ["BLOFIN:SOLUSDT.P", "BLOFIN:SOLUSDT.P"],
    ["blofin:btcperp", "BLOFIN:BTCUSDT.P"],
  ])
    assert.equal((await P.resolve(typed)).id, id, typed);
  assert.equal(P.kindOf("BLOFIN:BTCUSDT.P"), "crypto");
  const kline = (b) => [b.time * 1000, String(b.open), String(b.high), String(b.low), String(b.close), "1", String(b.volume)];
  const hosts = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const u = new URL(url);
    hosts.push(u.host);
    if (u.host === "api.bybit.com") {
      assert.equal(u.searchParams.get("symbol"), "ETHUSDT");
      return Response.json({ retCode: 0, result: { list: btc.slice(-60).reverse().map((b) => kline(b).filter((_, i) => i !== 5)) } });
    }
    if (u.host === "openapi.blofin.com") {
      assert.equal(u.searchParams.get("instId"), "SOL-USDT");
      const after = Number(u.searchParams.get("after")) || Infinity;
      const older = btc.filter((b) => b.time * 1000 < after);
      return Response.json({ code: "0", msg: "success", data: older.slice(-Number(u.searchParams.get("limit"))).reverse().map(kline) });
    }
    return realFetch(url, opts);
  };
  try {
    const y = await P.getCandles("BYBIT:ETHUSDT.P", "1D", 50);
    assert.equal(y.provider, "Bybit");
    assert.equal(y.candles.length, 50);
    const b = await P.getCandles("BLOFIN:SOLUSDT.P", "1D", 50);
    assert.equal(b.provider, "BloFin");
    assert.equal(b.candles.length, 50);
    assert.deepEqual(b.candles.at(-1), btc.at(-1));
    assert.ok(!hosts.includes("fapi.binance.com"), "an exchange prefix never falls back to Binance");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("crypto perpetual futures: BTCUSDT.P charts Binance futures, then Bybit where Binance futures is blocked", async () => {
  // A YouTube comment: "only spot trading is available in the list, and futures are not there".
  for (const [typed, id] of [
    ["BTCUSDT.P", "BINANCE:BTCUSDT.P"],
    ["btc.p", "BINANCE:BTCUSDT.P"],
    ["ETHPERP", "BINANCE:ETHUSDT.P"],
    ["BINANCE:SOLUSDT.P", "BINANCE:SOLUSDT.P"],
  ])
    assert.equal((await P.resolve(typed)).id, id, typed);
  const kline = (b) => [b.time * 1000, String(b.open), String(b.high), String(b.low), String(b.close), String(b.volume)];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const u = new URL(url);
    if (u.host === "fapi.binance.com" && mode["fapi.binance.com"] !== 451) {
      assert.equal(u.searchParams.get("symbol"), "BTCUSDT");
      return Response.json(btc.slice(-Number(u.searchParams.get("limit"))).map(kline));
    }
    if (u.host === "api.bybit.com") {
      assert.equal(u.searchParams.get("category"), "linear");
      return Response.json({ retCode: 0, result: { list: btc.slice(-60).reverse().map(kline) } });
    }
    return realFetch(url, opts);
  };
  try {
    mode = {};
    const a = await P.getCandles("BTCUSDT.P", "1D", 50);
    assert.equal(a.provider, "Binance futures");
    assert.equal(a.candles.length, 50);
    mode = { "fapi.binance.com": 451 };
    const b = await P.getCandles("BINANCE:BTCUSDT.P", "1W", 5);
    assert.equal(b.provider, "Bybit");
    assert.match(b.notes.join(" "), /Binance futures isn't answering right now, so this chart uses Bybit\./);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("Deriv synthetic indices resolve to DERIV and page back 2,000 candles at a time", async () => {
  const sent = [];
  globalThis.WebSocket = class {
    constructor(url) { this.url = url; setTimeout(() => this.onopen?.(), 0); }
    send(raw) {
      const m = JSON.parse(raw);
      sent.push(m);
      let reply;
      if (m.active_symbols) reply = { active_symbols: [{ underlying_symbol: "stpRNG", underlying_symbol_name: "Step Index 100", market: "synthetic_index" }, { underlying_symbol: "R_75", underlying_symbol_name: "Volatility 75 Index", market: "synthetic_index" }] };
      else {
        const last = m.end === "latest" ? 3600 * 10000 : Number(m.end) + 1 - 3600;
        reply = { candles: Array.from({ length: m.count }, (_, i) => { const epoch = last - (m.count - 1 - i) * 3600; return { epoch, open: 1, high: 2, low: 0.5, close: 1.5 }; }) };
      }
      setTimeout(() => this.onmessage?.({ data: JSON.stringify(reply) }), 0);
    }
    close() {}
  };
  for (const s of ["R_75", "1hz100v", "BOOM1000", "deriv:stpRNG"])
    assert.equal((await P.resolve(s)).exchange, "DERIV", s);
  const r = await P.getCandles("STPRNG", "1h", 4500);
  assert.equal(r.provider, "Deriv");
  assert.equal(r.candles.length, 4500);
  assert.ok(r.candles.every((c, i) => !i || c.time - r.candles[i - 1].time === 3600), "pages join without gaps or repeats");
  const pages = sent.filter((m) => m.ticks_history);
  assert.deepEqual(pages.map((m) => m.count), [2000, 2000, 500]);
  assert.equal(pages[0].ticks_history, "stpRNG", "Deriv's own mixed-case name is sent");
  const hits = await P.search("vol 75");
  assert.equal(hits[0].symbol, "DERIV:R_75");
  delete globalThis.WebSocket;
});

test("India screener reads Yahoo spark quotes for the NSE list (asked for twice on YouTube, Nov 2026)", async () => {
  assert.ok(P.NSE_TICKERS.length >= 100);
  assert.ok(P.NSE_TICKERS.some((r) => r.ticker === "RELIANCE" && r.sector === "Energy"));
  const rows = P.parseSpark({
    spark: {
      result: [
        { symbol: "INFY.NS", response: [{ meta: { regularMarketPrice: 1130, regularMarketChangePercent: 2.41, regularMarketVolume: 14495556, longName: "Infosys Limited" } }] },
        { symbol: "GONE.NS", response: [{ meta: {} }] },
      ],
    },
  });
  assert.deepEqual(rows, [{ yahoo: "INFY.NS", name: "Infosys Limited", price: 1130, changePct: 2.41, volume: 14495556 }]);
});

test("M&M.NS is a symbol (Indian tickers can contain &), but & stays out of other tickers", async () => {
  assert.equal((await P.resolve("YAHOO:M&M.NS")).id, "YAHOO:M&M.NS");
  await assert.rejects(P.resolve("US:A&B"));
});

test("Yahoo's forming intraday bar keeps its bar's open time, so live updates land on it", () => {
  // Yahoo stamps the last 1m bar with the latest trade time (seen 25 Nov 2026: ...371, ...392),
  // so every poll looked like a new candle and the chart only caught up on refresh.
  const start = 1795617000; // 9:30 ET
  const j = {
    chart: {
      result: [
        {
          meta: { currentTradingPeriod: { regular: { start } } },
          timestamp: [start, start + 60, start + 131],
          indicators: { quote: [{ open: [1, 2, 3], high: [1, 2, 3], low: [1, 2, 3], close: [1, 2, 3], volume: [1, 1, 1] }] },
        },
      ],
    },
  };
  assert.deepEqual(P.parseYahoo(j, "1m").map((b) => b.time), [start, start + 60, start + 120]);
  const hourly = { chart: { result: [{ ...j.chart.result[0], timestamp: [start, start + 3600, start + 4000] }] } };
  const h = P.parseYahoo(hourly, "1h");
  assert.deepEqual(h.map((b) => [b.time, b.close]), [[start, 1], [start + 3600, 3]]);
});
