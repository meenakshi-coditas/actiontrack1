'use strict';
// Deterministic generator for the sample notes/ folder:
// 22 regular + 4 long/messy + 6 malformed = 32 notes.
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'notes');
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (/\.md$/i.test(f)) fs.rmSync(path.join(OUT, f));

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260915);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;

const PEOPLE = [
  { name: 'Priya Sharma', email: 'priya.sharma@acme.test' },
  { name: 'Priya Nair', email: 'priya.nair@acme.test' },
  { name: 'Rahul Mehta', email: 'rahul.mehta@acme.test' },
  { name: 'Ana Torres', email: 'ana.torres@acme.test' },
  { name: 'Wei Chen', email: 'wei.chen@acme.test' },
  { name: 'Sam Okafor', email: 'sam.okafor@acme.test' },
  { name: 'Dana Whitfield', email: null },
];
const fmtPerson = (p) => (p.email ? `${p.name} <${p.email}>` : p.name);

const MEETINGS = ['Weekly sync', 'Sprint planning', 'Retro', 'Vendor call', 'Product review', 'Ops standup', 'Roadmap session'];
const SENTENCES = [
  'We walked through the status of the open workstreams and agreed the timeline is tight but achievable.',
  'Rahul raised a concern about the vendor lead times; nobody had a firm answer yet.',
  'The team discussed whether to defer the migration until after the quarter close.',
  'Customer feedback from last week was mostly positive, with two escalations still unresolved.',
  'Budget variance is within tolerance but the contractor line needs another look.',
  'Agreed to keep the demo scope small and revisit the stretch goals next time.',
  'There was a long tangent about naming conventions that we parked for later.',
  'Security review is blocked on access to the staging logs.',
];
const TASKS = [
  'draft the onboarding checklist', 'book the demo room', 'update the risk register', 'review the Q4 budget',
  'schedule customer interviews', 'fix the login timeout bug', 'prepare the board slides',
  'confirm the vendor contract renewal', 'write the release notes', 'collect survey responses',
  'set up the staging environment', 'share the security audit summary', 'clean up the Jira backlog',
  'order team lunch', 'renew the SSL certificate', 'send the meeting minutes', 'test the payment webhook',
  'benchmark the search API', 'arrange travel for the offsite', 'review pull request 482',
];
const DUES = [
  'Friday', 'next Tuesday', 'end of month', 'Sept 30', '2026-10-02', 'in 2 weeks', 'EOW', 'tomorrow',
  'Oct 9th', 'next week', 'Monday', '15 Sep', 'end of week', 'Thursday EOD',
];

// Recurring items repeated (with wording drift) across several meetings.
const RECURRING = [
  { owner: 'Priya Sharma', variants: ['send the revised quote to Contoso', 'send revised quote to Contoso.', 'Send the revised quote to Contoso'], due: ['Friday', 'next Tuesday', 'Oct 2'], at: [0, 3, 6, 9] },
  { owner: 'Rahul Mehta', variants: ['finalize the vendor contract', 'finalise the vendor contract'], due: ['end of month', 'Sept 30'], at: [1, 4, 8], doneLast: true },
  { owner: 'Ana', variants: ['update the risk register', 'update risk register'], due: ['EOW', 'Friday'], at: [2, 5, 10] },
  { owner: 'Priya', variants: ['book the conference room for demo', 'book conference room for the demo day'], due: ['next week'], at: [4, 7, 11] },
  { owner: null, variants: ['order cake for the launch party', 'Order cake for launch party'], due: [null], at: [5, 12] },
  { owner: 'Wei Chen', variants: ['fix the flaky integration tests'], due: ['Oct 9th', 'in 2 weeks'], at: [6, 13, 17] },
  { owner: 'Sam', variants: ['share the security audit summary with legal'], due: [null], at: [8, 14] },
  { owner: 'Dana Whitfield', variants: ['confirm the offsite budget'], due: ['Thursday EOD', 'end of week'], at: [9, 15, 19], doneLast: true },
  { owner: 'Priya Nair', variants: ['migrate the reporting dashboards'], due: ['Oct 16', 'next week', 'end of month'], at: [10, 16] },
];

function ownerText(person, both) {
  const first = person.name.split(' ')[0];
  if (/^Priya/.test(first) && both) return chance(0.6) ? first : person.name;
  return chance(0.6) ? first : person.name;
}

