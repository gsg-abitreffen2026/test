import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { Mutex } from 'async-mutex';

const app = express();
app.use(express.json({ limit: '4mb' }));
app.use(morgan('dev'));

// ---- CORS ----
const allowList = (process.env.CORS_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (allowList.length === 0 || allowList.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked: ${origin}`), false);
  },
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

// ---- CONFIG ----
const LOCAL_XLSX  = process.env.LOCAL_XLSX  || './local.xlsx';
const GLOBAL_XLSX = process.env.GLOBAL_XLSX || './global.xlsx';
const BACKUP_DIR  = process.env.BACKUP_DIR  || '';

const SHEETS = {
  leads      : process.env.SHEET_LEADS       || 'campaign_leads',
  upload     : process.env.SHEET_UPLOAD      || 'upload',
  transformed: process.env.SHEET_TRANSFORMED || 'transformed',
  templates  : process.env.SHEET_TEMPLATES   || 'templates',
  blacklist  : process.env.SHEET_BLACKLIST   || 'blacklist',
  bounce     : process.env.SHEET_BOUNCE      || 'bounce',
  settings   : process.env.SHEET_SETTINGS    || 'settings',
  signatures : process.env.SHEET_SIGNATURES  || 'signatures',
  old        : process.env.SHEET_OLD         || 'old_campaigns',
};

const GSHEETS = {
  templates  : process.env.GSHEET_TEMPLATES   || 'templates_global',
  signatures : process.env.GSHEET_SIGNATURES  || 'signitures_global',
  blacklist  : process.env.GSHEET_BLACKLIST   || 'blacklist',
  bounce     : process.env.GSHEET_BOUNCE      || 'bounce',
  error_list : process.env.GSHEET_ERROR_LIST  || 'error_list',
};

// ---- Simple per-file mutex to serialize writes ----
const fileMutex = new Map();
function getMutex(file) {
  if (!fileMutex.has(file)) fileMutex.set(file, new Mutex());
  return fileMutex.get(file);
}

// ---- Workbook helpers ----
function ensureWorkbook(file) {
  if (!fs.existsSync(file)) {
    const wb = XLSX.utils.book_new();
    XLSX.writeFile(wb, file);
  }
}
function loadWorkbook(file) {
  ensureWorkbook(file);
  return XLSX.readFile(file, { cellDates: true }); // attempt to preserve dates
}
function saveWorkbook(file, wb) {
  if (BACKUP_DIR) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g,'-');
    const base = path.basename(file, path.extname(file));
    const ext  = path.extname(file) || '.xlsx';
    const backup = path.join(BACKUP_DIR, `${base}.${ts}${ext}`);
    XLSX.writeFile(wb, backup);
  }
  XLSX.writeFile(wb, file);
}

function sheetToObjects(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }); // row 1 as header
  return rows;
}
function objectsToSheet(objs) {
  return XLSX.utils.json_to_sheet(objs || []);
}
function getSheet(wb, name, createIfMissing = false) {
  let ws = wb.Sheets[name];
  if (!ws && createIfMissing) {
    ws = objectsToSheet([]); // empty (will create header on first write)
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  if (!ws) throw new Error(`Sheet not found: ${name}`);
  return ws;
}

function readAll(file, sheetName) {
  const wb = loadWorkbook(file);
  const ws = getSheet(wb, sheetName, true);
  return sheetToObjects(ws);
}
function writeReplace(file, sheetName, objects) {
  const wb = loadWorkbook(file);
  const ws = objectsToSheet(objects || []);
  wb.Sheets[sheetName] = ws;
  if (!wb.SheetNames.includes(sheetName)) wb.SheetNames.push(sheetName);
  saveWorkbook(file, wb);
}
function appendRows(file, sheetName, newObjects) {
  const existing = readAll(file, sheetName);
  writeReplace(file, sheetName, existing.concat(newObjects || []));
}

function strTF(v){ return (v === true || String(v).toUpperCase()==='TRUE') ? 'TRUE':'FALSE'; }
function asBoolTF(v){ return String(v).toUpperCase()==='TRUE'; }

function groupTemplatesWithTotal(rows) {
  const by = {};
  for (const r of rows) {
    const seq = r.sequence_id || r.sequenceId || 'Standard';
    if (!by[seq]) by[seq] = { steps: [], total_steps: null };
    by[seq].steps.push({
      step: r.step || '',
      subject: r.subject || '',
      body_html: r.body_html || '',
      delay_days: Number(r.delay_days || 0),
      total_steps: r.total_steps
    });
    if ((String(r.step)==='1' || r.step===1) && r.total_steps != null && by[seq].total_steps == null) {
      const ts = Number(r.total_steps);
      if (ts > 0) by[seq].total_steps = ts;
    }
  }
  const out = [];
  Object.keys(by).forEach(k => {
    const g = by[k];
    const steps = g.steps
      .sort((a,b)=>Number(a.step||0)-Number(b.step||0))
      .map(({total_steps, ...rest}) => rest);
    const ts = g.total_steps != null ? Number(g.total_steps) : steps.length;
    out.push({ name: k, steps, total_steps: ts });
  });
  return out;
}

// ---------- ROUTES (LOCAL) ----------

// GET /api/contacts?limit=25&includeInactive=1
app.get('/api/contacts', (req, res) => {
  try {
    const limit = Math.max(1, Number(req.query.limit || 50));
    const includeInactive = String(req.query.includeInactive || '1') === '1';
    let rows = readAll(LOCAL_XLSX, SHEETS.leads);
    if (!includeInactive) rows = rows.filter(r => asBoolTF(r.active));
    rows = rows.slice(0, limit).map(r => ({ ...r, active: strTF(r.active) }));
    res.json({ contacts: rows });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});

// GET /api/stats
app.get('/api/stats', (req, res) => {
  try {
    const rows = readAll(LOCAL_XLSX, SHEETS.leads);
    let sent=0,replies=0,hot=0,needReview=0;
    for (const r of rows) {
      if (r.last_sent_at || Number(r.step_sent || 0) > 0) sent++;
      const v = String(r.response || '').replace(/\s+/g,' ').toLowerCase();
      if (v === 'reply') replies++;
      else if (v === 'hot') hot++;
      else if (v === 'need review' || v === 'need_review') needReview++;
    }
    res.json({ sent, replies, hot, needReview, meetings: 0 });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});

// Templates (LOCAL)
app.get('/api/templates', (req, res) => {
  try {
    const rows = readAll(LOCAL_XLSX, SHEETS.templates);
    res.json(groupTemplatesWithTotal(rows));
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});

app.post('/api/templates/:sequence_id', async (req, res) => {
  const release = await getMutex(LOCAL_XLSX).acquire();
  try {
    const sequenceId = req.params.sequence_id;
    const { steps = [], total_steps } = (req.body || {});
    const rows = readAll(LOCAL_XLSX, SHEETS.templates);
    const keep = rows.filter(r => (r.sequence_id || r.sequenceId) !== sequenceId);
    const out = [...keep];
    steps.forEach((s, idx) => {
      const row = {
        sequence_id: sequenceId,
        step: s.step || (idx+1),
        subject: s.subject || '',
        body_html: s.body_html || '',
        delay_days: Number(s.delay_days || 0)
      };
      if (String(row.step) === '1' && total_steps != null) row.total_steps = Number(total_steps);
      out.push(row);
    });
    writeReplace(LOCAL_XLSX, SHEETS.templates, out);
    res.json({ ok: true, sequence_id: sequenceId, total_steps: Number(total_steps || steps.length) });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
  finally { release(); }
});

app.post('/api/templates/delete/:sequence_id', async (req, res) => {
  const release = await getMutex(LOCAL_XLSX).acquire();
  try {
    const sequenceId = req.params.sequence_id;
    const rows = readAll(LOCAL_XLSX, SHEETS.templates);
    const keep = rows.filter(r => (r.sequence_id || r.sequenceId) !== sequenceId);
    writeReplace(LOCAL_XLSX, SHEETS.templates, keep);
    res.json({ ok: true, deleted: sequenceId });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
  finally { release(); }
});

app.post('/api/templates/active', async (req, res) => {
  const release = await getMutex(LOCAL_XLSX).acquire();
  try {
    const { name = '', scope = 'local' } = (req.body || {});
    const st = readAll(LOCAL_XLSX, SHEETS.settings);
    const row2 = st[0] || { 'Signatur': '' };
    if (scope === 'global') row2['active_template_global'] = name;
    else row2['active_template_local'] = name;
    writeReplace(LOCAL_XLSX, SHEETS.settings, [row2]);
    res.json({ ok: true, name, scope });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
  finally { release(); }
});

// Blacklist (LOCAL)
app.get('/api/blacklist', (req, res) => {
  try {
    const q = String(req.query.q || '').toLowerCase();
    const bounces = String(req.query.bounces || '0') === '1';
    const bl = readAll(LOCAL_XLSX, SHEETS.blacklist).map(r=>r.email).filter(Boolean);
    const bo = bounces ? readAll(LOCAL_XLSX, SHEETS.bounce).map(r=>r.email).filter(Boolean) : [];
    const filt = (x) => q ? String(x).toLowerCase().includes(q) : true;
    res.json({ blacklist: bl.filter(filt), bounces: bo.filter(filt) });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});
app.post('/api/blacklist', async (req, res) => {
  const release = await getMutex(LOCAL_XLSX).acquire();
  try {
    const email = String((req.body || {}).email || '').trim();
    if (!email) return res.status(400).json({ error: 'email required' });
    appendRows(LOCAL_XLSX, SHEETS.blacklist, [{ email }]);
    res.json({ ok: true, email });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
  finally { release(); }
});

// Upload & Campaign
app.post('/api/upload', async (req, res) => {
  const release = await getMutex(LOCAL_XLSX).acquire();
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ error: 'no rows' });
    appendRows(LOCAL_XLSX, SHEETS.upload, rows);
    res.json({ ok: true, inserted: rows.length });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
  finally { release(); }
});

app.post('/api/campaign/prepare', async (req, res) => {
  const release = await getMutex(LOCAL_XLSX).acquire();
  try {
    const leadsRows = readAll(LOCAL_XLSX, SHEETS.leads);
    if (leadsRows.length) appendRows(LOCAL_XLSX, SHEETS.old, leadsRows);
    writeReplace(LOCAL_XLSX, SHEETS.leads, []);
    const tRows = readAll(LOCAL_XLSX, SHEETS.transformed);
    if (tRows.length) appendRows(LOCAL_XLSX, SHEETS.leads, tRows);
    res.json({ ok: true, moved: leadsRows.length, loaded: tRows.length });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
  finally { release(); }
});

app.post('/api/campaign/start', async (req, res) => {
  const release = await getMutex(LOCAL_XLSX).acquire();
  try {
    const rows = readAll(LOCAL_XLSX, SHEETS.leads);
    const hasVal = (o)=>Object.values(o||{}).some(v=>String(v||'').length>0);
    const mapped = rows.map(r => hasVal(r) ? { ...r, status: 'go' } : r);
    writeReplace(LOCAL_XLSX, SHEETS.leads, mapped);
    res.json({ ok: true, updated: mapped.length });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
  finally { release(); }
});
app.post('/api/campaign/stop', (req, res) => res.json({ ok: true }));

// Signatures (LOCAL)
app.get('/api/signatures', (req, res) => {
  try {
    const list = readAll(LOCAL_XLSX, SHEETS.signatures)
      .map(r=>({ name: r.name||'', html: r.html||'' }))
      .filter(x=>x.name);
    const st = readAll(LOCAL_XLSX, SHEETS.settings);
    const row2 = st[0] || {};
    const active = { scope: row2['active_signature_scope'] || 'local', name: row2['active_signature_name'] || 'standard' };
    res.json({ list, active });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});
app.get('/api/signatures/standard', (req, res) => {
  try {
    const st = readAll(LOCAL_XLSX, SHEETS.settings);
    const row2 = st[0] || {};
    res.json({ html: row2['Signatur'] || '' });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});
app.get('/api/signatures/active', (req, res) => {
  try {
    const st = readAll(LOCAL_XLSX, SHEETS.settings);
    const row2 = st[0] || {};
    res.json({
      scope: row2['active_signature_scope'] || 'local',
      name : row2['active_signature_name']  || 'standard'
    });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});
app.post('/api/signatures/save', async (req, res) => {
  const release = await getMutex(LOCAL_XLSX).acquire();
  try {
    const { name = '', html = '' } = (req.body || {});
    if (!name) return res.status(400).json({ error: 'name required' });
    const rows = readAll(LOCAL_XLSX, SHEETS.signatures);
    let found = false;
    const out = rows.map(r => {
      if ((r.name || '').toLowerCase() === name.toLowerCase()) { found=true; return { name, html }; }
      return r;
    });
    if (!found) out.push({ name, html });
    writeReplace(LOCAL_XLSX, SHEETS.signatures, out);
    res.json({ ok: true, name });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
  finally { release(); }
});
app.post('/api/signatures/active', async (req, res) => {
  const release = await getMutex(LOCAL_XLSX).acquire();
  try {
    const { scope='local', name='standard' } = (req.body || {});
    const st = readAll(LOCAL_XLSX, SHEETS.settings);
    const row2 = st[0] || { 'Signatur': '' };
    row2['active_signature_scope'] = scope;
    row2['active_signature_name']  = name;
    writeReplace(LOCAL_XLSX, SHEETS.settings, [row2]);
    res.json({ ok: true, scope, name });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
  finally { release(); }
});
app.post('/api/signatures/delete/:name', async (req, res) => {
  const release = await getMutex(LOCAL_XLSX).acquire();
  try {
    const nm = req.params.name;
    if (!nm) return res.status(400).json({ error: 'name missing' });
    if (String(nm).toLowerCase() === 'standard') return res.status(400).json({ error: 'cannot delete standard' });
    const rows = readAll(LOCAL_XLSX, SHEETS.signatures);
    const keep = rows.filter(r => String(r.name||'').toLowerCase() !== String(nm).toLowerCase());
    writeReplace(LOCAL_XLSX, SHEETS.signatures, keep);
    res.json({ ok: true, deleted: nm });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
  finally { release(); }
});

// Contacts: active/todo/remove
app.post('/api/contacts/active', async (req, res) => {
  const release = await getMutex(LOCAL_XLSX).acquire();
  try {
    const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
    if (!updates.length) return res.status(400).json({ error: 'no updates' });
    const rows = readAll(LOCAL_XLSX, SHEETS.leads);
    const index = new Map();
    rows.forEach((r,i) => {
      if (r.email) index.set(String(r.email).toLowerCase(), i);
      if (r.id)    index.set(String(r.id).toLowerCase(), i);
    });
    let changed = 0;
    for (const u of updates) {
      const key = String(u.email || u.id || '').toLowerCase();
      if (!index.has(key)) continue;
      const i = index.get(key);
      const val = strTF(u.active);
      if (String(rows[i].active||'').toUpperCase() !== val) { rows[i].active = val; changed++; }
    }
    writeReplace(LOCAL_XLSX, SHEETS.leads, rows);
    res.json({ ok: true, updated: changed });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
  finally { release(); }
});
app.post('/api/contacts/todo', async (req, res) => {
  const release = await getMutex(LOCAL_XLSX).acquire();
  try {
    const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
    if (!updates.length) return res.status(400).json({ error: 'no updates' });
    const rows = readAll(LOCAL_XLSX, SHEETS.leads);
    const index = new Map();
    rows.forEach((r,i) => {
      if (r.email) index.set(String(r.email).toLowerCase(), i);
      if (r.id)    index.set(String(r.id).toLowerCase(), i);
    });
    for (const u of updates) {
      const key = String(u.email || u.id || '').toLowerCase();
      if (!index.has(key)) continue;
      const i = index.get(key);
      rows[i].todo = strTF(u.todo);
    }
    writeReplace(LOCAL_XLSX, SHEETS.leads, rows);
    res.json({ ok: true, updated: updates.length });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
  finally { release(); }
});
app.post('/api/contacts/remove', async (req, res) => {
  const release = await getMutex(LOCAL_XLSX).acquire();
  try {
    const { id = '', email = '' } = (req.body || {});
    if (!id && !email) return res.status(400).json({ error: 'id or email required' });
    const rows = readAll(LOCAL_XLSX, SHEETS.leads);
    const keep = rows.filter(r =>
      !(email && String(r.email||'').toLowerCase() === String(email).toLowerCase()) &&
      !(id && String(r.id||'').toLowerCase() === String(id).toLowerCase())
    );
    writeReplace(LOCAL_XLSX, SHEETS.leads, keep);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
  finally { release(); }
});

// ---------- ROUTES (GLOBAL) ----------

// Templates (GLOBAL)
app.get('/api/global/templates', (req, res) => {
  try {
    const rows = readAll(GLOBAL_XLSX, GSHEETS.templates);
    res.json(groupTemplatesWithTotal(rows));
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});
app.post('/api/global/templates/:sequence_id', async (req, res) => {
  const release = await getMutex(GLOBAL_XLSX).acquire();
  try {
    const sequenceId = req.params.sequence_id;
    const { steps = [], total_steps } = (req.body || {});
    const rows = readAll(GLOBAL_XLSX, GSHEETS.templates);
    const keep = rows.filter(r => (r.sequence_id || r.sequenceId) !== sequenceId);
    const out = [...keep];
    steps.forEach((s, idx) => {
      const row = {
        sequence_id: sequenceId,
        step: s.step || (idx+1),
        subject: s.subject || '',
        body_html: s.body_html || '',
        delay_days: Number(s.delay_days || 0)
      };
      if (String(row.step) === '1' && total_steps != null) row.total_steps = Number(total_steps);
      out.push(row);
    });
    writeReplace(GLOBAL_XLSX, GSHEETS.templates, out);
    res.json({ ok: true, sequence_id: sequenceId, total_steps: Number(total_steps || steps.length) });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
  finally { release(); }
});
app.post('/api/global/templates/delete/:sequence_id', async (req, res) => {
  const release = await getMutex(GLOBAL_XLSX).acquire();
  try {
    const sequenceId = req.params.sequence_id;
    const rows = readAll(GLOBAL_XLSX, GSHEETS.templates);
    const keep = rows.filter(r => (r.sequence_id || r.sequenceId) !== sequenceId);
    writeReplace(GLOBAL_XLSX, GSHEETS.templates, keep);
    res.json({ ok: true, deleted: sequenceId });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
  finally { release(); }
});
app.post('/api/global/templates/active', async (req, res) => {
  const release = await getMutex(LOCAL_XLSX).acquire();
  try {
    const { name = '' } = (req.body || {});
    const st = readAll(LOCAL_XLSX, SHEETS.settings);
    const row2 = st[0] || { 'Signatur': '' };
    row2['active_template_global'] = name;
    writeReplace(LOCAL_XLSX, SHEETS.settings, [row2]);
    res.json({ ok: true, name });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
  finally { release(); }
});

// Blacklist (GLOBAL)
app.get('/api/global/blacklist', (req, res) => {
  try {
    const q = String(req.query.q || '').toLowerCase();
    const bounces = String(req.query.bounces || '0') === '1';
    const bl = readAll(GLOBAL_XLSX, GSHEETS.blacklist).map(r=>r.email).filter(Boolean);
    const bo = bounces ? readAll(GLOBAL_XLSX, GSHEETS.bounce).map(r=>r.email).filter(Boolean) : [];
    const filt = (x)=> q ? String(x).toLowerCase().includes(q) : true;
    res.json({ blacklist: bl.filter(filt), bounces: bo.filter(filt) });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});
app.post('/api/global/blacklist', async (req, res) => {
  const release = await getMutex(GLOBAL_XLSX).acquire();
  try {
    const email = String((req.body || {}).email || '').trim();
    if (!email) return res.status(400).json({ error: 'email required' });
    appendRows(GLOBAL_XLSX, GSHEETS.blacklist, [{ email }]);
    res.json({ ok: true, email });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
  finally { release(); }
});

// Error List (GLOBAL)
function uuidLike() {
  const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
  return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
}
app.get('/api/global/error_list', (req, res) => {
  try {
    const rows = readAll(GLOBAL_XLSX, GSHEETS.error_list).map(r => {
      const v = String(r.visible ?? 'TRUE').toUpperCase();
      return { ...r, id: r.id || uuidLike(), visible: (v==='FALSE'?'FALSE':'TRUE') };
    });
    res.json({ rows: rows.filter(r => String(r.visible).toUpperCase() !== 'FALSE') });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});
app.post('/api/global/error_list/add', async (req, res) => {
  const release = await getMutex(GLOBAL_XLSX).acquire();
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ error: 'no rows' });
    const withMeta = rows.map(r => ({ ...r, id: r.id || uuidLike(), visible: 'TRUE' }));
    appendRows(GLOBAL_XLSX, GSHEETS.error_list, withMeta);
    res.json({ ok: true, inserted: withMeta.length });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
  finally { release(); }
});
app.post('/api/global/error_list/delete', async (req, res) => {
  const release = await getMutex(GLOBAL_XLSX).acquire();
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length) return res.status(400).json({ error: 'no ids' });
    const rows = readAll(GLOBAL_XLSX, GSHEETS.error_list);
    const keep = rows.filter(r => !ids.includes(String(r.id||'')));
    writeReplace(GLOBAL_XLSX, GSHEETS.error_list, keep);
    res.json({ ok: true, deleted: ids.length });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
  finally { release(); }
});
app.post('/api/global/error_list/visible', async (req, res) => {
  const release = await getMutex(GLOBAL_XLSX).acquire();
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const visible = String(req.body?.visible).toUpperCase() === 'FALSE' ? 'FALSE' : 'TRUE';
    if (!ids.length) return res.status(400).json({ error: 'no ids' });
    const rows = readAll(GLOBAL_XLSX, GSHEETS.error_list);
    let updated = 0;
    for (const r of rows) {
      if (ids.includes(String(r.id||'')) && String(r.visible||'TRUE').toUpperCase() !== visible) {
        r.visible = visible; updated++;
      }
    }
    writeReplace(GLOBAL_XLSX, GSHEETS.error_list, rows);
    res.json({ ok: true, updated, visible });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
  finally { release(); }
});

// Signatures (GLOBAL)
app.get('/api/global/signatures', (req, res) => {
  try {
    const list = readAll(GLOBAL_XLSX, GSHEETS.signatures)
      .map(r=>({ name: r.name||'', html: r.html||'' }))
      .filter(x=>x.name);
    res.json({ list });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});
app.post('/api/global/signatures/save', async (req, res) => {
  const release = await getMutex(GLOBAL_XLSX).acquire();
  try {
    const { name = '', html = '' } = (req.body || {});
    if (!name) return res.status(400).json({ error: 'name required' });
    const rows = readAll(GLOBAL_XLSX, GSHEETS.signatures);
    let found = false;
    const out = rows.map(r => {
      if ((r.name || '').toLowerCase() === name.toLowerCase()) { found = true; return { name, html }; }
      return r;
    });
    if (!found) out.push({ name, html });
    writeReplace(GLOBAL_XLSX, GSHEETS.signatures, out);
    res.json({ ok: true, name });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
  finally { release(); }
});
app.post('/api/global/signatures/active', async (req, res) => {
  const release = await getMutex(LOCAL_XLSX).acquire();
  try {
    const { name = '' } = (req.body || {});
    const st = readAll(LOCAL_XLSX, SHEETS.settings);
    const row2 = st[0] || { 'Signatur': '' };
    row2['active_signature_scope'] = 'global';
    row2['active_signature_name']  = name;
    writeReplace(LOCAL_XLSX, SHEETS.settings, [row2]);
    res.json({ ok: true, scope: 'global', name });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
  finally { release(); }
});
app.post('/api/global/signatures/delete/:name', async (req, res) => {
  const release = await getMutex(GLOBAL_XLSX).acquire();
  try {
    const nm = req.params.name;
    if (!nm) return res.status(400).json({ error: 'name missing' });
    const rows = readAll(GLOBAL_XLSX, GSHEETS.signatures);
    const keep = rows.filter(r => String(r.name||'').toLowerCase() !== String(nm).toLowerCase());
    writeReplace(GLOBAL_XLSX, GSHEETS.signatures, keep);
    res.json({ ok: true, deleted: nm });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
  finally { release(); }
});

// ---- start ----
const PORT = Number(process.env.PORT || 8080);
app.listen(PORT, () => console.log(`Excel API running on :${PORT}`));
