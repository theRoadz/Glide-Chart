---
stepsCompleted: ["step-01-validate-prerequisites", "step-02-design-epics", "step-03-create-stories", "step-04-final-validation"]
inputDocuments: ["_bmad-output/planning-artifacts/prd.md", "_bmad-output/planning-artifacts/architecture.md"]
---

# Glide Chart - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Glide Chart, decomposing the requirements from the PRD and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: Developer can render a smooth line chart using monotone cubic interpolation that passes through every data point
FR2: Developer can render multiple data series simultaneously on the same chart (e.g., price line + reference line)
FR3: Developer can display gradient area fills beneath each data series
FR4: System gracefully degrades to linear segments when data points are too sparse for meaningful interpolation
FR5: System handles extreme value changes (price spikes) without visual artifacts or interpolation overshooting
FR6: Developer can push new data points to the chart in real-time without full re-render
FR7: Developer can connect streaming data sources (WebSocket feeds) to the chart
FR8: Developer can configure the visible time window (seconds, minutes, hours)
FR9: Chart auto-scrolls to show the most recent data as new points arrive
FR10: System visually indicates when the data feed is stale or disconnected
FR11: User can see a crosshair overlay that tracks cursor/touch position on the chart
FR12: User can see a tooltip displaying data values at the crosshair position
FR13: Developer can enable or disable zoom with a single config flag
FR14: User can zoom in/out using pinch gestures on touch devices
FR15: User can zoom in/out using scroll wheel on desktop
FR16: Chart displays a time-based x-axis with auto-scaled labels
FR17: Chart displays a value-based y-axis with auto-scaled labels
FR18: System handles decimal precision across price ranges (sub-penny tokens through BTC-scale)
FR19: Developer can customize axis label formatting (date format, number format)
FR20: System supports locale-aware number formatting
FR21: System handles timezone awareness for time axis display
FR22: Developer can switch between light and dark themes
FR23: Developer can customize line color and thickness per series
FR24: Developer can customize grid line appearance (visibility, opacity, style)
FR25: Developer can customize tooltip content and formatting
FR26: Developer can customize gradient fill opacity and color
FR27: Developer can configure animation speed for data transitions
FR28: Chart produces a visually polished result with zero configuration (beautiful defaults)
FR29: Non-technical user can embed a chart using a single script tag and HTML element with data attributes
FR30: Widget mode operates without a build step or framework dependency
FR31: Widget user can configure chart appearance through HTML data attributes
FR32: Widget user can specify data source through data attributes
FR33: Developer can install the library via npm install
FR34: Developer can import and use the vanilla TypeScript core without React
FR35: Developer can import and use the React wrapper component
FR36: Developer receives full TypeScript type definitions and autocomplete support
FR37: Developer can replace the entire dataset programmatically
FR38: Developer can clear all data from the chart
FR39: Developer can destroy/dispose of the chart instance and clean up resources
FR40: Library ships as tree-shakeable ESM and CJS modules
FR41: Library ships a UMD bundle for script tag / CDN usage
FR42: Library has zero runtime dependencies
FR43: Library is published under MIT license

### NonFunctional Requirements

NFR1: Chart must render at sustained 60fps with up to 10,000 data points visible
NFR2: Chart must render at sustained 60fps during real-time streaming at 400ms update intervals
NFR3: Initial chart render (data in to pixels on screen) must complete within 100ms for datasets under 1,000 points
NFR4: Adding a single data point (real-time push) must not cause a full re-render of the canvas
NFR5: Memory usage must remain stable during extended streaming sessions (no memory leaks over hours of continuous data)
NFR6: Total library size must be under 50KB minified + gzipped (core + React wrapper combined)
NFR7: Core library (without React wrapper) must be under 30KB minified + gzipped
NFR8: Chart container must support ARIA labels for screen reader context
NFR9: Tooltip data must be accessible to screen readers when crosshair is active
NFR10: Chart must be keyboard-navigable (arrow keys to move crosshair, +/- for zoom)
NFR11: Color choices in default themes must meet WCAG 2.1 AA contrast ratios for axis labels and grid lines
NFR12: Library must work in all modern browsers (Chrome, Firefox, Safari, Edge - last 2 major versions)
NFR13: Library must work with major bundlers (Webpack, Vite, Rollup, esbuild) without special configuration
NFR14: React wrapper must support React 18+
NFR15: Widget mode UMD bundle must load and render without conflicting with other scripts on the page
NFR16: Library must not pollute the global namespace (except UMD build when no module loader is present)

