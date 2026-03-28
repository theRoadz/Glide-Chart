---
stepsCompleted: ["step-01-init", "step-02-discovery", "step-02b-vision", "step-02c-executive-summary", "step-03-success", "step-04-journeys", "step-05-domain", "step-06-innovation", "step-07-project-type", "step-08-scoping", "step-09-functional", "step-10-nonfunctional", "step-11-polish", "step-12-complete"]
inputDocuments: ["_bmad-output/planning-artifacts/product-brief-chartview.md"]
documentCounts:
  briefs: 1
  research: 0
  brainstorming: 0
  projectDocs: 0
classification:
  projectType: developer_tool
  domain: fintech
  complexity: medium
  projectContext: greenfield
workflowType: 'prd'
---

# Product Requirements Document - Glide Chart

**Author:** theRoad
**Date:** 2026-03-27

## Executive Summary

Glide Chart is an open-source, MIT-licensed JavaScript charting library that delivers smooth, flowing financial line charts — a snake in slow motion. It ships as a zero-dependency NPM package with a vanilla TypeScript core and optional React wrapper, targeting sub-50KB (minified + gzipped) bundle size. Built on Canvas with monotone cubic interpolation, it renders at 60fps, optimized for real-time crypto data feeds like Pyth Hermes.

Developers building crypto dashboards and prediction market UIs face a broken tradeoff: TradingView's lightweight-charts is fast but produces jagged curves with strange sharp corners; ECharts renders smooth lines but weighs ~1MB; D3 has the right algorithms but requires weeks of custom work. Glide Chart exists because its creator hit this exact roadblock — and no solution existed.

### What Makes This Special

The curve is the product. Smooth, flowing line rendering isn't a feature toggle — it's the foundation every default, optimization, and design decision serves. Zero configuration produces a chart that looks custom-designed. The rendering pipeline, interpolation tuning, animation smoothness, and gradient fills all exist to serve the curve aesthetic. A Glide Chart is instantly recognizable by its flowing lines — the Polymarket look, available to every developer via `npm install`.

### Project Classification

- **Type:** Developer tool — NPM library with TypeScript core and React wrapper
- **Domain:** Fintech — crypto/DeFi price visualization and prediction market UIs
- **Complexity:** Medium — real-time Canvas rendering and interpolation optimization, no regulatory burden
- **Context:** Greenfield — new open-source library, no existing codebase

## Success Criteria

### User Success

- Developer sees a smooth, flowing curve on first render — the "snake in slow motion" moment within 5 minutes of `npm install`
- Zero-config defaults produce a chart that looks custom-designed — no tweaking required to feel the difference
- Real-time data streaming works seamlessly with Pyth Hermes and similar WebSocket feeds without visible jank or stuttering

### Business Success

- 1,000+ GitHub stars within 6 months of launch
- 10,000+ weekly NPM downloads within 6 months
- Social proof signals: likes, votes, shares, blog mentions, and tweets from crypto/DeFi developers showcasing Glide Chart in their projects
- Projects shipping to production with Glide Chart visible in the wild

### Technical Success

- Sustained 60fps rendering with 10,000+ data points and real-time streaming updates
- Sub-50KB bundle size (minified + gzipped), zero dependencies
- Full TypeScript type coverage
- Works in all modern browsers without polyfills

### Measurable Outcomes

| Metric | Target | Timeframe |
|---|---|---|
| GitHub stars | 1,000+ | 6 months |
| Weekly NPM downloads | 10,000+ | 6 months |
| Time to first chart | < 5 minutes | At launch |
| Rendering performance | 60fps @ 10K points | At launch |
| Bundle size | < 50KB min+gz | At launch |
| Active contributors | 5+ | 12 months |

## Product Scope & Development Strategy

### MVP Strategy

**Approach:** Experience MVP — the full v1 feature set ships as a complete, polished package. The product's identity is "beautiful by default," so a partial release would undermine the core value proposition. Everything ships together.

**Resource:** Solo developer + AI pair. Human-AI collaboration eliminates the traditional solo bottleneck. Architecture, implementation, testing, and documentation produced in parallel.

**All five user journeys** (Marco, Priya, Kai, Aisha, Tomás) are fully supported at launch.

### MVP - Minimum Viable Product

