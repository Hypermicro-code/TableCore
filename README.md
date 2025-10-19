# TableCore v0.1 – MVP

En lettvekts tabellmotor bygget for Manage-systemet. Målet er Excel-følelse uten tunge tredjeparts-tabeller.

## Funksjoner i v0.1
- Markering (klikk/shift/drag), Ctrl/Cmd+C/V kopier/lim inn (TSV/CSV, Excel-vennlig)
- Redigering i celle (dobbeltklikk/Enter), tall høyrejustert
- Radnummer skjules automatisk for tomme rader
- Dra-og-slipp rekkefølge: rader og kolonner
- Innrykk/utrykk (hierarki via Ctrl/Cmd+[ og Ctrl/Cmd+])
- Sammendragslinje (summerer number-kolonner)
- Lys/mørk modus (toggle)

## Kom i gang
1. Opprett et nytt repo (f.eks. `tablecore-mvp`).
2. Opprett filene og mappene som vist i prosjektet og lim inn innholdet fra denne READMEen.
3. `npm i` og `npm run dev` lokalt, eller commit/push til `main` for GitHub Pages.
4. I repo-innstillinger: **Settings → Pages** → Source: *GitHub Actions*.

> **GitHub Pages base-path:** I `vite.config.ts` er `base` satt til `/tablecore-mvp/` når `GITHUB_PAGES=true`. Bytt ut med ditt repo-navn dersom du bruker noe annet.

## Videre etapper
- Autofyll (dra fra cellehjørne), multi-celle redigering
- Kolonnetyper: select, checkbox, progress, formula (sikker eval)
- Fold/expand grupper, varighetsberegning (Progress), kalkylefunksjoner (Estimates)
- Virtuell rulling, undo/redo