### Additional Requirements

- Starter template: tsup + supplemental UMD esbuild step for build tooling (pnpm, TypeScript 5.x strict, ES2020 target)
- Layered canvas rendering architecture (4 layers: background, axis, data, interaction) with separate redraw cycles
- Ring buffer (circular buffer) for time-series data management - O(1) insert and eviction, stable memory footprint
- Single requestAnimationFrame loop with dirty flags - only dirty layers redraw, loop sleeps when idle
- Cached spline coefficients with incremental updates - only recompute tail segments on new streaming data
- Resolved config object pattern (deep merge: defaultConfig <- themePreset <- userConfig) for zero-overhead rendering
- Facade pattern public API - single GlideChart class delegates to renderer, data store, event handler, config subsystems
- Centralized event dispatcher on container element - normalizes mouse/touch/keyboard, single cleanup on destroy()
- Constructor injection for all subsystem dependencies - no singletons, no global state
- Device Pixel Ratio (DPR) handling - canvas backing store at clientWidth*dpr x clientHeight*dpr for Retina/HiDPI
- ResizeObserver on container for responsive canvas sizing - updates dimensions, recalculates Scale, marks all layers dirty
- Stale data threshold config (staleThreshold: number in ms) for FR10 visual indicator
- Strict module boundary import rules - clean DAG, no circular dependencies
- Co-located tests (foo.test.ts next to foo.ts), kebab-case file naming, named exports only (no export default)
- Error message format: always prefix with class/module name for useful stack traces
- Canvas context state management: FrameScheduler calls save()/restore() around each layer draw
- All coordinate conversion through shared Scale object - no manual math in renderers
- Pixel alignment (0.5px offset) for grid lines and axis ticks; sub-pixel rendering for smooth curves

### UX Design Requirements

No UX Design document found. UX requirements are embedded within PRD functional requirements (FR22-FR28 for appearance/theming, NFR8-NFR11 for accessibility).

### FR Coverage Map

FR1: Epic 1 - Smooth line chart with monotone cubic interpolation
FR2: Epic 2 - Multiple data series on same chart
FR3: Epic 1 - Gradient area fills beneath series
FR4: Epic 1 - Graceful degradation to linear segments for sparse data
FR5: Epic 1 - Handle extreme value changes without artifacts
FR6: Epic 3 - Push new data points in real-time
FR7: Epic 3 - Connect streaming data sources (WebSocket)
FR8: Epic 3 - Configurable visible time window
FR9: Epic 3 - Auto-scroll to most recent data
FR10: Epic 3 - Visual indication of stale/disconnected feed
FR11: Epic 4 - Crosshair overlay tracking cursor/touch
FR12: Epic 4 - Tooltip displaying data values at crosshair
FR13: Epic 4 - Enable/disable zoom via config flag
FR14: Epic 4 - Pinch-to-zoom on touch devices
FR15: Epic 4 - Scroll wheel zoom on desktop
FR16: Epic 2 - Time-based x-axis with auto-scaled labels
FR17: Epic 2 - Value-based y-axis with auto-scaled labels
FR18: Epic 2 - Decimal precision across price ranges
FR19: Epic 2 - Custom axis label formatting
FR20: Epic 2 - Locale-aware number formatting
FR21: Epic 2 - Timezone awareness for time axis
FR22: Epic 5 - Light and dark theme switching
FR23: Epic 5 - Custom line color and thickness per series
FR24: Epic 5 - Custom grid line appearance
FR25: Epic 5 - Custom tooltip content and formatting
FR26: Epic 5 - Custom gradient fill opacity and color
FR27: Epic 5 - Configurable animation speed
FR28: Epic 1 - Beautiful defaults with zero configuration
FR29: Epic 7 - Embed chart with single script tag + data attributes
FR30: Epic 7 - Widget mode without build step or framework
FR31: Epic 7 - Configure widget via HTML data attributes
FR32: Epic 7 - Specify data source via data attributes
FR33: Epic 1 - Install via npm install
FR34: Epic 1 - Import and use vanilla TypeScript core
FR35: Epic 6 - Import and use React wrapper component
FR36: Epic 1 - Full TypeScript type definitions and autocomplete
FR37: Epic 4 - Replace entire dataset programmatically
FR38: Epic 4 - Clear all data from chart
FR39: Epic 4 - Destroy/dispose chart instance and clean up
FR40: Epic 1 - Tree-shakeable ESM and CJS modules
FR41: Epic 7 - UMD bundle for script tag / CDN usage
FR42: Epic 1 - Zero runtime dependencies
FR43: Epic 1 - MIT license