- Smooth line chart with monotone cubic interpolation
- Multi-series support (price line + target/reference line)
- Canvas-based rendering engine at 60fps
- Real-time data streaming support (Pyth Hermes, WebSocket feeds)
- Configurable visible time window (seconds, minutes, hours)
- Zoom enable/disable with pinch and scroll zoom
- Time-based x-axis and price/value y-axis with auto-scaling
- Crosshair with tooltip
- Gradient area fill
- Comprehensive chart settings (colors, thickness, grid, animations, axis formatting)
- Light and dark theme support
- Embeddable widget mode (single script tag, no build step)
- Vanilla TypeScript core + React wrapper
- NPM package with full TypeScript types
- Code examples for all key use cases
- README with visual demo, quick start, and full API reference
- MIT license

### Growth Features (Post-MVP)

- Candlestick, bar, and OHLC chart types (v2)
- Technical indicators and overlays (v2)
- Multi-pane chart layouts (v2)
- Vue/Svelte/Angular wrappers (community or v2)

### Vision (Future)

- Drawing tools and annotations
- Plugin architecture for community extensions
- SSR and static image export
- Mobile-specific touch gestures beyond basic pinch-zoom
- Embeddable widget ecosystem driving organic adoption across crypto news sites, launchpads, and prediction markets

### Risk Mitigation

**Technical Risks:**
- *Highest risk:* Real-time streaming at 60fps with smooth interpolation — math, rendering, and performance collide. Mitigation: build and benchmark the rendering pipeline first. If 60fps degrades at scale, implement data decimation that preserves curve shape.
- *Interpolation edge cases:* Sparse data and extreme price spikes could produce visual artifacts. Mitigation: test with adversarial datasets (1 point, 2 points, 10x price spike in one tick) early in development. Fall back to linear segments when data is too sparse.
- *Bundle size:* Sub-50KB target is tight with the React wrapper included. Mitigation: tree-shakeable exports — core and React are separate entry points.

**Market Risks:**
- *Discoverability:* An unknown library in a crowded charting space. Mitigation: visual-first marketing — GIFs, side-by-side comparison demos, tweets showing the curve. The product sells itself visually.
- *Adoption inertia:* Developers already using lightweight-charts or ECharts may not switch. Mitigation: target greenfield projects and developers actively searching for smooth chart solutions.

**Resource Risks:**
- *Maintenance burden:* Post-launch bug reports and feature requests from early adopters. Mitigation: MIT license sets expectations. Clear CONTRIBUTING.md and issue templates from day one.

## User Journeys

### Journey 1: Marco — The Dashboard Developer

**Who:** Marco is a frontend developer at a small DeFi startup. He's building a token dashboard in React + TypeScript and needs a price chart that doesn't look like it was made in 2015.

**Opening Scene:** Marco has been using TradingView's lightweight-charts. The chart works, but the curved line option produces strange sharp corners that make his dashboard look amateurish. His designer keeps asking "can't we make it look like Polymarket?" He's Googled every combination of "smooth chart library javascript" and found nothing that fits.

**Rising Action:** Marco finds Glide Chart on NPM. He runs `npm install glide-chart`, imports the React wrapper, passes in his price data array, and renders. No config. No options object. Just data in, chart out.

**Climax:** The chart appears — a smooth, flowing curve that glides through every data point. No jagged corners, no weird spikes. His designer walks by, stops, and says "that's it." Five minutes from install to exactly what they needed.

**Resolution:** Marco ships the dashboard with Glide Chart. The bundle barely changed — sub-50KB added. The chart renders at 60fps even with thousands of data points. He never touches the chart code again because the defaults were already right.

### Journey 2: Priya — The Embed Integrator

**Who:** Priya runs a crypto news site. She wants to embed live price charts alongside her articles — no React, no build tooling, just HTML pages served from a CMS.

**Opening Scene:** Priya has tried embedding TradingView widgets but they're heavy, branded, and don't match her site's dark theme. She's looked at iframe-based solutions but they feel clunky and slow to load.

**Rising Action:** She finds Glide Chart's embeddable widget mode. A single `<script>` tag and a `<div>` with data attributes. She pastes it into her CMS template, sets the token symbol and theme to dark.

**Climax:** The chart loads inline — fast, smooth, and visually seamless with her site. No iframe borders, no third-party branding, no layout shift. It looks like she built it custom.

**Resolution:** Priya embeds Glide Charts across her token pages and prediction market articles. Readers engage more with visual price data. She didn't write a single line of JavaScript.

