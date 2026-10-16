'use strict';

// All note-derived text is inserted with textContent / createTextNode only (never as HTML).
const $ = (sel) => document.querySelector(sel);

function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') node.className = v; else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return node;
}

async function api(path, options) {
  const res = await fetch(path, options);
  let data = null;
  try { data = await res.json(); } catch (_) { /* non-JSON error body */ }
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}
const post = (path, body) => api(path, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
});

function showError(err) {
  const box = $('#error');
  box.textContent = err ? (err.message || String(err)) : '';
  box.hidden = !err;
}

async function guarded(fn) {
  try { showError(null); await fn(); } catch (e) { showError(e); }
}

async function loadSummary() {
  const s = await api('/api/summary');
  $('#c-open').textContent = s.open;
  $('#c-overdue').textContent = s.overdue;
  $('#c-done').textContent = s.done;
  $('#c-unassigned').textContent = s.unassigned;
}

function fillSelect(select, firstLabel, entries, extra) {
  const keep = select.value;
  select.replaceChildren(el('option', { value: '' }, firstLabel));
  if (extra) select.append(el('option', { value: extra }, extra));
  for (const e of entries) select.append(el('option', { value: e.value }, e.label));
  if ([...select.options].some((o) => o.value === keep)) select.value = keep;
}

async function loadOwners() {
  const owners = await api('/api/owners');
  const entries = owners.map((o) => ({
    value: o.owner,
    label: o.ownerStatus === 'ambiguous' ? `${o.owner} (ambiguous)` : o.owner,
  }));
  const seen = new Set();
  const unique = entries.filter((e) => (seen.has(e.value) ? false : seen.add(e.value)));
  fillSelect($('#f-owner'), 'Anyone', unique, 'unassigned');
  const follow = $('#follow-owner');
  const keep = follow.value;
  follow.replaceChildren(el('option', { value: '__all__' }, 'All owners'));
  for (const o of owners) {
    if (o.ownerStatus === 'ambiguous') continue;
    follow.append(el('option', { value: o.owner }, `${o.owner} (${o.open + o.overdue} to chase)`));
  }
  if ([...follow.options].some((o) => o.value === keep)) follow.value = keep;
}

function statusBadge(status) { return el('span', { class: `badge ${status}` }, status); }

function itemRow(it) {
  const owner = el('td', {});
  if (it.owner) {
    owner.append(it.owner);
    if (it.ownerStatus === 'ambiguous') {
      owner.append(el('div', { class: 'flag' }, `ambiguous: ${it.candidates.join(' or ')}`));
    } else if (it.ownerStatus === 'unknown') {
      owner.append(el('div', { class: 'small' }, 'not an attendee'));
    }
  } else {
    owner.append(el('span', { class: 'muted' }, 'unassigned'));
  }
  const due = el('td', {});
  if (it.due) {
    due.append(it.due);
    if (it.daysOverdue > 0) due.append(el('div', { class: 'small' }, `${it.daysOverdue} day(s) overdue`));
  } else {
    due.append(el('span', { class: 'muted' }, it.dueRaw ? `? ${it.dueRaw}` : 'none'));
  }
  const src = it.sources[0];
  const source = el('td', { class: 'small' }, `${src.file}:${src.line}`);
  if (it.sources.length > 1) source.append(el('div', {}, `+${it.sources.length - 1} more meeting(s)`));

  const action = el('td', {});
  if (it.displayStatus !== 'done') {
    const btn = el('button', { type: 'button', 'aria-label': `Mark ${it.id} done` }, 'Mark done');
    btn.addEventListener('click', () => guarded(async () => {
      btn.disabled = true;
      await post(`/api/items/${encodeURIComponent(it.id)}/done`);
      await refresh();
    }));
    action.append(btn);
  }
  return el('tr', {}, el('td', {}, it.id), el('td', {}, statusBadge(it.displayStatus)), owner, due,
    el('td', {}, it.task), source, action);
}

