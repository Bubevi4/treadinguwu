// Watchlist ordering, kept free of the DOM so it can be tested in Node.

// Move `sym` from list `from` to list `to`, placed before `beforeSym` (or at the end when it's
// missing). Moving onto a list that already has the symbol just reorders it there.
export function moveSymbol(lists, from, sym, to, beforeSym) {
  if (!lists[from] || !lists[to] || sym === beforeSym) return false;
  lists[from] = lists[from].filter((s) => s !== sym);
  const dest = lists[to].filter((s) => s !== sym);
  const at = dest.indexOf(beforeSym);
  dest.splice(at < 0 ? dest.length : at, 0, sym);
  lists[to] = dest;
  return true;
}

// The lists on screen: one, or every list in order when "All lists" is picked.
export function shownLists(lists, active, showAll) {
  const names = Object.keys(lists);
  return showAll ? names : names.includes(active) ? [active] : names.slice(0, 1);
}
