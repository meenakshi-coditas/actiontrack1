'use strict';

const path = require('path');
const { UsageError, NotFoundError } = require('./errors');
const { openStore } = require('./store');
const { ingestFolder } = require('./ingest');
const { listItems, resolveToday } = require('./query');
const { buildFollowups, fileSink, createDrafts } = require('./followup');

const USAGE = `actiontrack - track meeting action items and draft follow-ups (never sends)

Usage:
  actiontrack ingest <folder>
  actiontrack list [--owner <name>] [--status open|done|overdue] [--due-before <YYYY-MM-DD>] [--json]
  actiontrack done <id>
  actiontrack followup <owner> | --all  [--out <dir>] [--preview | --json]
  actiontrack serve [--port 3000]

Global options:
  --db <file>       database file (default ./.actiontrack/db.json, env ACTIONTRACK_DB)
  --today <date>    override today's date (env ACTIONTRACK_TODAY)
  --help            show this help
`;

const BOOL_FLAGS = new Set(['json', 'all', 'preview', 'help']);
const VALUE_FLAGS = new Set(['owner', 'status', 'due-before', 'db', 'today', 'out', 'port']);

function parseArgs(argv) {
  const flags = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { pos.push(a); continue; }
    let name = a.slice(2);
    let inline = null;
    const eq = name.indexOf('=');
    if (eq >= 0) { inline = name.slice(eq + 1); name = name.slice(0, eq); }
    if (BOOL_FLAGS.has(name)) { flags[name] = true; continue; }
    if (!VALUE_FLAGS.has(name)) throw new UsageError(`Unknown option --${name}`);
    const value = inline !== null ? inline : argv[++i];
    if (value === undefined || (inline === null && value.startsWith('--'))) throw new UsageError(`Option --${name} needs a value`);
    flags[name] = value;
  }
  return { flags, pos };
}

function pad(s, n) { s = String(s); return s.length >= n ? s : s + ' '.repeat(n - s.length); }
function clip(s, n) { s = String(s); return s.length > n ? `${s.slice(0, n - 3)}...` : s; }

function formatTable(rows) {
  const head = ['ID', 'STATUS', 'OWNER', 'DUE', 'TASK', 'SOURCE'];
  const body = rows.map((it) => {
    const src = it.sources[0];
    return [
      it.id,
      it.displayStatus,
      it.owner ? (it.ownerStatus === 'ambiguous' ? `${it.owner} (?)` : it.owner) : '-',
      it.due || '-',
      clip(it.task, 56),
      `${src.file}:${src.line}${it.sources.length > 1 ? ` (+${it.sources.length - 1})` : ''}`,
    ];
  });
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((r) => r[i].length)));
  const line = (r) => r.map((c, i) => pad(c, widths[i])).join('  ').trimEnd();
  return [line(head), ...body.map(line)].join('\n');
}

function formatReport(r) {
  const out = [
    `Ingested ${r.folder}`,
    `  Files scanned: ${r.filesScanned} | parsed: ${r.parsed} | malformed: ${r.malformed.length}`,
    `  Action items found: ${r.itemsFound} (new ${r.created}, duplicates merged ${r.merged}, already known ${r.unchanged})`,
    `  Unassigned: ${r.unassigned} | No due date: ${r.noDue} | Ambiguous owners: ${r.ambiguousOwners} | Unknown owners: ${r.unknownOwners}`,
  ];
  if (r.malformed.length) {
    out.push('Malformed notes (skipped):');
    for (const m of r.malformed) out.push(`  - ${m.file}: ${m.reason} - ${m.detail}`);
  }
  if (r.warnings.length) {
    out.push('Warnings:');
    for (const w of r.warnings) out.push(`  - ${w.file}: ${w.message}`);
  }
  return out.join('\n');
}

function describeSkipped(s) {
  switch (s.reason) {
    case 'unassigned': return `Skipped ${s.count} unassigned item(s): no recipient.`;
    case 'ambiguous': return `Skipped ambiguous owner "${s.owner}" (${s.count} item(s)); could be: ${s.candidates.join(', ')}.`;
    case 'nothing-open': return `${s.owner} has no open or overdue items; no draft created.`;
    default: return `Skipped: ${s.reason}`;
  }
}