## Epic List

### Epic 1: Project Foundation & First Smooth Curve (8 stories)
Developer can install the library, render a single smooth line chart with monotone cubic interpolation, and see beautiful defaults out of the box - the "snake in slow motion" first impression.
**FRs covered:** FR1, FR3, FR4, FR5, FR28, FR33, FR34, FR36, FR40, FR42, FR43

### Epic 2: Axes, Scaling & Multi-Series (5 stories)
Developer can display properly formatted axes, handle diverse price ranges, and overlay multiple data series on the same chart.
**FRs covered:** FR2, FR16, FR17, FR18, FR19, FR20, FR21

### Epic 3: Real-Time Streaming (4 stories)
Developer can connect live data feeds and see the chart update smoothly in real-time with auto-scroll and stale data indication.
**FRs covered:** FR6, FR7, FR8, FR9, FR10

### Epic 4: Interaction & Accessibility (6 stories)
User can interact with the chart via crosshair, tooltip, zoom (scroll + pinch), and keyboard navigation with full accessibility support.
**FRs covered:** FR11, FR12, FR13, FR14, FR15, FR37, FR38, FR39

### Epic 5: Theming & Customization (4 stories)
Developer can fully customize the chart's appearance including themes, colors, grid, tooltips, gradients, and animation speed to match any design system.
**FRs covered:** FR22, FR23, FR24, FR25, FR26, FR27

### Epic 6: React Wrapper (2 stories)
React developer can use a <GlideChart /> component with props-driven configuration and proper lifecycle management.
**FRs covered:** FR35

### Epic 7: Embeddable Widget & Distribution (2 stories)
Non-technical user can embed a chart with a single script tag and data attributes, and the UMD bundle is CDN-ready.
**FRs covered:** FR29, FR30, FR31, FR32, FR41

## Epic 1: Project Foundation & First Smooth Curve

Developer can install the library, render a single smooth line chart with monotone cubic interpolation, and see beautiful defaults out of the box - the "snake in slow motion" first impression.

### Story 1.1: Project Initialization & Build Pipeline

As a developer contributing to Glide Chart,
I want a fully configured TypeScript project with build tooling, test framework, and package exports,
So that I have a working foundation to build the library on.

**Acceptance Criteria:**

**Given** a fresh clone of the repository
**When** I run `pnpm install && pnpm build`
**Then** ESM and CJS bundles are generated in `dist/`
**And** TypeScript declaration files are generated
**And** the project uses TypeScript strict mode with no `any` types
**And** `pnpm test` runs Vitest successfully (with a placeholder test)
**And** the `package.json` has correct `exports` map for `.` and `./react` entry points
**And** `sideEffects: false` is set for tree-shaking
**And** MIT LICENSE file is present
**And** zero runtime dependencies exist in `package.json`

### Story 1.2: Core Data Types & Ring Buffer

As a developer using Glide Chart,
I want an efficient data storage layer for time-series data,
So that the chart can handle large datasets with stable memory and O(1) operations.

**Acceptance Criteria:**

**Given** a RingBuffer instance with a configured capacity
**When** I push data points beyond capacity
**Then** the oldest points are evicted automatically (FIFO)
**And** memory usage remains constant regardless of total points pushed
**And** iteration yields points in oldest-to-newest order
**And** the DataPoint type includes `timestamp` (number) and `value` (number)
**And** the buffer supports querying the visible window of points
**And** all code follows kebab-case file naming and constructor injection patterns
**And** tests are co-located next to source files

