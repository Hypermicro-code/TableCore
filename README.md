En lettvekts tabellmotor bygget for Manage‑systemet. Målet er Excel‑følelse uten tunge tredjeparts‑tabeller.


## Funksjoner i v0.1
- Markering (klikk/shift/drag), Ctrl/Cmd+C/V kopier/lim inn (TSV/CSV, Excel‑vennlig)
- Redigering i celle (dobbeltklikk/Enter), tall høyrejustert
- Radnummer skjules automatisk for tomme rader
- Dra‑og‑slipp rekkefølge: rader og kolonner
- Innrykk/utrykk (hierarki via Ctrl/Cmd+[ og Ctrl/Cmd+])
- Sammendragslinje (summerer number‑kolonner)
- Lys/mørk modus (enkel toggle)


## Kom i gang
1. Opprett et **nytt repo** (f.eks. \`tablecore-mvp\`).
2. Lag filene som angitt (se \`// File path\`‑kommentarer) og lim inn innholdet fra denne malen.
3. \`npm i\` og \`npm run dev\` lokalt, eller push til \`main\` for å bygge via GitHub Actions.
4. I repo‑innstillinger: **Pages** → Source: *GitHub Actions*. Ferdig.


## Bygg for Pages
Vi setter \`base\` i Vite når \`GITHUB_PAGES=true\` for korrekt assets‑sti. Actions‑workflow \`pages.yml\` bygger og publiserer \`dist\`.


## Videre etapper (forslag)
- Multi‑celle redigeringsmodus og autofyll (dra hjørne)
- Kolonne‑typer: select, checkbox, progress, formula (med eval‑sandbox)
- Tre‑folding (collapse/expand grupper), automatisk varighetsberegning
- Klipp/lim med formatering og datatyper
- Tastaturnavigasjon i utvalg (Shift+pil for å utvide)
- Virtuell rulling for svært store datasett
- Undo/redo stack
- Adapter‑lag mot domene (Progress/Estimates) via "TableGateway"
`;


// ─────────────────────────────────────────────────────────────────────────────
// HJELPEEXPORT: Aggregert utsyn for kopiering/lagring fra Canvas
// ─────────────────────────────────────────────────────────────────────────────
export default {
files: [
{ path: 'index.html', contents: INDEX_HTML },
{ path: 'package.json', contents: PACKAGE_JSON },
{ path: 'tsconfig.json', contents: TSCONFIG_JSON },
{ path: 'vite.config.ts', contents: VITE_CONFIG_TS },
{ path: 'src/main.tsx', contents: SRC_MAIN_TSX },
{ path: 'src/styles.css', contents: SRC_STYLES_CSS },
{ path: 'src/types.ts', contents: SRC_TYPES_TS },
{ path: 'src/useClipboard.ts', contents: SRC_USE_CLIPBOARD_TS },
{ path: 'src/TableCore.tsx', contents: SRC_TABLECORE_TSX },
{ path: 'src/App.tsx', contents: SRC_APP_TSX },
{ path: '.github/workflows/pages.yml', contents: GH_ACTIONS_PAGES },
{ path: 'README.md', contents: README_MD },
]
}
