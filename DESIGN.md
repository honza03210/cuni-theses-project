---
name: Bakalářské práce UK
description: A statistical yearbook you can steer. Two-colour print on warm paper, where petrol means "selected".
colors:
  paper: "#f6f4ee"
  paper-2: "#ece8de"
  paper-3: "#e2ddd0"
  ink: "#1c1f24"
  ink-2: "#464b53"
  ink-3: "#5f646b"
  rule: "#cdc7b8"
  rule-soft: "#e1dccf"
  petrol: "#1f5468"
  petrol-deep: "#163f4f"
  petrol-tint: "#d9e6ea"
  on-petrol: "#f6f4ee"
  on-petrol-2: "#c5d6dc"
  rise: "#0b5fa5"
  fall: "#a8430d"
  avg: "#c43c14"
  context: "#b8b2a4"
  grade-1: "#2c7bb6"
  grade-2: "#abd9e9"
  grade-3: "#fdae61"
  grade-4: "#d7191c"
  warn: "#8a5a00"
typography:
  headline:
    fontFamily: "'Source Sans 3', 'Source Sans Pro', system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
    fontFeature: "'tnum' 1, 'lnum' 1"
  title:
    fontFamily: "'Source Sans 3', 'Source Sans Pro', system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 700
    lineHeight: 1.25
    fontFeature: "'tnum' 1, 'lnum' 1"
  tab:
    fontFamily: "'Source Sans 3', 'Source Sans Pro', system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "'Source Sans 3', 'Source Sans Pro', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "'tnum' 1, 'lnum' 1"
  control:
    fontFamily: "'Source Sans 3', 'Source Sans Pro', system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "'tnum' 1, 'lnum' 1"
  label:
    fontFamily: "'Source Sans 3', 'Source Sans Pro', system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.06em"
  caption:
    fontFamily: "'Source Sans 3', 'Source Sans Pro', system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
  chart:
    fontFamily: "'Source Sans 3', 'Source Sans Pro', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1
    fontFeature: "'tnum' 1"
rounded:
  hair: "1px"
  xs: "2px"
  sm: "3px"
  full: "50%"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "24px"
  s6: "32px"
  s7: "48px"
components:
  header-band:
    backgroundColor: "{colors.petrol-deep}"
    textColor: "{colors.on-petrol}"
    typography: "{typography.title}"
  view-tab:
    backgroundColor: "{colors.petrol-deep}"
    textColor: "{colors.on-petrol-2}"
    typography: "{typography.tab}"
    rounded: "3px 3px 0 0"
    padding: "10px 18px 9px"
  view-tab-selected:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.tab}"
    rounded: "3px 3px 0 0"
    padding: "10px 18px 9px"
  segmented-button:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-2}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    padding: "3px 10px"
  segmented-button-active:
    backgroundColor: "{colors.petrol}"
    textColor: "{colors.on-petrol}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    padding: "3px 10px"
  button-quiet:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    padding: "5px 12px"
  button-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "6px 14px"
  filter-column:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.ink}"
    width: "272px"
    padding: "16px 16px 32px"
  filter-row-hover:
    backgroundColor: "{colors.paper-3}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.xs}"
    padding: "3px 4px"
  choice-row-active:
    backgroundColor: "{colors.petrol-tint}"
    textColor: "{colors.ink}"
    padding: "7px 8px 7px 6px"
  tooltip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    padding: "8px 10px"
    width: "280px"
---

# Design System: Bakalářské práce UK

## Overview

**Creative North Star: "The Steerable Yearbook"**

The explorer is printed, not rendered. It takes its material from the two-colour Czech Statistical Yearbook: a warm paper ground, near-black ink, and one petrol-blue second colour. Every chart is set as a yearbook plate, with a tinted header band (paper-2, 4px top corners) holding a bold figure title, a grey unit line, the figure itself, and a small footer that ends in an italic source line. Each plate can flip into its ruled table. Below the header band, separation comes from 1px hairline rules, never from boxes or card backgrounds, so the page reads as a ruled sheet rather than a grid of floating widgets.

The density is high and deliberate: small faceted multiples, a 13 px control size, tabular numerals in every place a number appears, and a persistent filter column that shows its live count at the top. Colour is spent with care. Petrol marks what the reader has selected or activated, and the darker petrol-deep is used only for the masthead band. All other colour is data colour, and each data colour has one fixed meaning.

Motion is small and practical. State changes use a 180 ms ease-out, the mobile filter drawer slides in over 220 ms, and everything collapses to instant changes under reduced motion.