### Story 1.3: Monotone Cubic Interpolation & Spline Cache

As a developer using Glide Chart,
I want smooth curve interpolation that passes through every data point exactly,
So that price data is never misrepresented and the curve looks flowing and organic.

**Acceptance Criteria:**

**Given** an array of 3 or more data points
**When** monotone cubic interpolation is computed
**Then** the resulting curve passes through every data point exactly (no overshooting)
**And** extreme value changes (10x price spikes) produce no visual artifacts
**And** spline coefficients are cached and reusable across frames

**Given** fewer than 3 data points
**When** interpolation is requested
**Then** the system falls back to linear segments gracefully (FR4)

**Given** a cached spline and a new data point appended
**When** incremental update is triggered
**Then** only the last 2-3 segments are recomputed (not the full dataset)

### Story 1.4: Coordinate Scale & Viewport Mapping

As a developer using Glide Chart,
I want a Scale system that maps data coordinates to pixel coordinates,
So that all rendering components use consistent, accurate positioning.

**Acceptance Criteria:**

**Given** a dataset with a time range and value range
**When** the Scale is computed for a given canvas size
**Then** `xToPixel(timestamp)` correctly maps time to horizontal position
**And** `yToPixel(value)` correctly maps value to vertical position
**And** the Scale auto-calculates appropriate min/max with padding
**And** DPR (device pixel ratio) is accounted for in pixel calculations
**And** the Scale recalculates when canvas size changes

### Story 1.5: Layered Canvas & Frame Scheduler

As a developer using Glide Chart,
I want a multi-layer canvas rendering system with an efficient frame loop,
So that only changed layers redraw and the chart maintains 60fps performance.

**Acceptance Criteria:**

**Given** a container DOM element
**When** the LayerManager initializes
**Then** 4 stacked canvas elements are created (background, axis, data, interaction)
**And** each canvas is sized to the container with DPR scaling applied
**And** a ResizeObserver monitors the container and resizes all canvases on change

**Given** the FrameScheduler is running
**When** no layers are dirty
**Then** the rAF loop sleeps (stops requesting frames)

**Given** a layer is marked dirty
**When** the next animation frame fires
**Then** only dirty layers redraw
**And** `ctx.save()` is called before and `ctx.restore()` after each layer draw
**And** the dirty flag is cleared after drawing

### Story 1.6: Config System & Beautiful Defaults

As a developer using Glide Chart,
I want a configuration system with sensible defaults that produces a beautiful chart with zero config,
So that I get the "snake in slow motion" aesthetic immediately without any tweaking.

**Acceptance Criteria:**

**Given** no user configuration is provided
**When** the config resolver runs
**Then** a complete ResolvedConfig is produced with beautiful default colors, line thickness, gradient, grid, and animation settings

**Given** a partial user configuration
**When** merged with defaults
**Then** deep merge produces a correct result (user values override defaults, unspecified values retain defaults)
**And** per-series config overrides are supported

**Given** a resolved config
**When** any visual component reads it
**Then** property access is plain object lookup (zero overhead at render time)

### Story 1.7: Data Layer Rendering — Smooth Curve & Gradient Fill

As a developer using Glide Chart,
I want the data layer to render smooth curves with gradient area fills on canvas,
So that the chart displays the signature flowing line aesthetic.

**Acceptance Criteria:**

**Given** a dataset loaded into the ring buffer with computed spline coefficients
**When** the data layer draws
**Then** a smooth curve is rendered using the cached spline coefficients on the canvas
**And** a gradient area fill is drawn beneath the curve
**And** the curve visually passes through every data point
**And** rendering completes within the frame budget (no visible jank)
**And** canvas is cleared before each redraw

### Story 1.8: GlideChart Public API Facade

As a developer using Glide Chart,
I want a simple public API class that I can instantiate with a container and optional config,
So that I can render a chart with `new GlideChart(container, config)` and see a smooth curve immediately.

**Acceptance Criteria:**