async function main(argv, io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const cwd = io.cwd || process.cwd();
  const env = io.env || process.env;
  const out = (s) => stdout.write(`${s}\n`);

  try {
    const { flags, pos } = parseArgs(argv);
    if (flags.help) { out(USAGE); return 0; }
    const command = pos[0];
    if (!command) { stderr.write(`${USAGE}\n`); return 2; }

    const dbPath = path.resolve(cwd, flags.db || env.ACTIONTRACK_DB || path.join('.actiontrack', 'db.json'));
    const today = resolveToday({ today: flags.today, env });

    switch (command) {
      case 'ingest': {
        if (!pos[1]) throw new UsageError('ingest needs a folder: actiontrack ingest <folder>');
        const store = openStore(dbPath);
        out(formatReport(ingestFolder(store, path.resolve(cwd, pos[1]))));
        return 0;
      }
      case 'list': {
        const store = openStore(dbPath);
        const rows = listItems(store.items(), { owner: flags.owner, status: flags.status, dueBefore: flags['due-before'] }, today);
        if (flags.json) out(JSON.stringify(rows, null, 2));
        else out(rows.length ? formatTable(rows) : 'No items.');
        return 0;
      }
      case 'done': {
        if (!pos[1]) throw new UsageError('done needs an id: actiontrack done <id>');
        const store = openStore(dbPath);
        const { item, already } = store.markDone(pos[1]);
        if (already) { out(`${item.id} was already done.`); return 0; }
        store.save();
        out(`${item.id} marked done: ${item.owner || 'unassigned'} - ${item.task}`);
        return 0;
      }
      case 'followup': {
        if (!pos[1] && !flags.all) throw new UsageError('followup needs an owner name or --all');
        const store = openStore(dbPath);
        const { drafts, skipped } = buildFollowups(store.items(), store.people(), { owner: pos[1], all: !!flags.all, today });
        if (flags.json) {
          out(JSON.stringify({ drafts, skipped, sent: false }, null, 2));
          return 0;
        }
        if (flags.preview) {
          for (const d of drafts) {
            out(`--- Draft for ${d.owner} ---\nTo: ${d.to || '(no address on file)'}\nSubject: ${d.subject}\n\n${d.body}\n`);
          }
          skipped.forEach((s) => out(describeSkipped(s)));
          out(drafts.length ? 'Preview only - nothing was written or sent.' : 'No follow-up drafts to create.');
          return 0;
        }
        const dir = path.resolve(cwd, flags.out || path.join(path.dirname(dbPath), 'drafts'));
        const created = createDrafts(drafts, fileSink(dir));
        created.forEach((c) => out(`Draft created for ${c.owner}: ${c.path}`));
        skipped.forEach((s) => out(describeSkipped(s)));
        out(created.length ? 'Nothing was sent. Drafts are unsent .eml files for your review.' : 'No follow-up drafts to create. Nothing was sent.');
        return 0;
      }
      case 'serve': {
        const { startServer } = require('./server');
        const port = flags.port ? Number(flags.port) : 3000;
        if (!Number.isInteger(port) || port < 0 || port > 65535) throw new UsageError(`Invalid --port "${flags.port}"`);
        const { server, url } = await startServer({ dbPath, port, cwd, today: flags.today || env.ACTIONTRACK_TODAY || null });
        out(`actiontrack dashboard running at ${url} (Ctrl+C to stop)`);
        await new Promise((resolve) => process.once('SIGINT', () => { server.close(); resolve(); }));
        return 0;
      }
      default:
        throw new UsageError(`Unknown command "${command}". Run with --help.`);
    }
  } catch (e) {
    if (e instanceof UsageError) { stderr.write(`Error: ${e.message}\n`); return 2; }
    if (e instanceof NotFoundError || e.name === 'StoreError') { stderr.write(`Error: ${e.message}\n`); return 1; }
    stderr.write(`Internal error: ${e && e.message ? e.message : e}\n`);
    if (env.ACTIONTRACK_DEBUG === '1' && e && e.stack) stderr.write(`${e.stack}\n`);
    return 1;
  }
}

module.exports = { main, parseArgs };