### Journey 3: Kai — The Real-Time Streamer

**Who:** Kai is building a Solana trading terminal that shows live price feeds from Pyth Hermes via WebSocket. Sub-second updates. The chart needs to feel alive.

**Opening Scene:** Kai's current setup uses uPlot for speed, but the lines are rigid and angular — every new data point snaps into place with no visual grace. His users describe the charts as "robotic." He wants the flowing, organic feel he's seen on Polymarket.

**Rising Action:** Kai integrates Glide Chart and connects his Pyth Hermes WebSocket feed. He configures a 5-minute visible time window and adds a second series for the opening price reference line. Data points stream in every 400ms.

**Climax:** The chart animates each new data point into the curve — the line extends smoothly, the gradient fill adjusts, the whole thing breathes. At 60fps with thousands of points in memory, there's zero jank. It looks like watching a living organism.

**Resolution:** Kai's users notice immediately. "The charts feel alive now." Retention on his trading terminal increases. The smooth curve isn't just aesthetic — it makes price movement easier to read at a glance.

### Journey 4: Aisha — The Customizer

**Who:** Aisha is a senior frontend engineer at a prediction market platform. Their design system has strict brand colors, custom fonts, and specific grid/axis styling. Nothing ships with defaults.

**Opening Scene:** Aisha evaluates Glide Chart. The defaults are beautiful, but her platform needs chartreuse accent lines, a specific grid opacity, custom tooltip formatting, and axis labels in a particular date format. She's been burned before by "opinionated" libraries that fight customization.

**Rising Action:** She opens the config API docs. Line color, thickness, animation speed, grid lines, axis formatting, tooltip templates, gradient opacity — every knob she needs is there. She builds a Glide Chart config object that matches her design system token-for-token.

**Climax:** The chart renders in her platform's exact visual language — but with that signature smooth curve that no amount of custom CSS could have achieved on their old library. Brand-compliant and beautiful.

**Resolution:** Aisha wraps Glide Chart in a thin internal component with their design tokens pre-applied. Every team across the platform gets smooth, on-brand charts with zero per-chart configuration. She contributes a "theming guide" example back to the Glide Chart repo.

### Journey 5: Tomás — The Seeker

**Who:** Tomás is a solo developer building a prediction market side project. He's staring at his chart and hating it. The lines are jagged, the curves look broken. He wants that smooth, snake-like flow he's seen on Polymarket — a line that moves like a snake in slow motion.

**Opening Scene:** Tomás has spent two hours Googling. "smooth chart javascript," "polymarket chart library," "curved line chart canvas," "snake-like flowing graph." He's tried lightweight-charts with `curved: true` — sharp corners. He's looked at ECharts — way too heavy. He's read D3 tutorials — way too much work. He's frustrated and about to give up and just ship the ugly chart.

**Rising Action:** He finds a tweet: "Just switched to Glide Chart — finally, smooth curves that actually look smooth." He clicks through to the repo. The demo catches his eye immediately — that flowing, organic line. He reads "zero-config, sub-50KB, Canvas at 60fps" and thinks "this is too good to be true."

**Climax:** He runs `npm install glide-chart`, drops in his data, and renders. The curve appears — smooth, flowing, alive. Exactly the snake-in-slow-motion aesthetic he's been chasing. No config tweaking. No compromises. He literally says "finally" out loud.

**Resolution:** Tomás ships his prediction market with Glide Chart that weekend. He stars the repo, tweets about it, and writes a short blog post comparing it to every library he tried. He becomes an evangelist — because he remembers the pain of searching and the relief of finding.

### Journey Requirements Summary

| Journey | Key Capabilities Revealed |
|---|---|
| Marco (Dashboard Dev) | NPM install, React wrapper, zero-config defaults, TypeScript types, smooth rendering |
| Priya (Embed Integrator) | Script tag widget mode, no-build-step usage, dark/light theme, CMS-friendly |
| Kai (Real-Time Streamer) | WebSocket data feed support, configurable time window, multi-series, 60fps streaming, animation |
| Aisha (Customizer) | Config API breadth, theming, tooltip/axis/grid customization, design system integration |
| Tomás (The Seeker) | Discoverability, instant visual demo, frictionless first experience, social proof loop |

## Domain-Specific Requirements

### Data Integrity