**Given** a container element and a dataset
**When** `new GlideChart(container, { series: [{ id: 'price', data: points }] })` is called
**Then** a smooth, gradient-filled curve renders in the container with beautiful defaults
**And** the chart is responsive to container resize
**And** TypeScript types provide full autocomplete for the config object

**Given** a GlideChart instance
**When** `chart.setData('price', newPoints)` is called
**Then** the chart re-renders with the new dataset

**Given** a GlideChart instance
**When** `chart.destroy()` is called
**Then** all canvases, event listeners, ResizeObserver, and rAF loop are cleaned up
**And** no memory leaks remain

## Epic 2: Axes, Scaling & Multi-Series

Developer can display properly formatted axes, handle diverse price ranges, and overlay multiple data series on the same chart.

### Story 2.1: Background Layer — Grid Lines

As a developer using Glide Chart,
I want grid lines rendered on the background canvas layer,
So that data values are easier to read at a glance.

**Acceptance Criteria:**

**Given** a chart with data rendered
**When** the background layer draws
**Then** horizontal and vertical grid lines are rendered at appropriate intervals
**And** grid lines use 0.5px offset for crisp 1px rendering
**And** grid line spacing adapts to the current viewport/zoom level
**And** grid renders on the background layer (not the data layer) so it only redraws on viewport change

### Story 2.2: Y-Axis with Auto-Scaling & Decimal Precision

As a developer using Glide Chart,
I want a value y-axis that auto-scales and handles diverse price ranges,
So that sub-penny tokens and BTC-scale values display with correct precision.

**Acceptance Criteria:**

**Given** a dataset with values in any range (0.000001 to 100,000+)
**When** the axis layer renders the y-axis
**Then** labels display with appropriate decimal precision for the value range
**And** tick marks align with grid lines
**And** auto-scaling does not exaggerate or minimize price movements misleadingly
**And** labels meet WCAG 2.1 AA contrast ratios in default themes

**Given** a developer provides a custom number format function via config
**When** the y-axis renders
**Then** the custom formatter is used for label text

### Story 2.3: X-Axis with Time Formatting & Timezone Support

As a developer using Glide Chart,
I want a time-based x-axis with auto-scaled labels and timezone awareness,
So that global trading contexts display time correctly for any user.

**Acceptance Criteria:**

**Given** a dataset with timestamps
**When** the axis layer renders the x-axis
**Then** time labels are auto-scaled to appropriate intervals (seconds, minutes, hours, days)
**And** labels adapt when zoomed in or out
**And** tick marks align with grid lines

**Given** a developer configures a timezone
**When** the x-axis renders
**Then** time labels reflect the configured timezone

**Given** a developer provides a custom date format function
**When** the x-axis renders
**Then** the custom formatter is used for label text

### Story 2.4: Locale-Aware Number Formatting

As a developer using Glide Chart,
I want locale-aware number formatting for axis labels,
So that international users see numbers formatted according to their locale conventions.

**Acceptance Criteria:**

**Given** a developer configures a locale (e.g., 'de-DE')
**When** the y-axis renders
**Then** numbers use the locale's decimal separator and thousands grouping (e.g., 1.234,56)

**Given** no locale is configured
**When** the y-axis renders
**Then** the browser's default locale is used

### Story 2.5: Multi-Series Rendering

As a developer using Glide Chart,
I want to render multiple data series on the same chart,
So that I can overlay a price line with a reference/target line.

**Acceptance Criteria:**

**Given** a config with 2+ series (e.g., price line + opening price reference)
**When** the chart renders
**Then** each series draws its own smooth curve with independent color and thickness
**And** each series has its own ring buffer and spline cache
**And** gradient fill is applied per-series (configurable independently)
**And** the y-axis auto-scales to encompass all visible series values
**And** the legend or tooltip distinguishes between series

## Epic 3: Real-Time Streaming

Developer can connect live data feeds and see the chart update smoothly in real-time with auto-scroll and stale data indication.

### Story 3.1: Incremental Data Push & Animation

As a developer using Glide Chart,
I want to push new data points to the chart without full re-render,
So that real-time updates are smooth and performant.

**Acceptance Criteria:**

