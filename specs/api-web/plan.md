# api-web — plan

| Step | Task | Status |
|------|------|--------|
| 1 | `createServer`: router, JSON helpers, body reader w/ limit, error mapper | ☑ |
| 2 | Endpoints wired to store / ingest / query / followup | ☑ |
| 3 | Static file server with traversal guard + MIME map | ☑ |
| 4 | `serve` command in CLI (default port 3000, prints URL) | ☑ |
| 5 | Frontend: `index.html` skeleton, `styles.css` (tokens, light/dark, responsive) | ☑ |
| 6 | Frontend `app.js`: api client, render functions (textContent only), event wiring | ☑ |
| 7 | `test/server.test.js` AW-01…AW-17, WF-01 | ☑ |
| 8 | Browser smoke test WF-02 (done: ingest, filter, ambiguity flag, mark done, preview, create drafts) | ☑ |

Smoke checklist (WF-02): `npm run samples && npm start -- serve` → open http://127.0.0.1:3000 → ingest `notes` → verify 6 malformed listed → filter owner `Priya` (see ambiguity flag) → mark one done → preview *All owners* → create drafts → resize to phone width.
