// Gmail integration boundary.
//
// SAFETY: this module can only ever ask for a DRAFT to be created. The only gateway method it will call is
// `createDraft`. There is no code path that sends, replies to, or forwards mail.
//
// The real Gmail connector is an MCP tool (`create_draft`: to[] / subject / body / ...). A local Node process
// cannot call a remote MCP tool by itself, so there are two supported execution paths:
//   1. MCP-capable host (e.g. Claude Code with the Gmail connector): run `followup --all --json`, which emits an
//      exact `create_draft` argument list per owner; the host creates the drafts and reports the returned ids back
//      with `followup --record <file>` so retries do not duplicate drafts.
//   2. In-process: supply a gateway module (`--gateway <file>` / ACTIONTRACK_GATEWAY) default-exporting
//      `{ createDraft({ to, subject, body }) -> { id, ... } }`. This is also how the tests inject a mock.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { IntegrationError } from './errors.js';
import { isEmail } from './followup.js';

export const GMAIL_TOOL = 'create_draft';

/** Build and validate the exact `create_draft` arguments (required for us: to, subject, body). */
export function buildCreateDraftArgs(draft) {
  if (!draft || !isEmail(draft.to)) throw new IntegrationError(`Draft for "${draft && draft.owner}" has no valid recipient`);
  if (typeof draft.subject !== 'string' || !draft.subject.trim()) throw new IntegrationError('Draft subject is empty');
  if (typeof draft.body !== 'string' || !draft.body.trim()) throw new IntegrationError('Draft body is empty');
  return { to: [draft.to], subject: draft.subject.replace(/[\r\n]+/g, ' ').trim(), body: draft.body };
}

/** Load a gateway module. Only `createDraft` is retained; every other export is discarded. */
export async function loadGateway(spec) {
  let mod;
  try {
    mod = await import(pathToFileURL(path.resolve(spec)).href);
  } catch (e) {
    throw new IntegrationError(`Cannot load Gmail gateway "${spec}": ${e.message}`);
  }
  const g = mod.default ?? mod;
  if (!g || typeof g.createDraft !== 'function') throw new IntegrationError(`Gateway "${spec}" must export createDraft()`);
  return { createDraft: (args) => g.createDraft(args) };
}

/**
 * Create drafts through `gateway` (createDraft only). Each draft ends as one of:
 *   created | already_created (ledger hit, no call made) | failed. Failures never stop the batch.
 */
export async function createDrafts(drafts, gateway, repo) {
  if (!gateway || typeof gateway.createDraft !== 'function') throw new IntegrationError('No Gmail gateway available');
  const results = [];
  for (const d of drafts) {
    const base = { owner: d.owner, to: d.to, fingerprint: d.fingerprint, taskIds: d.taskIds };
    const prior = repo.findDraft(d.fingerprint);
    if (prior) { results.push({ ...base, status: 'already_created', draftId: prior.gmail_draft_id }); continue; }
    try {
      const res = await gateway.createDraft(buildCreateDraftArgs(d));
      const id = res && (res.id ?? res.draftId);
      if (id == null || id === '') throw new IntegrationError('Gateway returned no draft id; treating as failure');
      repo.recordDraft({ fingerprint: d.fingerprint, owner: d.owner, to: d.to, taskIds: d.taskIds, draftId: id });
      results.push({ ...base, status: 'created', draftId: String(id), viewUrl: res.viewUrl ?? null });
    } catch (e) {
      results.push({ ...base, status: 'failed', error: e.message });
    }
  }
  return results;
}

/** Record drafts that an MCP host created out-of-process. results: [{ fingerprint, draftId }] */
export function recordExternalResults(repo, drafts, results) {
  if (!Array.isArray(results)) throw new IntegrationError('Results file must be a JSON array of { fingerprint, draftId }');
  const byFp = new Map(drafts.map((d) => [d.fingerprint, d]));
  const out = [];
  for (const r of results) {
    const d = r && byFp.get(r.fingerprint);
    if (!d) { out.push({ fingerprint: r && r.fingerprint, status: 'rejected', error: 'fingerprint does not match a current draft' }); continue; }
    if (r.draftId == null || r.draftId === '') { out.push({ fingerprint: r.fingerprint, owner: d.owner, status: 'rejected', error: 'missing draftId' }); continue; }
    repo.recordDraft({ fingerprint: d.fingerprint, owner: d.owner, to: d.to, taskIds: d.taskIds, draftId: r.draftId });
    out.push({ fingerprint: d.fingerprint, owner: d.owner, status: 'recorded', draftId: String(r.draftId) });
  }
  return out;
}