**Key Characteristics:**
- Warm paper ground, near-black ink, and one petrol second colour that means "selected / active".
- The yearbook plate: a tinted header band, title, unit line, figure, and source footer, with a Chart / Table toggle.
- Hairline rules instead of boxes, and crisp 1px axes.
- One family (Source Sans 3) with tabular, lining numerals everywhere.
- Data colours with fixed meanings that stay readable for colour-blind readers, backed up by line style or hatching.
- Nothing disappears: excluded or unselected data stays visible as faint warm-grey context.

## Colors

The ground is warm paper and the text is near-black ink. The single structural colour is petrol, and data colours are layered on top.

### Primary
- **Yearbook Petrol** (petrol): the colour of the current selection and the active state, and nothing else. It is used for the pressed segment, the chosen word in the cloud, the selected-year pill and line, the year-range fill and its thumbs, the brush rectangle in the parallel plot, the hover series in trends, checkbox and radio accents, the focus ring, and text selection.
- **Masthead Petrol** (petrol-deep): only for the sticky header band and the favicon ground. It is the frame of the page, not a state.
- **Petrol Wash** (petrol-tint): the background of an active choice row (the trends metric picker), the halo behind the selected word, and the focus halo on slider thumbs.
- **On-Petrol Paper / On-Petrol Mist** (on-petrol, on-petrol-2): primary and secondary text on the masthead band.

### Secondary (data)
- **Rise Blue** (rise): words used more than their trend predicts. It is the bold half of the word cloud and its tables.
- **Fall Rust** (fall): words used less than their trend predicts.
- **Average Vermilion** (avg): the selection average and the university reference. It is always drawn as a 2.1px dashed line (5 3) and never as a solid line.
- **Grade ramp** (grade-1 Excellent Blue, grade-2 Pale Sky, grade-3 Apricot, grade-4 Fail Red): a diverging blue-to-red ramp for grades 1 to 4. Grade 4 is also hatched (45° stripes, 5px pitch), so it does not depend on hue alone. The canvas parallel plot reuses the same hex values through `GRADE_HEX`.
- **Caution Ochre** (warn): small-sample and data-caveat warnings (600 weight), and the AI-declaration marker line in trends.

### Neutral
- **Yearbook Paper** (paper): the page ground, plate tables, tooltip and button grounds, and the selected view tab, which opens onto the page.
- **Filter Paper** (paper-2): the filter column, row hover in tables and pickers, and loading skeletons.
- **Pressed Paper** (paper-3): hover inside the filter column.
- **Ink** (ink): text, axis lines in the parallel plot, and the focal series ("this faculty").
- **Ink Grey** (ink-2): secondary text, chart labels, table headers, and the fitted-trend line.
- **Ink Light** (ink-3): unit lines, captions, counts, the ChatGPT marker, and axis domains.
- **Rule / Soft Rule** (rule, rule-soft): hairlines, segmented-control borders, table row rules, and grid lines.
- **Context Stone** (context): the "others" and excluded data that stays on screen as background context.

### Named Rules
**The One Meaning Rule.** Petrol means "selected / active". If a control is not reporting a selection or an active state, it is ink on paper. Neutral actions like reset, retry, clear-selection and the All / None quick links never use petrol.

**The Nothing Disappears Rule.** Data excluded by a filter, a brush or a focus change stays on screen in context stone (or a light warm grey at low opacity on canvas). It never vanishes.

**The Redundant Encoding Rule.** No data colour carries meaning alone. The average is dashed, an incomplete year is dotted (1.5 3), grade 4 is hatched, and rise words are bold while fall words are regular weight.

## Typography

**Display Font:** none (there is no display tier)
**Body Font:** Source Sans 3 (fallback Source Sans Pro, system-ui), self-hosted at 400, 400 italic, 600 and 700
**Label/Mono Font:** the same family; numerals are set with `tabular-nums lining-nums` on `:root`

**Character:** One workmanlike humanist sans that reads like a statistical office's house face. Hierarchy comes from weight and rules rather than size. The one deliberate exception is the answer line (Lede, 21px) above each view: the finding is the largest text on the screen; below it, the 24px filter count is the largest.

### Hierarchy
- **Headline** (700, 1.5rem, -0.01em): the live count at the top of the filter column. It is the only large number on the page.
- **Title** (700, 1.0625rem, 1.25, balanced wrap): plate titles and the masthead wordmark.
- **Tab** (600, 0.9375rem): view tabs in the masthead, and metric names in the trends picker.
- **Body** (400, 1rem, 1.45): messages and empty states, kept to 60 to 70ch.
- **Control** (400, 0.8125rem): filter rows, segmented controls, legends, tables, tooltips, and plate unit lines (unit lines are in ink-3).
- **Label** (700, 0.75rem, 0.06em, uppercase): only for the legends of control groups (FACULTY, YEARS, LANGUAGE, METRIC) and the CS / EN switch.
- **Caption** (400, 0.75rem, 1.5): plate footers, notes, and counts. The source line is the only italic text in the system.
- **Chart** (400, 12px; 10–11px for dense ticks and markers): SVG axis and annotation text in ink-2, with tabular numerals.

