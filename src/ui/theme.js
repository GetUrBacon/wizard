// Ink's Text/backgroundColor color props already fully respect the NO_COLOR
// (https://no-color.org) and FORCE_COLOR conventions on their own — Ink v5
// renders color through its own bundled chalk, which computes its color
// level from process.env once at import time. Nothing here needs to branch
// on `NO_COLOR`/`FORCE_COLOR` manually; doing so would just duplicate (and
// risk drifting from) chalk's own, more nuanced precedence rules. See
// tests/no-color.test.js for the regression test that pins this down.
export const GREEN = '#36e85a';
export const DIM = '#74849e';
export const BRIGHT = '#e9f1fc';
export const CREAM = '#e9d9b8';
export const DARK = '#0a1f0f';
export const WARN = '#f5a623';
export const MONO = '#8a9bb5';
export const FAIL = '#e85a5a';