**Given** a rendered chart with existing data
**When** `chart.addData('price', { timestamp, value })` is called
**Then** the new point is appended to the ring buffer
**And** only the tail spline segments are recomputed (incremental update)
**And** only the data layer is marked dirty (not background or axis unless range changes)
**And** the new point animates smoothly into the curve
**And** performance remains at 60fps with 10,000+ points in the buffer

### Story 3.2: Configurable Visible Time Window & Auto-Scroll

As a developer using Glide Chart,
I want to configure a visible time window and have the chart auto-scroll,
So that the most recent data is always visible during live streaming.

**Acceptance Criteria:**

**Given** a developer configures `timeWindow: 300` (5 minutes in seconds)
**When** data streams in beyond the window
**Then** the chart viewport shows only the last 5 minutes of data
**And** older data scrolls off the left edge smoothly
**And** the x-axis labels update as the window moves
**And** the y-axis auto-scales to the visible data range

**Given** a developer configures `timeWindow` in different units
**When** values like 60 (1 min), 3600 (1 hour) are used
**Then** the viewport adjusts accordingly

### Story 3.3: WebSocket Data Feed Integration Pattern

As a developer using Glide Chart,
I want a clear pattern for connecting WebSocket feeds to the chart,
So that I can integrate Pyth Hermes and similar real-time data sources.

**Acceptance Criteria:**

**Given** a WebSocket connection delivering price updates at 400ms intervals
**When** each message is received and passed to `chart.addData()`
**Then** the chart updates smoothly with no dropped frames or visual stutter
**And** the ring buffer evicts old data to maintain stable memory

**Given** multiple data points arrive in a burst (high volatility moment)
**When** they are pushed rapidly
**Then** the chart handles the burst gracefully without frame drops
**And** all points are recorded in the buffer (none silently dropped)

### Story 3.4: Stale Data Visual Indicator

As a developer using Glide Chart,
I want the chart to visually indicate when the data feed is stale or disconnected,
So that users are never misled by outdated price data.

**Acceptance Criteria:**

**Given** a `staleThreshold` is configured (e.g., 5000ms)
**When** no new data arrives within the threshold
**Then** the chart visually indicates staleness (e.g., line dims, opacity reduces)
**And** the stale indicator is visible without user interaction

**Given** a stale chart
**When** new data resumes
**Then** the stale visual indicator clears immediately
**And** the chart resumes normal rendering

## Epic 4: Interaction & Accessibility

User can interact with the chart via crosshair, tooltip, zoom (scroll + pinch), and keyboard navigation with full accessibility support.

### Story 4.1: Event Dispatcher & Crosshair

As a user viewing a Glide Chart,
I want a crosshair overlay that tracks my cursor or touch position,
So that I can precisely identify values at any point on the chart.

**Acceptance Criteria:**

**Given** a rendered chart with mouse/touch support
**When** I move my cursor over the chart
**Then** a vertical crosshair line tracks the cursor position
**And** a horizontal crosshair line shows the corresponding value level
**And** the crosshair renders on the interaction layer (separate from data)
**And** the crosshair updates at 60fps with no visible lag

**Given** a touch device
**When** I touch and drag on the chart
**Then** the crosshair follows my touch position

**Given** the cursor leaves the chart area
**When** the pointer exits
**Then** the crosshair hides immediately

### Story 4.2: Tooltip with Data Values

As a user viewing a Glide Chart,
I want a tooltip showing data values at the crosshair position,
So that I can read exact prices and timestamps.

**Acceptance Criteria:**

**Given** the crosshair is active on the chart
**When** hovering over the data area
**Then** a tooltip displays the timestamp and value(s) at the crosshair position
**And** for multi-series charts, all series values are shown
**And** values use the configured number/date formatting
**And** the tooltip repositions to stay within the chart bounds (no clipping)

**Given** a screen reader is active
**When** the crosshair moves
**Then** tooltip data is accessible via ARIA live region (NFR9)

### Story 4.3: Scroll Wheel Zoom

As a user viewing a Glide Chart,
I want to zoom in and out using my scroll wheel,
So that I can explore different time ranges of the data.

**Acceptance Criteria:**

**Given** zoom is enabled in config (`zoom: true`)
**When** I scroll the mouse wheel up on the chart
**Then** the chart zooms in, centering on the cursor position
**And** the time window narrows, showing more detail

