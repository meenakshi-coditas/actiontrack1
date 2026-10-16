import fs from 'node:fs';
import path from 'node:path';
import { UsageError, NotFoundError, StoreError, IntegrationError } from './errors.js';
import { openDatabase } from './db.js';
import { Repository } from './repository.js';
import { ingestFolder } from './ingest.js';
import { listTasks, resolveToday } from './query.js';
import { resolveOwnerQuery } from './owners.js';
import { buildFollowups, loadContacts } from './followup.js';
import { GMAIL_TOOL, buildCreateDraftArgs, loadGateway, createDrafts, recordExternalResults } from './gmail.js';

const USAGE = `actiontrack - track meeting action items and prepare (never send) Gmail follow-up drafts

Usage:
  actiontrack ingest <folder>
  actiontrack list [--owner <name>] [--status open|done|overdue] [--due-before <YYYY-MM-DD>] [--json]
  actiontrack done <id>
  actiontrack followup --all [--json] [--owner <name>] [--gateway <module>] [--contacts <file>] [--record <results.json>]

Options:
  --db <file>        SQLite file (default ./.actiontrack/actiontrack.db, env ACTIONTRACK_DB)
  --today <date>     override today's date (env ACTIONTRACK_TODAY; timezone via ACTIONTRACK_TZ)
  --gateway <file>   ES module exporting createDraft(); without it followup only previews (env ACTIONTRACK_GATEWAY)
  --contacts <file>  JSON { "Full Name": "email" } of trusted addresses (env ACTIONTRACK_CONTACTS)
  --record <file>    record draft ids created by an MCP host: JSON [{ "fingerprint": "...", "draftId": "..." }]
  --help             show this help

Exit codes: 0 success, 1 processing/integration failure, 2 invalid usage.
Emails are never sent; only draft creation is ever requested.
`;

const BOOL_FLAGS = new Set(['json', 'all', 'help']);
const VALUE_FLAGS = new Set(['owner', 'status', 'due-before', 'db', 'today', 'gateway', 'contacts', 'record']);

