# 🔍 Mystery Grid Reveal

An educational web game that turns worksheets into image-reveal puzzles.

## How It Works

1. Students pick a worksheet from the launcher screen.
2. A hidden image is covered by a grid of tiles.
3. Each correct answer reveals a tile.
4. Wrong answers trigger a glitch-peek of the image — and an optional **gamble** to risk a tile for a chance at double reveal.
5. Complete all questions to uncover the full image.

## Built For

- **Ages:** 10–16 (Singapore curriculum)
- **Subjects:** Maths, Science, Physics, Chemistry
- **Device:** Mobile-first (works on any screen ≥ 320px)

## Setup

1. Fork or clone this repo.
2. Edit `config.js` — set your `GITHUB_USER`, `GITHUB_REPO`, `GITHUB_BRANCH`.
3. Enable **GitHub Pages** in Settings → Pages → Deploy from `main` / root.
4. Your game is live at `https://<user>.github.io/<repo>/`

## Adding Worksheets

1. Create a `.json` file in the appropriate `Questions/` subfolder.
2. Add an entry to `Questions/index.json`.
3. Done — it appears on the launcher automatically.

## Folder Structure