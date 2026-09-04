// Coin economy + exploration tuning. All balancing constants live here.

/** H3 resolution for exploration cells (~9 m edge, ~19 m across, ~307 m² per hex). */
export const HEX_RES = 12

/** How many rings of neighbours around the current cell to reveal per fix. */
export const REVEAL_K = 1

/** Coins for revealing a brand-new cell. */
export const NEW_CELL_COINS = 10

/** Coins for re-entering a known cell after the cooldown. */
export const REVISIT_COINS = 1

/** No revisit reward until a cell has been left alone this long (anti-farming). */
export const REVISIT_COOLDOWN_MS = 6 * 60 * 60 * 1000

/** Ignore fixes less accurate than this (meters) for rewards/exploration. */
export const MAX_ACCURACY_M = 35
