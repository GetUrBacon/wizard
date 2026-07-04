import React from "react";
import { Box, Text } from "ink";
import { GREEN, DIM, BRIGHT, CREAM } from "./theme.js";

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

export default function Banner(props) {
  const {
    art = BACON_ART,
    strip = STRIP,
    tagline = "get paid to code",
  } = props || {};

  return (
    <Box flexDirection="column">
      {/* 1. One blank line */}
      <Text />
      {/* 2. Each art line in green with "  🥓" suffix */}
      {art.map((line) => (
        <Box key={line}>
          <Text color={GREEN}>{line + "  🥓"}</Text>
        </Box>
      ))}
      {/* 3. One blank line */}
      <Text />
      {/* 4. Each strip line character-by-character: "░" in cream, others in green */}
      {strip.map((line, idx) => (
        <Box key={`strip-${idx}`}>
          {Array.from(line).map((ch, charIdx) => (
            <Text
              key={`strip-${idx}-${charIdx}`}
              color={ch === "░" ? CREAM : GREEN}
            >
              {ch}
            </Text>
          ))}
        </Box>
      ))}
      {/* 5. One blank line */}
      <Text />
      {/* 6. "setup wizard" · tagline line */}
      <Box key="tagline-line">
        <Text color={BRIGHT}>setup wizard</Text>
        <Text color={DIM}>{"  ·  "}</Text>
        <Text color={DIM}>{tagline}</Text>
      </Box>
      {/* 7. Dim rule line */}
      <Text key="rule" color={DIM}>
        {"─".repeat(48)}
      </Text>
      {/* 8. One blank line */}
      <Text />
    </Box>
  );
}