export function parseArgs(argv) {
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

const pad = (s, n) => (String(s).length >= n ? String(s) : String(s) + ' '.repeat(n - String(s).length));
const clip = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 3)}...` : String(s));

function formatTable(rows) {
  const head = ['ID', 'OWNER', 'TASK', 'DUE', 'STATUS', 'SOURCE'];
  const body = rows.map((t) => {
    const src = t.sources[0];
    return [
      String(t.id),
      t.owner ? (t.ownerStatus === 'ambiguous' ? `${t.owner} (?)` : t.owner) : '-',
      clip(t.description, 56),
      t.due || (t.dueRaw ? '? (unclear)' : '-'),
      t.displayStatus,
      `${src.file}:${src.line}${t.sources.length > 1 ? ` (+${t.sources.length - 1})` : ''}`,
    ];
  });
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((r) => r[i].length)));
  const line = (r) => r.map((c, i) => pad(c, widths[i])).join('  ').trimEnd();
  return [line(head), ...body.map(line)].join('\n');
}

function formatReport(r) {
  const out = [
    `Ingested ${r.folder}`,
    `  Files scanned: ${r.filesScanned} | processed: ${r.filesProcessed} | skipped: ${r.filesSkipped.length}`,
    `  Tasks found: ${r.tasksFound} | added: ${r.tasksAdded} | duplicates detected (merged): ${r.duplicatesDetected} | already known: ${r.alreadyKnown}`,
    `  Possible duplicates kept separate: ${r.possibleDuplicates.length} | parsing warnings: ${r.warnings.length}`,
    `  Unassigned: ${r.unassigned} | no/unknown due date: ${r.noDueDate} | ambiguous owners: ${r.ambiguousOwners} | unrecognised owners: ${r.unknownOwners}`,
  ];
  if (r.filesSkipped.length) {
    out.push('Skipped files:');
    for (const m of r.filesSkipped) out.push(`  - ${m.file}: ${m.reason} - ${m.detail}`);
  }
  if (r.possibleDuplicates.length) {
    out.push('Possible duplicates (retained as separate tasks):');
    for (const p of r.possibleDuplicates) out.push(`  - task ${p.taskId} ~ task ${p.similarTo} (similarity ${p.similarity})`);
  }
  if (r.warnings.length) {
    out.push('Warnings:');
    for (const w of r.warnings) out.push(`  - ${w.file}: ${w.message}`);
  }
  return out.join('\n');
}

const REASONS = {
  'no-email': 'no trusted email address on file',
  'email-conflict': 'notes list conflicting email addresses',
  'invalid-email': 'stored email address is invalid',
  'ambiguous-owner': 'owner name matches more than one person',
};

/**
 * io: { stdout, stderr, cwd, env, now, gateway } - all injectable for tests (`gateway` skips loading a module).
 */
export async function main(argv, io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const cwd = io.cwd || process.cwd();
  const env = io.env || process.env;
  const out = (s) => stdout.write(`${s}\n`);
  let repo = null;

  try {
    const { flags, pos } = parseArgs(argv);
    if (flags.help) { out(USAGE); return 0; }
    const command = pos[0];
    if (!command) { stderr.write(`${USAGE}\n`); return 2; }
    if (!['ingest', 'list', 'done', 'followup'].includes(command)) throw new UsageError(`Unknown command "${command}". Run with --help.`);

    const dbPath = flags.db || env.ACTIONTRACK_DB
      ? path.resolve(cwd, flags.db || env.ACTIONTRACK_DB)
      : path.resolve(cwd, '.actiontrack', 'actiontrack.db');
    const today = resolveToday({ today: flags.today, env, now: io.now });

    // Validate cheap arguments before touching the database.
    if (command === 'ingest' && !pos[1]) throw new UsageError('ingest needs a folder: actiontrack ingest <folder>');
    if (command === 'done') {
      if (!pos[1]) throw new UsageError('done needs an id: actiontrack done <id>');
      Repository.parseId(pos[1]);
    }
    if (command === 'followup' && !flags.all && !flags.owner) throw new UsageError('followup needs --all (or --owner <name>)');
    if (pos.length > 2 || (command === 'list' && pos.length > 1) || (command === 'followup' && pos.length > 1)) {
      throw new UsageError(`Unexpected argument "${pos[command === 'ingest' || command === 'done' ? 2 : 1]}"`);
    }

    repo = new Repository(openDatabase(dbPath), () => (io.now || new Date()));

    switch (command) {
      case 'ingest': {
        const report = ingestFolder(repo, path.resolve(cwd, pos[1]), { now: io.now });
        out(formatReport(report));
        return 0;
      }
      case 'list': {
        const rows = listTasks(repo.allTasks(), { owner: flags.owner, status: flags.status, dueBefore: flags['due-before'] }, today);
        if (flags.json) out(JSON.stringify(rows, null, 2));
        else out(rows.length ? formatTable(rows) : 'No tasks match. (Run "actiontrack ingest <folder>" first, or loosen the filters.)');
        return 0;
      }
      case 'done': {
        const id = Repository.parseId(pos[1]);
        const { task, already } = repo.markDone(id);
        out(already ? `Task ${id} was already done.` : `Task ${id} marked done: ${task.owner || 'unassigned'} - ${task.description}`);
        return 0;
      }
      case 'followup':
        return await followup(repo, flags, { today, env, cwd, dbPath, io, out, stderr });
      default:
        return 2;
    }
  } catch (e) {
    if (e instanceof UsageError) { stderr.write(`Error: ${e.message}\n`); return 2; }
    if (e instanceof NotFoundError || e instanceof StoreError || e instanceof IntegrationError) { stderr.write(`Error: ${e.message}\n`); return 1; }
    stderr.write(`Internal error: ${e && e.message ? e.message : e}\n`);
    if (env.ACTIONTRACK_DEBUG === '1' && e && e.stack) stderr.write(`${e.stack}\n`);
    return 1;
  } finally {
    if (repo) repo.close();
  }
}

async function followup(repo, flags, ctx) {
  const { today, env, cwd, dbPath, io, out, stderr } = ctx;
  const contacts = loadContacts(flags.contacts || env.ACTIONTRACK_CONTACTS ? path.resolve(cwd, flags.contacts || env.ACTIONTRACK_CONTACTS) : null);
  const tasks = repo.allTasks();

  let ownerFilter = null;
  if (flags.owner) {
    const r = resolveOwnerQuery(flags.owner, tasks.filter((t) => t.ownerStatus === 'resolved').map((t) => t.owner));
    if (r.kind === 'ambiguous') throw new UsageError(`--owner "${flags.owner}" is ambiguous; use a full name: ${r.candidates.join(', ')}`);
    if (r.kind === 'person') ownerFilter = r.name;
    else if (r.kind === 'unassigned') throw new UsageError('Unassigned tasks have no recipient and cannot be emailed');
    else throw new UsageError(`No known owner matches "${flags.owner}"`);
  }
  const { drafts, unresolved, unassigned } = buildFollowups(tasks, { today, people: repo.people(), contacts, all: !!flags.all, owner: ownerFilter });

  // Out-of-process MCP host reports the drafts it created.
  let recorded = null;
  if (flags.record) {
    let results;
    try { results = JSON.parse(fs.readFileSync(path.resolve(cwd, flags.record), 'utf8').replace(/^﻿/, '')); } catch (e) {
      throw new UsageError(`Cannot read results file ${flags.record}: ${e.message}`);
    }
    recorded = recordExternalResults(repo, drafts, results);
  }

  // Optional in-process gateway (createDraft only).
  let gmail = { attempted: false, reason: 'No gateway configured; preview only. Nothing was created in Gmail.' };
  let results = [];
  let exit = 0;
  const gatewaySpec = flags.gateway || env.ACTIONTRACK_GATEWAY;
  if (gatewaySpec || io.gateway) {
    gmail = { attempted: true };
    try {
      const gateway = io.gateway || await loadGateway(gatewaySpec);
      results = await createDrafts(drafts, gateway, repo);
    } catch (e) {
      gmail = { attempted: true, error: e.message, reason: 'Gmail integration unavailable; local preview retained. No drafts were created.' };
      exit = 1;
    }
    if (results.some((r) => r.status === 'failed')) exit = 1;
    if (!gmail.error) gmail.summary = {
      created: results.filter((r) => r.status === 'created').length,
      alreadyCreated: results.filter((r) => r.status === 'already_created').length,
      failed: results.filter((r) => r.status === 'failed').length,
    };
  }
  const resultBy = new Map(results.map((r) => [r.fingerprint, r]));
  const priorBy = new Map(drafts.map((d) => [d.fingerprint, repo.findDraft(d.fingerprint)]));

  const preview = {
    generatedFor: today,
    sent: false,
    mcpTool: GMAIL_TOOL,
    drafts: drafts.map((d) => {
      const r = resultBy.get(d.fingerprint);
      const prior = priorBy.get(d.fingerprint);
      return {
        ...d,
        status: r ? r.status : prior ? 'already_created' : 'pending',
        draftId: r ? r.draftId ?? null : prior ? prior.gmail_draft_id : null,
        error: r && r.error ? r.error : undefined,
        createDraftArguments: buildCreateDraftArgs(d),
      };
    }),
    unresolved: unresolved.map((u) => ({ ...u, detail: REASONS[u.reason] })),
    unassignedTaskIds: unassigned,
    gmail,
    recorded: recorded || undefined,
  };

  try {
    const previewFile = path.join(path.dirname(dbPath), 'followup-preview.json');
    fs.mkdirSync(path.dirname(previewFile), { recursive: true });
    fs.writeFileSync(previewFile, JSON.stringify(preview, null, 2));
  } catch (e) {
    stderr.write(`Warning: could not save local preview: ${e.message}\n`);
  }

  if (flags.json) {
    out(JSON.stringify(preview, null, 2));
  } else {
    for (const d of preview.drafts) out(`--- ${d.owner} <${d.to}> [${d.status}] ---\nSubject: ${d.subject}\n\n${d.body}\n`);
    for (const u of preview.unresolved) out(`Unresolved: ${u.owner} (${u.detail}); tasks ${u.taskIds.join(', ')}`);
    if (unassigned.length) out(`Unassigned tasks (no recipient): ${unassigned.join(', ')}`);
    if (!preview.drafts.length) out('No follow-up drafts to create.');
    out(gmail.attempted && !gmail.error
      ? `Gmail drafts: ${gmail.summary.created} created, ${gmail.summary.alreadyCreated} already existed, ${gmail.summary.failed} failed. Nothing was sent.`
      : `${gmail.error ? `Gmail error: ${gmail.error}. ` : ''}${gmail.reason} Nothing was sent.`);
  }
  if (gmail.error) stderr.write(`Error: ${gmail.error}\n`);
  for (const r of results) if (r.status === 'failed') stderr.write(`Draft for ${r.owner} failed: ${r.error}\n`);
  return exit;
}
