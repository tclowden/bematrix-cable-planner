# beMatrix LED Cable Planner

Local single-page planner for beMatrix LED panel stringing.

## What it does

- asks for panel height and width
- plans strings starting bottom-left
- snakes up/down by column
- caps each data string at 12 panels for MX20/MX30 or 16 panels for MX40
- prefers keeping strings on full columns instead of breaking mid-column
- counts:
  - processor/data home runs
  - dedicated power drops / 20A outlets
  - daisy-chain jumper cables
- draws a simple color-coded diagram
- previews and downloads a true-resolution JPG pixel map with a 192 × 192 px grid per panel, checkerboarded with light and dark shades for each data string
- supports drag-and-drop panel swaps and moves into empty expansion slots for custom wall shapes, updating every diagram and pixel map together
- adds panels by dragging a new-panel tile into the layout and removes panels with either a delete control or trash drop zone
- exports and imports versioned JSON project files containing job details, custom layout, and data/power string assignments
- creates controller-aware NovaStar VMP `.nprj` files from a known-good template, preserving controller firmware and receiving-card settings while replacing cabinet positions, Ethernet port assignments, and connection order

## VMP export

Choose **Create VMP .nprj** to generate a single-controller VMP 1.5 project using the selected MX20, MX30, or MX40 model-specific template. The processor uses the IP entered in the planner, or `192.168.0.10` when blank. Its source defaults to Internal, with the generated LED layout positioned at the top-left of and scaled over the source.

## Run it

From this folder:

```bash
python3 -m http.server 8031
```

Then open:

- http://127.0.0.1:8031

## Current assumption

If a column is taller than the selected processor's data limit, the planner warns and splits strings mid-column.
