import React from "react";
import { Box, Text } from "ink";

const BACON_ART = [
  "  ██████╗  █████╗  ██████╗ ██████╗ ███╗   ██╗",
  "  ██╔══██╗██╔══██╗██╔════╝██╔═══██╗████╗  ██║",
  "  ██████╔╝███████║██║     ██║   ██║██╔██╗ ██║",
  "  ██╔══██╗██╔══██║██║     ██║   ██║██║╚██╗██║",
  "  ██████╔╝██║  ██║╚██████╗╚██████╔╝██║ ╚████║",
  "  ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═══╝",
];

const STRIP = [
  "  ░░▓▓▓░░░░░▓▓▓░░░░░▓▓▓░░░░░▓▓▓░░░░░▓▓▓░░░░░▓▓▓░",
  "  ▓▓░░░▓▓▓▓▓░░░▓▓▓▓▓░░░▓▓▓▓▓░░░▓▓▓▓▓░░░▓▓▓▓▓░░░▓▓",
  "  ░░▓▓▓░░░░░▓▓▓░░░░░▓▓▓░░░░░▓▓▓░░░░░▓▓▓░░░░░▓▓▓░░",
];

// Color hex values
const GREEN = "#36e85a";
const DIM = "#74849e";
const BRIGHT = "#e9f1fc";
const CREAM = "#e9d9b8";

export default function Banner(props) {
  const {
    art = BACON_ART,
    strip = STRIP,
    tagline = "get paid to code",
  } = props || {};

  return React.createElement(
    Box,
    { flexDirection: "column" },
    // 1. One blank line
    React.createElement(Text),
    // 2. Each art line in green with "  🥓" suffix
    ...art.map((line) =>
      React.createElement(
        Box,
        { key: line },
        React.createElement(Text, { color: GREEN }, line + "  🥓")
      )
    ),
    // 3. One blank line
    React.createElement(Text),
    // 4. Each strip line character-by-character: "░" in cream, others in green
    ...strip.map((line, idx) =>
      React.createElement(
        Box,
        { key: `strip-${idx}` },
        ...Array.from(line).map((ch, charIdx) =>
          React.createElement(
            Text,
            {
              key: `strip-${idx}-${charIdx}`,
              color: ch === "░" ? CREAM : GREEN,
            },
            ch
          )
        )
      )
    ),
    // 5. One blank line
    React.createElement(Text),
    // 6. "setup wizard" · tagline line
    React.createElement(
      Box,
      { key: "tagline-line" },
      React.createElement(Text, { color: BRIGHT }, "setup wizard"),
      React.createElement(Text, { color: DIM }, "  ·  "),
      React.createElement(Text, { color: DIM }, tagline)
    ),
    // 7. Dim rule line
    React.createElement(
      Text,
      { key: "rule", color: DIM },
      "─".repeat(48)
    ),
    // 8. One blank line
    React.createElement(Text)
  );
}