function line(owner, task, due, style, checked) {
  const box = checked ? '[x]' : '[ ]';
  const d = due ? due : null;
  switch (style) {
    case 0: return `- ${box} ${owner} to ${task}${d ? ` by ${d}` : ''}`;
    case 1: return `- ${box} ${owner} will ${task}${d ? ` (due ${d})` : ''}`;
    case 2: return `- ${box} ${owner}: ${task}${d ? `, due ${d}` : ''}`;
    default: return `* ${box} ${owner} should ${task}${d ? ` before ${d}` : ''}`;
  }
}

function dateStr(base, add) {
  const d = new Date(Date.UTC(base[0], base[1] - 1, base[2] + add));
  return d.toISOString().slice(0, 10);
}

function attendeesFor(i) {
  const pool = PEOPLE.slice();
  const out = [];
  const mode = i % 4; // 0: both Priyas, 1: Sharma only, 2: Nair only, 3: neither
  for (const p of pool) {
    if (p.name === 'Priya Sharma' && (mode === 0 || mode === 1)) out.push(p);
    else if (p.name === 'Priya Nair' && (mode === 0 || mode === 2)) out.push(p);
    else if (!p.name.startsWith('Priya') && chance(0.7)) out.push(p);
  }
  while (out.length < 3) {
    const p = pick(PEOPLE.filter((x) => !out.includes(x) && !(x.name.startsWith('Priya') && mode === 3)));
    out.push(p);
  }
  return out;
}

function writeNote(file, text) { fs.writeFileSync(path.join(OUT, file), text); }

const BASE = [2026, 8, 3];
let offset = 0;
const files = [];
const REGULAR = 22;
for (let i = 0; i < REGULAR; i++) {
  const date = dateStr(BASE, offset);
  offset += i % 2 === 0 ? 2 : 3;
  const title = pick(MEETINGS);
  const attendees = attendeesFor(i);
  const names = attendees.map((a) => a.name);
  const both = names.includes('Priya Sharma') && names.includes('Priya Nair');
  const body = [`---`, `date: ${date}`, `title: ${title}`, `attendees: ${attendees.map(fmtPerson).join(', ')}`, `---`, '', `# ${title}`, '',
    pick(SENTENCES), pick(SENTENCES), '', '## Action items'];

  RECURRING.forEach((r) => {
    const k = r.at.indexOf(i);
    if (k < 0) return;
    const variant = r.variants[k % r.variants.length];
    const due = r.due[k % r.due.length];
    const last = k === r.at.length - 1;
    // Only reference owners that make sense for this note's attendees.
    const attends = !r.owner || names.some((n) => n === r.owner || n.split(' ')[0] === r.owner);
    const owner = attends ? r.owner : r.owner;
    if (owner === null) body.push(`- [ ] ${variant}${due ? ` by ${due}` : ''}`);
    else body.push(line(owner, variant, due, k % 3, !!(r.doneLast && last)));
  });

  const extra = 2 + Math.floor(rand() * 3);
  for (let n = 0; n < extra; n++) {
    const roll = rand();
    const task = pick(TASKS);
    const due = chance(0.7) ? pick(DUES) : null;
    if (roll < 0.5) body.push(line(ownerText(pick(attendees), both), task, due, Math.floor(rand() * 4), false));
    else if (roll < 0.62) body.push(`- [ ] ${task}${due ? ` by ${due}` : ''}`);
    else if (roll < 0.72) body.push(`- [ ] ${pick(['Team', 'TBD', 'Everyone', 'Someone'])} to ${task}${due ? ` by ${due}` : ''}`);
    else if (roll < 0.8) body.push(`- [ ] Contoso to ${task}${due ? ` by ${due}` : ''}`);
    else if (roll < 0.9) body.push(`- [x] ${ownerText(pick(attendees), both)} to ${task}`);
    else body.push(`- [ ] ${pick(attendees).name.split(' ')[0]} to ${task} due ASAP`);
  }
  body.push('', `_Next meeting: ${dateStr(BASE, offset)}_`, '');
  const slug = title.toLowerCase().replace(/[^a-z]+/g, '-');
  const file = `${date}-${slug}.md`;
  writeNote(file, body.join('\n'));
  files.push(file);
}

