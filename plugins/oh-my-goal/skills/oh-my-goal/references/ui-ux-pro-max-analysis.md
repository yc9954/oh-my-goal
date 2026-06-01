# UI/UX Pro Max Analysis

Source reviewed: `https://github.com/nextlevelbuilder/ui-ux-pro-max-skill`.
Review date: 2026-05-30. Verified upstream commit: `b7e3af80f6e331f6fb456667b82b12cade7c9d35`. Current upstream manifest reports `ui-ux-pro-max` v2.5.0 with 67 UI styles, 161 color palettes, 57 font pairings, 99 UX guidelines, 25 chart types, and 15+ supported stacks.

## Upstream Structure Reviewed

- Main skill: `.claude/skills/ui-ux-pro-max/SKILL.md`, with a priority table for accessibility, touch/interaction, performance, style, layout, typography/color, animation, forms, navigation, and charts.
- Supporting skills: `.claude/skills/design-system`, `design`, `ui-styling`, `brand`, `banner-design`, and `slides`.
- Search runtime: `src/ui-ux-pro-max/scripts/core.py` and `search.py`, using BM25 over CSV domains.
- Design-system generator: `src/ui-ux-pro-max/scripts/design_system.py`, which runs product/style/color/landing/typography searches and applies `ui-reasoning.csv`.
- Data domains: `products`, `styles`, `colors`, `typography`, `landing`, `ui-reasoning`, `ux-guidelines`, `react-performance`, `app-interface`, `charts`, `icons`, and stack CSVs such as `nextjs`, `react`, `html-tailwind`, `shadcn`, `threejs`, and mobile stacks.
- Persistence pattern: `design-system/<project>/MASTER.md` plus `design-system/<project>/pages/<page>.md` overrides.
- Token-system pattern: `.claude/skills/design-system/references/token-architecture.md` defines primitive -> semantic -> component tokens; component specs define button, input, card, badge, alert, dialog, and table tokens.

## Useful Patterns For Oh My Goal

- Product classification: map the user objective to a product category before choosing visual direction.
- Multi-domain design search: consider product pattern, UI style, color palette, typography, landing structure, UX rules, charts/data, icons, performance, and stack-specific guidance together.
- Priority rule order: accessibility, touch/interaction, performance, style selection, layout/responsive, typography/color, animation, forms/feedback, navigation, charts/data.
- Three-layer token architecture: primitive tokens feed semantic tokens, then component-specific tokens. Do not let implementation scatter raw values when a generated token should exist.
- Master plus overrides: persist a global `MASTER.md` design system and optional page-specific override files so long-running goal sessions can reload design state.
- Anti-patterns: record what to avoid, not only what to implement. This is useful for critic lanes because it makes "pretty but wrong" UI rejectable.
- Pre-delivery checklist: verify icon usage, hover/focus states, contrast, reduced motion, and responsive breakpoints before completion.
- Stack-specific details: Next.js goals should prefer App Router, server components by default, explicit image dimensions, route loading/error states, and server-only secret boundaries.

## OMG Integration

- `scripts/design-system-runtime.mjs` ports the useful snippets into dependency-free JavaScript: BM25-style search from `core.py`, product -> reasoning -> multi-domain selection from `design_system.py`, best-match scoring, MASTER.md persistence, and page override scaffolding.
- Generated harnesses include `design-system.md` and runtime commands that can persist `.omg/design-systems/<slug>/MASTER.md`.
- The runtime maps the objective into product category, pattern, sections, style, color, typography, stack guidelines, token architecture, priority QA rules, anti-patterns, and pre-delivery checklist.
- Page-specific overrides are supported through `.omg/design-systems/<slug>/pages/<page>.md`.
- Designer, implementer, tester, and critic lanes must cite design-system evidence when UI quality affects completion.
- Design-system work is a quality gate, not subjective polish after implementation.
- The quality-pruning stage should compare at least one alternative visual direction when UI quality materially affects success, then record why the chosen direction beats the alternative.
- Deployment and auth work must read design-system constraints too: auth screens, API error states, loading states, and deployed landing states are all UI surfaces.

## What Not To Port

- Do not vendor the full upstream database into Oh My Goal by default; it is large and would turn the harness plugin into a design database package.
- Do not require Python or external CLI installation for the default OMG flow. The plugin-local runtime should remain dependency-free and deterministic.
- Do not ask users to choose visual style after implementation. Style, token, and quality gates belong in intake and harness generation.

## Future Upgrade Path

- Evidence lane: add a designer worker packet that compares OMG's lightweight recommendation against upstream UI/UX Pro Max output.
- CI hook: validate that UI work uses semantic/component tokens and passes the priority QA checklist before completion.
