# beMatrix LED Cable Planner

Local single-page planner for beMatrix LED panel stringing.

## What it does

- asks for panel height and width
- plans strings starting bottom-left
- snakes up/down by column
- caps each string at 12 panels
- prefers keeping strings on full columns instead of breaking mid-column
- counts:
  - processor/data home runs
  - dedicated power drops / 20A outlets
  - daisy-chain jumper cables
- draws a simple color-coded diagram
- previews and downloads a true-resolution JPG pixel map with a 192 × 192 px grid per panel, checkerboarded with light and dark shades for each data string
- supports drag-and-drop panel swaps and moves into empty expansion slots for custom wall shapes, updating every diagram and pixel map together
- adds panels by dragging a new-panel tile into the layout and removes panels with either a delete control or trash drop zone

## Run it

From this folder:

```bash
python3 -m http.server 8031
```

Then open:

- http://127.0.0.1:8031

## Current assumption

If a column is taller than 12 panels, the planner warns and splits strings mid-column because there is no other way to stay under the 12-panel data limit.