### Named Rules
**The Single Family Rule.** Source Sans 3 is the only family, and italic is reserved for the source line.

**The Tabular Rule.** Every number is set in tabular, lining figures so columns and axis labels line up.

## Layout

The page is an app shell on a CSS grid. A sticky masthead band spans the full width and ends in a 3px ink bottom rule. Below it, a 272px filter column on the left is sticky to the viewport and scrolls on its own, with a 1px rule on its right edge. The work area on the right is padded 24 / 32 / 48px (top, sides, bottom). Inside a view, plates stack with a 32px (s6) gap. The trends view adds a right-hand metric picker that is also sticky.

Spacing follows a 4px base scale: 4, 8, 12, 16, 24, 32, 48. Space inside a plate is tight (8px around the header, 12px around the figure). Control rows are dense, with 3–7px vertical padding.

Responsive behaviour:
- **Below 1280px:** the trends picker moves above the chart and becomes a wrapping row of bordered choice chips with no descriptions.
- **Below 1024px:** the grid collapses to one column. View tabs move to a second row of the band and can scroll sideways. The filter column becomes an off-canvas drawer, min(320px, 88vw) wide, behind a 30% ink scrim and opened from a band button. The work area padding drops to 16px.
- **Below 640px:** plate headers stack, with the tools (toggles) under the title and aligned left.

Year axes use a tick stride from 1, 2, 4, 5 or 10 years, chosen so labels stay at least 38px apart. Tick labels next to the selected-year pill are hidden.

## Elevation & Depth

