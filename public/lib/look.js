// Chart appearance from Settings: candle colours, background, grid, borders, wicks, last-price line.
// An empty colour means "follow the theme", so the light/dark switch still works.
export const LOOK_DEFAULTS = {
  up: "",
  down: "",
  bg: "",
  grid: "both",
  borders: false,
  wicks: true,
  priceLine: true,
};

const HEX = /^#[0-9a-f]{6}$/i;
const GRIDS = ["both", "vert", "horz", "none"];

export function chartLook(look = {}, theme = {}) {
  const l = { ...LOOK_DEFAULTS, ...look };
  const colour = (v, fallback) => (HEX.test(v || "") ? v : fallback);
  const grid = GRIDS.includes(l.grid) ? l.grid : "both";
  return {
    up: colour(l.up, theme.up),
    down: colour(l.down, theme.down),
    bg: colour(l.bg, theme.bg),
    vertGrid: grid === "both" || grid === "vert",
    horzGrid: grid === "both" || grid === "horz",
    borders: !!l.borders,
    wicks: l.wicks !== false,
    priceLine: l.priceLine !== false,
  };
}
