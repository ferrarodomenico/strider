# Font Files

This directory contains self-hosted web fonts for the Molten Tungsten design system.

## Current Status

| File | Status | Format | Weight |
|---|---|---|---|
| `ClashDisplay-Variable.woff2` | **Downloaded** | WOFF2 variable | 200–700 |
| `CommitMono-Regular.otf` | **Downloaded** | OpenType | 400 |
| `CommitMono-Bold.otf` | **Downloaded** | OpenType | 700 |
| `CommitMono-Regular.woff2` | **Awaiting drop-in** | WOFF2 (preferred) | 400 |
| `CommitMono-Bold.woff2` | **Awaiting drop-in** | WOFF2 (preferred) | 700 |

## Expected Filenames

The `@font-face` rules in `src/styles/_fonts.scss` reference these exact paths:

```
public/fonts/ClashDisplay-Variable.woff2   — Clash Display variable (weights 200–700)
public/fonts/CommitMono-Regular.woff2      — Commit Mono regular (weight 400)
public/fonts/CommitMono-Bold.woff2         — Commit Mono bold (weight 700)
```

## Download Sources

- **Clash Display** (free, Fontshare):
  `https://api.fontshare.com/v2/fonts/download/clash-display`
  → Extract `ClashDisplay_Complete/Fonts/WEB/fonts/ClashDisplay-Variable.woff2`

- **Commit Mono** (free, open source):
  GitHub: `https://github.com/eigilnikolajsen/commit-mono/releases`
  Website: `https://commitmono.com`
  → Look for WOFF2 releases; the 1.143 release only includes OTF files.
  → OTF fallbacks (`CommitMono-Regular.otf`, `CommitMono-Bold.otf`) are already present.

## Fallback Stacks

If WOFF2 files are absent, the browser falls back:
- Display: `'Clash Display', 'Arial Narrow', 'Helvetica Neue', sans-serif`
- Mono: `'Commit Mono', 'SFMono-Regular', 'Consolas', 'Liberation Mono', monospace`
