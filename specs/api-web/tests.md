# api-web — test cases
Backend tests start `createServer` on port 0 with a temp db/notes and use `fetch` (Node 18). Frontend is verified by static checks + a manual/browser smoke checklist.

| ID | Req | Scenario | Expected |
|----|-----|----------|----------|
| AW-01 | R1,R2 | server address | host `127.0.0.1` |
| AW-02 | – | `POST /api/ingest {folder}` then `GET /api/summary` | counts match report; `GET /api/ingest/last` equals report |
| AW-03 | – | `GET /api/items?status=overdue&owner=Priya` | filtered; each has `displayStatus` |
| AW-04 | – | `GET /api/items?status=late` | 400 `{error}` |
| AW-05 | – | `POST /api/items/AT-0001/done` ×2 | 200 `already:false` then `already:true` |
| AW-06 | R3 | `POST /api/items/AT-9999/done` | 404 |
| AW-07 | R3 | unknown route `/api/nope` | 404 JSON |
| AW-08 | R3 | `DELETE /api/items` | 405 |
| AW-09 | R4 | POST ingest invalid JSON / >1 MB | 400 / 413 |
| AW-10 | R5 | `GET /` | 200 html; `/app.js` content-type JS |
| AW-11 | R5 | `GET /..%2f..%2fpackage.json`, `/%2e%2e/src/cli.js` | 403 or 404, never file contents |
| AW-12 | R6 | followup `{all:true, preview:true}` | drafts returned, drafts dir empty, `sent:false` |
| AW-13 | R6 | followup `{owner:'Priya Sharma'}` | `.eml` exists, `created` lists path, `sent:false` |
| AW-14 | R6 | followup `{owner:'Priya'}` with two Priyas | 400 naming candidates |
| AW-15 | R7 | ingest `{folder:'rel/notes'}` relative to cwd | works |
| AW-16 | R8 | mark done via `store` directly, then `GET /api/items` | reflects without restart |
| AW-17 | R6 | scan `server.js` routes | no route/handler mentions send |
| WF-01 | WF-R6 | static scan of `web/app.js` | no `innerHTML`/`outerHTML`/`insertAdjacentHTML` usage |
| WF-02 | WF-R1…R5,R7 | browser smoke checklist (see plan.md): ingest sample notes, filter, mark done, preview, create drafts, narrow viewport | all pass |
