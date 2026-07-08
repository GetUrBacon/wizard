// Ink's Text/backgroundColor color props already fully respect the NO_COLOR
// (https://no-color.org) and FORCE_COLOR conventions on their own — Ink v5
// renders color through its own bundled chalk, which computes its color
// level from process.env once at import time. Nothing here needs to branch
// on `NO_COLOR`/`FORCE_COLOR` manually, whether a value below is a hex code
// or an ANSI color name; doing so would just duplicate (and risk drifting
// from) chalk's own, more nuanced precedence rules. See tests/no-color.test.js
// for the regression test that pins this down.

// Brand chrome only — HeaderBar background, Banner art/strip. Kept as exact
// hex so the brand look doesn't drift with terminal theme/palette overrides.
export const BRAND_GREEN = '#36e85a';
export const CREAM = '#e9d9b8';
export const DARK = '#0a1f0f';

// Everything else uses ANSI color names, so output adapts to the user's
// terminal theme/palette instead of a hardcoded hex value.
export const SUCCESS = 'green';
export const MUTED = 'gray';
export const PRIMARY = 'cyan';
export const WARNING = 'yellow';
export const LINK = 'cyan';
export const ERROR = 'red';