**When** I scroll the mouse wheel down
**Then** the chart zooms out, showing a wider time range

**Given** zoom is disabled in config (`zoom: false`)
**When** I scroll on the chart
**Then** the scroll event passes through to the page (no zoom occurs)

### Story 4.4: Pinch-to-Zoom on Touch Devices

As a user on a touch device,
I want to zoom the chart using pinch gestures,
So that I can explore data ranges on mobile and tablet.

**Acceptance Criteria:**

**Given** zoom is enabled and a touch device is used
**When** I perform a pinch-out gesture on the chart
**Then** the chart zooms in, centering on the pinch midpoint

**When** I perform a pinch-in gesture
**Then** the chart zooms out

**And** the gesture detection normalizes touch events correctly
**And** zoom transitions are smooth (no jumps or jitter)

### Story 4.5: Keyboard Navigation & Accessibility

As a user who navigates with a keyboard,
I want to move the crosshair and zoom using keyboard controls,
So that the chart is fully accessible without a mouse.

**Acceptance Criteria:**

**Given** the chart container has focus (`tabindex="0"`)
**When** I press left/right arrow keys
**Then** the crosshair moves to the previous/next data point
**And** the tooltip updates to show the new position's values

**When** I press +/- keys
**Then** the chart zooms in/out

**Given** the chart container
**When** rendered
**Then** it has an ARIA label describing the chart (e.g., "Price chart for SOL/USD") (NFR8)
**And** color choices in default themes meet WCAG 2.1 AA contrast (NFR11)

### Story 4.6: Dataset Replace, Clear & Destroy API

As a developer using Glide Chart,
I want to replace, clear, and destroy the chart programmatically,
So that I can manage chart lifecycle in my application.

**Acceptance Criteria:**

**Given** a GlideChart instance
**When** `chart.setData('price', newDataset)` is called
**Then** the entire dataset is replaced and the chart re-renders with new data
**And** the spline cache is fully recomputed

**Given** a GlideChart instance
**When** `chart.clearData('price')` is called
**Then** the specified series data is cleared and the chart updates
**When** `chart.clearData()` is called (no argument)
**Then** all series are cleared

**Given** a GlideChart instance
**When** `chart.destroy()` is called
**Then** all DOM elements (canvases) are removed
**And** all event listeners are removed
**And** ResizeObserver is disconnected
**And** rAF loop is stopped
**And** no references are retained (GC-safe)

## Epic 5: Theming & Customization

Developer can fully customize the chart's appearance including themes, colors, grid, tooltips, gradients, and animation speed to match any design system.

### Story 5.1: Light & Dark Theme Presets

As a developer using Glide Chart,
I want built-in light and dark theme presets,
So that I can match my application's theme with a single config flag.

**Acceptance Criteria:**

**Given** `theme: 'dark'` is set in config
**When** the chart renders
**Then** background, grid, axes, line colors, and tooltip use the dark theme palette
**And** all colors meet WCAG 2.1 AA contrast ratios

**Given** `theme: 'light'` is set
**When** the chart renders
**Then** the light theme palette is applied

**Given** `chart.setConfig({ theme: 'dark' })` is called on a rendered chart
**When** the theme switches
**Then** all layers re-render with the new theme immediately

### Story 5.2: Per-Series Line Customization

As a developer using Glide Chart,
I want to customize line color and thickness per series,
So that each data series is visually distinct and matches my design system.

**Acceptance Criteria:**

**Given** a config with series-specific overrides (e.g., `{ id: 'price', color: '#00ff88', lineWidth: 3 }`)
**When** the chart renders
**Then** each series uses its configured color and thickness
**And** series without overrides use theme defaults

### Story 5.3: Grid, Gradient & Animation Customization

As a developer using Glide Chart,
I want to customize grid appearance, gradient fills, and animation speed,
So that every visual detail matches my platform's design language.

**Acceptance Criteria:**

**Given** grid config options (visibility, opacity, color, dash style)
**When** applied
**Then** grid lines render with the specified appearance
**And** grid can be hidden entirely with `grid: { visible: false }`