async function loadItems() {
  const q = new URLSearchParams();
  if ($('#f-owner').value) q.set('owner', $('#f-owner').value);
  if ($('#f-status').value) q.set('status', $('#f-status').value);
  if ($('#f-due').value) q.set('dueBefore', $('#f-due').value);
  const items = await api(`/api/items?${q}`);
  $('#rows').replaceChildren(...items.map(itemRow));
  $('#empty').hidden = items.length > 0;
  $('#count').textContent = `(${items.length})`;
}

function renderReport(r) {
  const box = $('#report');
  if (!r) { box.replaceChildren(); return; }
  const kids = [
    el('div', {}, `Scanned ${r.filesScanned} file(s): ${r.parsed} parsed, ${r.malformed.length} malformed. `
      + `${r.itemsFound} action item(s): ${r.created} new, ${r.merged} duplicate(s) merged, ${r.unchanged} already known.`),
    el('div', { class: 'small' }, `Unassigned: ${r.unassigned} | No due date: ${r.noDue} | `
      + `Ambiguous owners: ${r.ambiguousOwners} | Unknown owners: ${r.unknownOwners}`),
  ];
  if (r.malformed.length) {
    kids.push(el('div', { class: 'notice' }, 'Skipped malformed notes:'),
      el('ul', {}, ...r.malformed.map((m) => el('li', {}, `${m.file}: ${m.reason} - ${m.detail}`))));
  }
  if (r.warnings.length) {
    kids.push(el('div', { class: 'small' }, 'Warnings:'),
      el('ul', { class: 'small' }, ...r.warnings.map((w) => el('li', {}, `${w.file}: ${w.message}`))));
  }
  box.replaceChildren(...kids);
}

function renderFollowup(res) {
  const box = $('#drafts');
  const kids = [];
  for (const d of res.drafts) {
    kids.push(el('div', { class: 'draft' },
      el('header', {}, `To: ${d.to || '(no address on file)'}  |  Subject: ${d.subject}`),
      el('pre', {}, d.body)));
  }
  if (!res.drafts.length) kids.push(el('div', { class: 'notice' }, 'No drafts to create.'));
  for (const s of res.skipped) {
    let msg = `Skipped: ${s.reason}`;
    if (s.reason === 'unassigned') msg = `Skipped ${s.count} unassigned item(s): no recipient.`;
    if (s.reason === 'ambiguous') msg = `Skipped ambiguous owner "${s.owner}" (${s.count}): could be ${s.candidates.join(' or ')}.`;
    if (s.reason === 'nothing-open') msg = `${s.owner} has nothing open or overdue.`;
    kids.push(el('div', { class: 'notice' }, msg));
  }
  if (res.created.length) {
    kids.push(el('div', { class: 'notice ok' }, 'Drafts saved (nothing was sent):'),
      el('ul', {}, ...res.created.map((c) => el('li', {}, `${c.owner}: ${c.path}`))));
  } else if (res.preview) {
    kids.push(el('div', { class: 'notice ok' }, 'Preview only - nothing was written or sent.'));
  }
  box.replaceChildren(...kids);
}

async function runFollowup(preview) {
  const owner = $('#follow-owner').value;
  const body = owner === '__all__' ? { all: true, preview } : { owner, preview };
  renderFollowup(await post('/api/followup', body));
}

async function refresh() {
  await Promise.all([loadSummary(), loadOwners()]);
  await loadItems();
}

$('#ingest-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  guarded(async () => {
    const btn = ev.submitter || $('#ingest-form button');
    btn.disabled = true;
    try {
      renderReport(await post('/api/ingest', { folder: $('#folder').value }));
      await refresh();
    } finally { btn.disabled = false; }
  });
});
for (const id of ['#f-owner', '#f-status', '#f-due']) $(id).addEventListener('change', () => guarded(loadItems));
$('#f-reset').addEventListener('click', () => {
  $('#f-owner').value = ''; $('#f-status').value = ''; $('#f-due').value = '';
  guarded(loadItems);
});
$('#btn-preview').addEventListener('click', () => guarded(() => runFollowup(true)));
$('#btn-create').addEventListener('click', () => guarded(() => runFollowup(false)));
$('#follow-form').addEventListener('submit', (ev) => ev.preventDefault());

guarded(async () => {
  renderReport(await api('/api/ingest/last'));
  await refresh();
});
