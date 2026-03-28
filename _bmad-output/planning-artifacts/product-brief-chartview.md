---
title: "Product Brief: Glide Chart"
status: "complete"
created: "2026-03-27"
updated: "2026-03-27"
inputs: ["competitive landscape research", "Polymarket chart analysis", "user discovery session", "3-lens review panel"]
---

# Product Brief: Glide Chart

## Executive Summary

Every crypto dashboard deserves charts that look as good as Polymarket's — smooth, flowing lines that feel alive with real-time data. Today, no open-source library delivers that. Glide Chart changes this.

Glide Chart is an open-source, MIT-licensed JavaScript charting library purpose-built for smooth, flowing financial line charts. It ships as a zero-dependency NPM package with a vanilla TypeScript core and optional React wrapper, targeting a sub-50KB (minified + gzipped) bundle size. Built on Canvas with monotone cubic interpolation, it renders at 60fps — optimized for real-time data feeds like Pyth Hermes.

Developers building crypto dashboards and prediction market UIs currently face a frustrating choice: use TradingView's lightweight-charts (fast but with jagged, poorly curved lines) or pull in a massive general-purpose library like ECharts (~1MB) just to get smooth rendering. Glide Chart eliminates that tradeoff.

## The Problem

Developers building real-time crypto and DeFi interfaces need charts that look as polished as Polymarket's. But every existing option falls short:

- **TradingView lightweight-charts** has a curved line option, but it produces "strange sharp corners" (documented in GitHub issues #1680, #506, #914). The community has been requesting proper smooth curves since 2020.
- **ECharts** does smooth lines well, but it's a ~1MB general-purpose library. Overkill when all you need is a clean line chart.
- **uPlot** is blazing fast but its creator actively opposes smooth line interpolation.
- **D3.js** has the best interpolation algorithms, but requires building everything from scratch — weeks of work for a single chart.
- **Recharts/Victory/visx** are React-only and not optimized for financial use cases — no built-in crosshairs, time-based axes, or real-time streaming.

The result: developers either ship ugly charts, bloat their bundles, or spend weeks building custom solutions.

## The Solution

Glide Chart does one thing exceptionally well: **smooth, real-time financial line charts with beautiful defaults**.

- **Monotone cubic interpolation** — smooth curves that pass through every data point without false peaks or dips. The same algorithm family behind Polymarket's effortless aesthetic.
- **Multi-series support** — overlay a real-time price line with a target/reference line (e.g., the opening price of a 5-minute trading window), essential for crypto trading UIs.
- **Canvas rendering at 60fps** — optimized for real-time data feeds like Pyth Hermes, handling frequent redraws without breaking a sweat.
- **Configurable time window** — set how many minutes or seconds of data are visible on screen, from tick-level to hourly views.
- **Zoom controls** — enable or disable zoom with a single config flag. Pinch-to-zoom and scroll-zoom built in.
- **Gradient area fills** — smooth transparency gradients from line to baseline, matching the modern crypto dashboard aesthetic.
- **Time-based axes with crosshair** — financial chart essentials built in, not bolted on.
- **Embeddable widget mode** — drop a Glide Chart into any page with a single script tag, no build step required. Ideal for crypto news sites, token pages, and prediction market embeds.
- **Comprehensive chart settings** — line color, thickness, animation speed, grid lines, axis formatting, tooltip customization — all the knobs a line chart needs, exposed through a clean config API.
- **Tiny footprint** — zero dependencies, tree-shakeable, sub-50KB minified + gzipped.

## What Makes This Different

**The moat is the curve.** Glide Chart's entire identity is built around the smooth, flowing line aesthetic. This isn't a feature toggle — it's the foundation. Every pixel of rendering, every animation frame, every default setting is engineered to produce the most visually beautiful financial line chart possible. The way Polymarket's charts *feel* alive — that's what Glide Chart delivers out of the box.

No other open-source library obsesses over curve aesthetics at this level. TradingView lightweight-charts bolted on bezier curves as an afterthought and got "strange sharp corners." ECharts offers `smooth: true` as one option among hundreds. D3 gives you the raw algorithms but no opinion. Glide Chart is the only library where smooth, flowing curves are not a setting — they are the product.

This focus creates compounding advantages:
- **Every optimization targets curve quality** — rendering pipeline, interpolation tuning, animation smoothness, gradient fills are all designed to serve the curve
- **Beautiful by default** — zero configuration produces a chart that looks like it was custom-designed, because curve aesthetics informed every default value
- **Recognizable signature** — a Glide Chart is instantly identifiable by its flowing lines, creating brand recognition across the crypto ecosystem

| | Glide Chart | lightweight-charts | ECharts | D3 (DIY) |
|---|---|---|---|---|
| Curve aesthetics | Core identity | Afterthought | One of many options | Raw algorithms |
| Bundle size (min+gz) | <50KB | ~45KB | ~1MB | ~30KB (core) |
| Real-time optimized | Yes (Canvas, 60fps) | Yes | No | Manual |
| Financial features | Built-in | Built-in | Generic | Manual |
| Setup time | Minutes | Minutes | Minutes | Weeks |
| Configurable time window | Yes | Limited | Yes | Manual |

## Who This Serves

**Primary: Frontend developers building crypto/DeFi dashboards and prediction market UIs** — they need Polymarket-quality charts without Polymarket's engineering budget. They want `npm install glide-chart` and a beautiful chart in 5 minutes.

**Secondary: Crypto trading platforms and token launchpads** — teams shipping real-time price visualization who need embeddable, high-performance charts that match modern crypto design standards.

## Success Criteria

- **Adoption:** 1,000+ GitHub stars and 10,000+ weekly NPM downloads within 6 months of launch
- **Developer experience:** Working chart from `npm install` to rendered output in under 5 minutes
- **Performance:** Sustained 60fps rendering with 10,000+ data points and real-time streaming updates
- **Bundle size:** Under 50KB minified + gzipped
- **Community:** Active contributors and ecosystem of examples/integrations within the first year

## Scope

**v1 — In:**
- Smooth line chart with monotone cubic interpolation
- Multi-series support (price line + target/reference line)
- Canvas-based rendering engine
- Real-time data streaming support (optimized for Pyth Hermes and similar WebSocket feeds)
- Configurable visible time window (seconds, minutes, hours)
- Zoom enable/disable with pinch and scroll zoom
- Time-based x-axis with auto-scaling
- Price/value y-axis with auto-scaling
- Crosshair with tooltip
- Gradient area fill
- Comprehensive line chart settings (colors, thickness, grid, animations, axis formatting)
- Light and dark theme support
- Embeddable widget mode (single script tag, no build step)
- Vanilla TypeScript core + React wrapper
- NPM package with full TypeScript types
- MIT license

**v1 — Out:**
- Candlestick, bar, OHLC chart types (v2)
- Technical indicators/overlays (v2)
- Drawing tools and annotations (future)
- Vue/Svelte/Angular wrappers (community or v2)
- SSR / static image export (future)
- Mobile-specific touch gestures beyond basic pinch-zoom (future)

## Vision

Glide Chart becomes **the default charting library for the crypto/DeFi frontend ecosystem**. v2 adds candlestick and OHLC chart types with multi-pane layouts. v3 introduces technical indicators and a plugin architecture for community extensions. An embeddable widget ecosystem drives organic adoption across crypto news sites, launchpads, and prediction markets. The smooth, flowing aesthetic becomes the signature look of a new generation of crypto interfaces.
