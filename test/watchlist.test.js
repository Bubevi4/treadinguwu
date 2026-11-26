import { test } from "node:test";
import assert from "node:assert/strict";
import { moveSymbol, shownLists } from "../public/js/watchlist.js";

const fresh = () => ({ Main: ["A", "B", "C", "D"], Crypto: ["X", "Y"] });

test("dragging a symbol reorders it within its list", () => {
  const l = fresh();
  assert.equal(moveSymbol(l, "Main", "D", "Main", "A"), true);
  assert.deepEqual(l.Main, ["D", "A", "B", "C"]);
  moveSymbol(l, "Main", "D", "Main", undefined); // dropped at the end
  assert.deepEqual(l.Main, ["A", "B", "C", "D"]);
  moveSymbol(l, "Main", "A", "Main", "C");
  assert.deepEqual(l.Main, ["B", "A", "C", "D"]);
});

test("dragging onto another list moves it there without duplicating", () => {
  const l = fresh();
  moveSymbol(l, "Main", "B", "Crypto", "Y");
  assert.deepEqual(l.Main, ["A", "C", "D"]);
  assert.deepEqual(l.Crypto, ["X", "B", "Y"]);
  const d = { Main: ["A", "B"], Other: ["B", "Z"] };
  moveSymbol(d, "Main", "B", "Other", undefined);
  assert.deepEqual(d, { Main: ["A"], Other: ["Z", "B"] });
});

test("dropping on itself or an unknown list changes nothing", () => {
  const l = fresh();
  assert.equal(moveSymbol(l, "Main", "B", "Main", "B"), false);
  assert.equal(moveSymbol(l, "Main", "B", "Nope", undefined), false);
  assert.deepEqual(l, fresh());
});

test("All lists shows every list in order; otherwise just the active one", () => {
  const l = fresh();
  assert.deepEqual(shownLists(l, "Crypto", true), ["Main", "Crypto"]);
  assert.deepEqual(shownLists(l, "Crypto", false), ["Crypto"]);
  assert.deepEqual(shownLists(l, "Gone", false), ["Main"]);
});