- Monotone cubic interpolation must pass through every data point exactly — no false peaks, dips, or visual artifacts that could misrepresent price movement
- Chart must never display stale data without indication — if the data feed disconnects, the chart should reflect that state visually

### Real-Time Performance

- Chart rendering must keep pace with sub-second data feeds (400ms+ update frequency from Pyth Hermes)
- No frame drops or visual lag during continuous streaming — stale visuals in a trading context erode user trust
- Graceful degradation under data bursts (e.g., high-volatility moments with rapid price changes)

### Financial Display Standards

- Proper decimal precision handling across price ranges (sub-penny tokens through BTC-scale values)
- Locale-aware number formatting for international users
- Time axis must handle timezone awareness for global trading contexts
- Y-axis auto-scaling must not exaggerate or minimize price movements misleadingly

## Innovation & Competitive Landscape

### Innovation Areas

- **Aesthetic-first library design** — Every existing charting library treats smooth curves as a feature toggle or afterthought. Glide Chart inverts this: the smooth, flowing curve is the product identity, and every default, optimization, and rendering decision serves that aesthetic. This is a new paradigm for developer tools in the charting space.
- **Open-sourcing a proprietary aesthetic** — The Polymarket curve look exists in production but is proprietary. No open-source equivalent exists. Glide Chart makes this aesthetic available to every developer via `npm install`.

### Competitive Analysis