**Given** gradient config options (opacity, startColor, endColor)
**When** applied per-series
**Then** the gradient fill beneath each curve uses the specified colors and opacity

**Given** `animationSpeed` config
**When** new data arrives or dataset changes
**Then** transitions animate at the configured speed (0 = instant, higher = slower)

### Story 5.4: Custom Tooltip Formatting

As a developer using Glide Chart,
I want to customize tooltip content and formatting,
So that tooltips display data in my application's format and style.

**Acceptance Criteria:**

**Given** a developer provides a custom tooltip formatter function
**When** the crosshair activates
**Then** the custom formatter receives the data point(s) and returns formatted content
**And** the tooltip renders the custom content

**Given** no custom formatter
**When** the tooltip displays
**Then** default formatting is used (timestamp + value with configured precision)

## Epic 6: React Wrapper

React developer can use a <GlideChart /> component with props-driven configuration and proper lifecycle management.

### Story 6.1: React GlideChart Component

As a React developer,
I want a <GlideChart /> component that wraps the core API with props,
So that I can use Glide Chart idiomatically in React with declarative configuration.

**Acceptance Criteria:**

**Given** a React 18+ application
**When** I import `{ GlideChart }` from `'glide-chart/react'`
**Then** the import resolves correctly from the separate entry point

**Given** `<GlideChart series={[{ id: 'price', data: points }]} />`
**When** the component mounts
**Then** a GlideChart instance is created and renders in the component's container
**And** the smooth curve displays with beautiful defaults

**Given** props change (e.g., new data, config update)
**When** React re-renders
**Then** the underlying chart instance updates via `setData()` / `setConfig()` (not recreated)

**Given** the component unmounts
**When** React triggers cleanup
**Then** `chart.destroy()` is called and all resources are freed

**And** the component supports React Strict Mode (double-mount in dev)
**And** the component uses `ref` forwarding for imperative access to the chart instance
**And** TypeScript props types provide full autocomplete

### Story 6.2: React Streaming & Event Props

As a React developer,
I want to push streaming data and handle chart events via props,
So that I can integrate real-time feeds and user interactions the React way.

**Acceptance Criteria:**

**Given** a `data` prop that changes over time (new points appended)
**When** the prop updates
**Then** new points are pushed via `addData()` (not full dataset replace)

**Given** callback props like `onCrosshairMove`, `onZoom`
**When** the corresponding chart events occur
**Then** the React callbacks fire with the relevant data

**And** the component is tree-shakeable — importing only core (`glide-chart`) does not include React code

## Epic 7: Embeddable Widget & Distribution

Non-technical user can embed a chart with a single script tag and data attributes, and the UMD bundle is CDN-ready.

### Story 7.1: UMD Widget Bundle Build

As a developer distributing Glide Chart,
I want a standalone UMD bundle built from the widget entry point,
So that the chart can be loaded via a single script tag from a CDN.

**Acceptance Criteria:**

**Given** the build process runs
**When** the UMD build step executes
**Then** `dist/glide-chart.umd.js` is generated as a self-contained IIFE
**And** the global `GlideChart` namespace is available when no module loader is present
**And** the bundle does not conflict with other scripts on the page (NFR15)
**And** the bundle does not pollute the global namespace beyond `GlideChart` (NFR16)
**And** the UMD bundle size is within the total <50KB budget

### Story 7.2: HTML Data Attribute Configuration & Rendering

As a non-technical user,
I want to embed a chart using a div with data attributes and a single script tag,
So that I can add live charts to my website without writing any JavaScript.

**Acceptance Criteria:**

**Given** an HTML page with a script tag loading `glide-chart.umd.js` and a div with `data-glide-chart` attribute
**When** the script loads
**Then** the widget auto-discovers all `[data-glide-chart]` elements on the page
**And** creates a GlideChart instance for each with config parsed from data attributes

**Given** data attributes for theme, time window, and appearance
**When** parsed
**Then** the chart renders with the specified configuration

**Given** a `data-src` attribute pointing to a JSON endpoint
**When** the widget initializes
**Then** it fetches data from the URL and renders the chart

**And** multiple widget instances on the same page work independently
**And** no build step or framework is required
