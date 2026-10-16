# Module 9 — api-web (`src/server.js`, `web/`)

## Goal
A local backend (REST over Node `http`) and a browser dashboard over the same modules the CLI uses. No logic is duplicated — handlers call ingest/query/followup/store.

## REST API (all JSON)
| Method & path | Purpose |
|---|---|
| `GET /api/summary` | `{open, overdue, done, unassigned, total, today}` |
| `GET /api/items?owner=&status=&dueBefore=` | filtered items with `displayStatus`, `daysOverdue` |
| `GET /api/owners` | `ownersSummary` |
| `POST /api/items/:id/done` | mark done → `{item, already}` |
| `POST /api/ingest` body `{folder}` | run ingest → report |
| `GET /api/ingest/last` | latest stored report or `null` |
| `POST /api/followup` body `{owner?|all?, preview?}` | preview drafts or create `.eml` drafts → `{drafts, skipped, created}` |
| `GET /*` | static files from `web/` (`/` → `index.html`) |

## Requirements
| ID | Requirement |
|----|-------------|
| AW-R1 | Server factory `createServer({db, today?, draftsDir, webDir})` is testable (listen on port 0). |
| AW-R2 | Binds `127.0.0.1` only. |
| AW-R3 | Errors are JSON `{error}`: `UsageError`→400, unknown id/route→404, other→500 (no stack in body). Unsupported method → 405. |
| AW-R4 | JSON body limit 1 MB (else 413); invalid JSON ⇒ 400. |
| AW-R5 | Static serving blocks path traversal (`/../`, encoded variants) ⇒ 403/404. Correct `Content-Type` for html/js/css. |
| AW-R6 | `POST /api/followup` with `preview:true` writes nothing; without it writes `.eml` files; response always includes `"sent": false`. No endpoint sends mail. |
| AW-R7 | Relative `folder` in ingest resolves against the server's working directory. |
| AW-R8 | State is re-read per request so CLI and web stay consistent. |

## Frontend requirements (`web/index.html`, `app.js`, `styles.css`; no build step)
| ID | Requirement |
|----|-------------|
| WF-R1 | Summary cards: open, overdue, done, unassigned. |
| WF-R2 | Ingest panel: folder input (default `notes`), button, result with counts and a list of malformed files + reason. |
| WF-R3 | Items table with filters: owner (select populated from `/api/owners` + `unassigned`), status (any/open/overdue/done), due-before date. Columns: ID, status badge, owner (ambiguity flagged), due (+ days overdue), task, sources count / first file. |
| WF-R4 | `Mark done` button per non-done row; table and cards refresh. |
| WF-R5 | Followup panel: owner select (or *All owners*), **Preview** (shows subject/to/body) and **Create drafts** (shows written file paths). A visible note states drafts are never sent. |
| WF-R6 | All note-derived text is rendered with `textContent` (never `innerHTML`) — XSS-safe. |
| WF-R7 | Responsive layout, light/dark via `prefers-color-scheme`, keyboard-focusable controls, error banner for failed calls. |