// ---- 4 long, messy notes -------------------------------------------------
function messy(date, title, attendees, crlf, extraLines) {
  const L = [];
  L.push('---', `date: ${date}`, `title: ${title}`, `attendees: [${attendees.map(fmtPerson).join(', ')}]`, '---', '', `# ${title}  `, '');
  for (let s = 1; s <= 6; s++) {
    L.push(`## Topic ${s}: ${pick(['Roadmap', 'Hiring', 'Incidents', 'Budget', 'Customers', 'Tooling'])}`, '');
    for (let p = 0; p < 4; p++) L.push(`${pick(SENTENCES)} ${pick(SENTENCES)} ${pick(SENTENCES)}`, '');
    L.push('- decision: we keep the current plan', '  - owner noted separately', '    - [ ] Sam to double-check the numbers by Friday', '');
    L.push('| item | owner | status |', '|------|-------|--------|', '| quote | Priya | pending |', '');
  }
  L.push('> Quote from customer: "we need this yesterday" - not an action item', '');
  L.push('```', '- [ ] Priya to delete the production database by tomorrow', '```', '');
  L.push('~~~', '* [ ] Rahul to ignore this fenced item', '~~~', '');
  L.push('ACTION: Priya to follow up (not a checkbox, ignored)', '- Rahul to chase legal (plain bullet, ignored)', '');
  L.push('## Actions captured at the end', '');
  L.push(...extraLines);
  L.push('- [ ]   ', '-[ ]Wei to check the build pipeline by Monday', '*[ ] Dana to email the offsite venue before next Friday', '- [X] Ana to close the audit ticket', '');
  L.push('    ', '\t- [ ] Sam: renew the staging certificate, due end of month', 'Trailing text with no meaning   ', '');
  return L.join(crlf ? '\r\n' : '\n');
}
const allButNair = PEOPLE.filter((p) => p.name !== 'Priya Nair');
const allPeople = PEOPLE;
writeNote('2026-08-20-quarterly-planning-LONG.md', messy('2026-08-20', 'Quarterly planning (long, messy)', allPeople, false, [
  '- [ ] Priya to send the revised quote to Contoso by Friday',
  '- [ ] Rahul to finalize the vendor contract by end of month',
  '- [ ] Priya Nair to migrate the reporting dashboards by Sept 25',
  '- [ ] Update to the pricing policy is needed by Monday',
  '- [ ] Follow up to the customer escalation due someday',
]));
writeNote('2026-09-11-incident-review-LONG.md', messy('2026-09-11', 'Incident review (long, messy, CRLF)', allButNair, true, [
  '- [ ] Priya to write the post-incident report by Monday',
  '- [ ] Wei to fix the flaky integration tests in 2 weeks',
  '- [ ] Team to review the on-call rota',
  '- [ ] Dana and Sam to book the retro room next Tuesday',
]));
writeNote('2026-09-24-offsite-brainstorm-LONG.md', messy('2026-09-24', 'Offsite brainstorm (long, messy)', allPeople, false, [
  '- [ ] Dana Whitfield to confirm the offsite budget by Oct 9',
  '- [ ] Priya to book the conference room for the demo day by next week',
  '- [x] Sam to share the security audit summary with legal',
  '- [ ] Nobody to own the catering contract yet',
]));
writeNote('2026-10-08-all-hands-prep-LONG.md', messy('2026-10-08', 'All-hands prep (long, messy, CRLF)', allButNair, true, [
  '- [ ] Ana to update the risk register by EOW',
  '- [ ] Priya Sharma to send the revised quote to Contoso by Oct 12',
  '- [ ] order cake for the launch party',
  '- [ ] Rahul will present the roadmap (due tomorrow)',
]));

// ---- 6 malformed notes ----------------------------------------------------
writeNote('2026-09-02-empty.md', '');
writeNote('2026-09-03-no-date.md', ['---', 'title: Standup', 'attendees: Priya Sharma, Rahul Mehta', '---', '- [ ] Priya to send the deck by Friday', ''].join('\n'));
writeNote('2026-09-04-bad-date.md', ['---', 'date: 2026-13-45', 'attendees: Ana Torres, Sam Okafor', '---', '- [ ] Ana to fix the build by Friday', ''].join('\n'));
writeNote('2026-09-05-no-attendees.md', ['---', 'date: 2026-09-05', 'title: Hallway chat', '---', '- [ ] Wei to check the logs by Monday', ''].join('\n'));
writeNote('2026-09-06-unclosed-frontmatter.md', ['---', 'date: 2026-09-06', 'attendees: Dana Whitfield, Sam Okafor', '', '- [ ] Dana to email the venue by Friday', ''].join('\n'));
fs.writeFileSync(path.join(OUT, '2026-09-07-binary.md'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x1a, 0x0a, 0x00, 0xff, 0xfe, 0x00, 0x41]));

const count = fs.readdirSync(OUT).filter((f) => /\.md$/i.test(f)).length;
console.log(`Wrote ${count} sample notes to ${OUT}`);