The system is flat. Depth comes from rules and two paper tones, not from shadows. The filter column sits one tone darker (paper-2) than the page, and the selected view tab takes on the page colour so it looks like a notch cut out of the masthead.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 4px 14px rgb(28 31 36 / 0.14)`): the hover tooltip only, together with a 1px ink border.
- **Drawer** (`box-shadow: 4px 0 24px rgb(28 31 36 / 0.18)`): the mobile filter drawer, over a `rgb(28 31 36 / 0.3)` scrim.
- **Swatch edge** (`box-shadow: inset 0 0 0 1px rgb(28 31 36 / 0.25)`): an inner outline on the legend swatches for pale grade colours.
- **Focus halo** (`box-shadow: 0 0 0 3px` petrol-tint): on slider thumbs.

### Named Rules
**The Flat Sheet Rule.** Surfaces at rest have no shadow. A shadow means a layer that floats above the sheet for a moment (a tooltip or the drawer), never a card.

## Shapes

Corners are nearly square. Buttons, segmented controls and choice chips use a 3px radius. Hover fills on filter rows use 2px. Legend swatches use 1px. Circles appear only for slider thumbs and dot markers. View tabs round only their top corners (3px) so they join the paper below.

Borders are hairlines: 1px rule for controls and tables, and 1px ink under table headers. The plate's signature is a stack of rules on top, 2px ink, a 1px gap, then 1px ink, mirrored by a 1px rule under the header and above the footer. Axes are 1px and `crispEdges`. Line weights in charts carry meaning: the focus series is about 2px, the context lines 1–1.25px, and the average line 2.1px dashed.

## Components

### Yearbook Plate (signature)
- **Structure:** a tinted header band (`--plate-head`, paper-2, 10px × 16px padding, 4px top radius, hairline below). The band holds the title (Title role) and the unit line (Control role, ink-3) on the left and the tools on the right. Below that come the figure, then a caption footer with an optional note (at most 110ch) and an italic source line.
- **Table mode:** a Chart / Table segmented toggle swaps the figure for a ruled table. Headers are 600 weight in ink-2 with a 1px ink rule underneath and stay fixed while scrolling. Rows are 3px × 10px with soft-rule dividers and a paper-2 hover. Numbers are right-aligned and the first column is left-aligned. The table scrolls inside a 560px maximum height.

### Buttons
- **Shape:** squared-off (3px radius).
- **Segmented toggle:** 1px rule border, transparent segments in ink-2, paper-2 on hover, petrol with on-petrol text when pressed. Used for Chart / Table and for view modes.
- **Quiet button** (reset): paper ground, 1px rule border that turns ink-3 on hover.
- **Ink button** (retry): solid ink with paper text. It is the strongest neutral action, and it does not use petrol.
- **Quick links** (All / None): 600 weight, 0.75rem ink text with a rule-coloured underline that turns ink on hover over a paper-3 wash.

### Chips
- **Choice chip** (trends picker below 1280px): a 1px soft-rule border with a 3px radius. The active chip gets a petrol-tint ground.
- **Grade toggles** (parallel plot): bordered buttons with a swatch. An "off" grade fades its swatch to 25%.

### Inputs / Fields
- **Checkbox rows:** a grid of checkbox / abbreviation (600) / name (ink-2, ellipsis) / count (ink-3, xs). Checkboxes use a petrol accent and rows get a paper-3 hover.
- **Year range:** a 2px rule track with a 2px petrol fill and hollow petrol-ringed thumbs on paper. Focus fills the thumb with petrol and adds a petrol-tint halo. The current range sits above the track in 600 weight at 1.0625rem.
- **Disabled groups:** the whole fieldset drops to 55% opacity.
- **Warnings:** inline text in caution ochre at 600 weight, never shown as a banner.

### Navigation
- **Masthead band:** petrol-deep, sticky, with a 3px ink bottom rule. The wordmark is Title weight in on-petrol, with a caption-sized subtitle in on-petrol-2.
- **View tabs:** on-petrol-2 text that turns on-petrol over a 7% white wash on hover. The selected tab is paper with ink text and sits on the bottom edge like a folder tab. Arrow keys move between tabs.
- **Locale switch:** a CS / EN pair in uppercase labels inside a 35% paper border. The pressed side shows on-petrol paper with petrol-deep text.

### Tooltip
A paper box with a 1px ink border and the float shadow, at most 280px wide. It has a bold title, then rows with labels in ink-2 and values in ink (600 weight) at opposite ends, plus 9px swatches.

### Chart grammar
- **ChatGPT marker:** a 1px dashed vertical line (2 3) at mid-November 2022 in ink-3 (ink on grade areas), labelled "ChatGPT" in the first panel only (small multiples) or in every large chart.
- **Incomplete year:** the last segment of the line is dotted (1.5 3).
- **Selected year:** a petrol line with a petrol pill label in paper text, drawn as a 14px rounded paint-order stroke.
- **Word size:** a fixed 5-step ramp (13, 16, 21, 28, 38 px), shown in the legend as "Aa" specimens.
- **Dense data:** drawn on canvas. Density layers are tinted with the exact grade hex values using source-in compositing, and brushed-out lines fall back to warm grey at 0.3 opacity.

## Do's and Don'ts

### Do:
- **Do** set every chart as a yearbook plate: a tinted header band, title, unit line, figure, a footer with an italic source line, and a Table toggle wherever the data has a table form.
- **Do** keep petrol for selection and active state only, and give neutral actions ink or rule treatments.
- **Do** keep excluded or deselected data visible in context stone instead of removing it.
- **Do** back up every data colour with a second cue: dashes for averages, dots for incomplete years, hatching for grade 4, and weight for rising words.
- **Do** use tabular, lining numerals and right-align numbers in tables.
- **Do** separate regions with 1px rule or rule-soft hairlines and paper tone changes.
- **Do** keep warnings and caveats inline in caution ochre, next to the chart they qualify.

### Don't:
- **Don't** put a chart in a rounded, shadowed card. Plates are ruled, not boxed.
- **Don't** use petrol for decoration, headings, neutral buttons, or as a data series colour.
- **Don't** draw the average or university reference as a solid line, or in any colour other than avg.
- **Don't** add a second type family or a display face. Italic is for the source line only.
- **Don't** put an uppercase label above a plate title. Uppercase tracking is for control-group legends only.
- **Don't** use shadows on surfaces at rest. Only the tooltip and the mobile drawer float.
- **Don't** use the grade ramp or rise / fall colours for anything other than grades and word movement.

## Themes

A light theme (the paper sheet) and a dark theme (charcoal sheet, light ink) share every rule above. The dark theme follows the OS preference until the viewer picks one with the sun/moon switch in the masthead; the pick is stored in `localStorage` (`cuni-theses-theme`) and applied before first paint by an inline script in `index.html`. Dark overrides live in `web/src/app.css` under `@media (prefers-color-scheme: dark)` (guarded by `:root:not([data-theme='light'])`) and `:root[data-theme='dark']`: paper #16191d / #1d2126 / #272c32, ink #e9e6df / #bdbab3 / #9a978f, petrol #6fb3cd (with dark `--on-petrol`), rise #6aaeea, fall #e8925a, avg #f2724a. Grade colours are shared by both themes. Masthead text uses its own `--band-ink` tokens so the selection colour can change per theme without touching the band.

## Answer line (Lede)

Each view opens with one computed, plain-language finding in the Lede role (21px, bold clause plus muted context). Below it is a "How to read this view" disclosure (`web/src/lib/ui/Lede.svelte`). The finding comes from `web/src/lib/data/answers.ts` and is never hand-written. Words in it are links that select the word, coloured with `--rise` / `--fall`. Plate titles step up to 20px, so the scale reads: answer line 21 → plate title 20 → body 16 → controls 13.