- TradingView lightweight-charts has open GitHub issues (#1680, #506, #914) requesting proper smooth curves since 2020 — unresolved
- uPlot's creator actively opposes smooth interpolation
- ECharts offers `smooth: true` but it's buried in a ~1MB general-purpose library
- D3 provides the raw algorithms but zero opinions — weeks of work to achieve the result
- No open-source library exists that treats curve aesthetics as its core identity

### Validation Approach

- Visual side-by-side comparison demos: Glide Chart vs. lightweight-charts vs. ECharts rendering the same dataset
- The proof is in the pixels — developers will see the difference instantly
- Demo page and README showcasing the "snake in slow motion" aesthetic as the primary selling point

## Developer Tool Specific Requirements

### Technical Architecture

- **Language:** TypeScript core, compiled to ES modules and CommonJS for broad bundler compatibility
- **Package Manager:** NPM as the sole distribution channel for v1
- **Runtime:** Browser-only (Canvas API). No Node/SSR/Deno/Bun targets for v1
- **Dependencies:** Zero. No runtime dependencies. Dev dependencies only for build tooling
- **Bundle Targets:** ESM + CJS + UMD (UMD for script tag widget mode)
- **TypeScript:** Full type definitions shipped with the package — autocomplete and inline docs out of the box

### API Surface

- **Core API:** `GlideChart` class — instantiate with a container element and config object
- **React Wrapper:** `<GlideChart />` component with props matching the config API
- **Config API:** Single options object covering series data, time window, colors, thickness, grid, axes, tooltips, animations, gradient, theme
- **Data API:** Methods to push new data points (real-time streaming), replace dataset, and clear
- **Widget API:** Data attributes on HTML elements for no-code embed configuration

### Documentation & Examples

- README.md as the sole documentation for v1
- Covers: installation, quick start, full config API reference, examples, and comparison demos
- README should sell the aesthetic immediately — GIF or screenshot of the smooth curve above the fold

Ship examples covering all key use cases:
- **Basic chart** — minimal setup, zero config, data in → smooth chart out
- **Real-time streaming** — connecting a WebSocket feed, pushing data points live
- **Multi-series** — price line + reference/target line overlay
- **Custom theming** — matching a design system with colors, grid, axes, tooltips
- **Dark/light mode** — theme switching
- **Embeddable widget** — script tag integration, no build step
- **Gradient area fill** — configuring the fill aesthetic
- **Zoom controls** — enabling/disabling pinch and scroll zoom

### Implementation Considerations

- Tree-shakeable exports — developers importing only the core shouldn't pay for the React wrapper
- Widget mode UMD bundle should be independently deployable via CDN
- All config options must have sensible defaults — zero-config produces a beautiful chart
- TypeScript strict mode throughout — no `any` types in the public API

## Functional Requirements

### Curve Rendering

- FR1: Developer can render a smooth line chart using monotone cubic interpolation that passes through every data point
- FR2: Developer can render multiple data series simultaneously on the same chart (e.g., price line + reference line)
- FR3: Developer can display gradient area fills beneath each data series
- FR4: System gracefully degrades to linear segments when data points are too sparse for meaningful interpolation
- FR5: System handles extreme value changes (price spikes) without visual artifacts or interpolation overshooting

### Real-Time Data

- FR6: Developer can push new data points to the chart in real-time without full re-render
- FR7: Developer can connect streaming data sources (WebSocket feeds) to the chart
- FR8: Developer can configure the visible time window (seconds, minutes, hours)
- FR9: Chart auto-scrolls to show the most recent data as new points arrive
- FR10: System visually indicates when the data feed is stale or disconnected

### Interaction

- FR11: User can see a crosshair overlay that tracks cursor/touch position on the chart
- FR12: User can see a tooltip displaying data values at the crosshair position
- FR13: Developer can enable or disable zoom with a single config flag
- FR14: User can zoom in/out using pinch gestures on touch devices
- FR15: User can zoom in/out using scroll wheel on desktop

### Axes & Scaling

- FR16: Chart displays a time-based x-axis with auto-scaled labels
- FR17: Chart displays a value-based y-axis with auto-scaled labels
- FR18: System handles decimal precision across price ranges (sub-penny tokens through BTC-scale)
- FR19: Developer can customize axis label formatting (date format, number format)
- FR20: System supports locale-aware number formatting
- FR21: System handles timezone awareness for time axis display

### Appearance & Theming

- FR22: Developer can switch between light and dark themes
- FR23: Developer can customize line color and thickness per series
- FR24: Developer can customize grid line appearance (visibility, opacity, style)
- FR25: Developer can customize tooltip content and formatting
- FR26: Developer can customize gradient fill opacity and color
- FR27: Developer can configure animation speed for data transitions
- FR28: Chart produces a visually polished result with zero configuration (beautiful defaults)

### Embeddable Widget

- FR29: Non-technical user can embed a chart using a single script tag and HTML element with data attributes
- FR30: Widget mode operates without a build step or framework dependency
- FR31: Widget user can configure chart appearance through HTML data attributes
- FR32: Widget user can specify data source through data attributes

### Developer Integration

- FR33: Developer can install the library via `npm install`
- FR34: Developer can import and use the vanilla TypeScript core without React
- FR35: Developer can import and use the React wrapper component
- FR36: Developer receives full TypeScript type definitions and autocomplete support
- FR37: Developer can replace the entire dataset programmatically
- FR38: Developer can clear all data from the chart
- FR39: Developer can destroy/dispose of the chart instance and clean up resources

### Package & Distribution

- FR40: Library ships as tree-shakeable ESM and CJS modules
- FR41: Library ships a UMD bundle for script tag / CDN usage
- FR42: Library has zero runtime dependencies
- FR43: Library is published under MIT license

## Non-Functional Requirements

### Performance

- NFR1: Chart must render at sustained 60fps with up to 10,000 data points visible
- NFR2: Chart must render at sustained 60fps during real-time streaming at 400ms update intervals
- NFR3: Initial chart render (data in → pixels on screen) must complete within 100ms for datasets under 1,000 points
- NFR4: Adding a single data point (real-time push) must not cause a full re-render of the canvas
- NFR5: Memory usage must remain stable during extended streaming sessions (no memory leaks over hours of continuous data)
- NFR6: Total library size must be under 50KB minified + gzipped (core + React wrapper combined)
- NFR7: Core library (without React wrapper) must be under 30KB minified + gzipped

### Accessibility

- NFR8: Chart container must support ARIA labels for screen reader context (e.g., "Price chart for SOL/USD")
- NFR9: Tooltip data must be accessible to screen readers when crosshair is active
- NFR10: Chart must be keyboard-navigable (arrow keys to move crosshair, +/- for zoom)
- NFR11: Color choices in default themes must meet WCAG 2.1 AA contrast ratios for axis labels and grid lines

### Integration & Compatibility

- NFR12: Library must work in all modern browsers (Chrome, Firefox, Safari, Edge — last 2 major versions)
- NFR13: Library must work with major bundlers (Webpack, Vite, Rollup, esbuild) without special configuration
- NFR14: React wrapper must support React 18+
- NFR15: Widget mode UMD bundle must load and render without conflicting with other scripts on the page
- NFR16: Library must not pollute the global namespace (except UMD build when no module loader is present)
