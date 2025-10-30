/* ==== PART 1 ==== */
/* ===== avus smart-cap Dashboard – Core, API, Helpers, UI Primitives ===== */

/** --- Boot-Fixes: Babel-Warnung filtern + Fallback-Favicon injizieren --- */
(() => {
  // 1) Spezifische Babel-Standalone-Warnung rausfiltern
  try {
    const _origWarn = console.warn;
    console.warn = function (...args) {
      if (args && typeof args[0] === "string" && args[0].includes("in-browser Babel transformer")) return;
      return _origWarn.apply(this, args);
    };
  } catch {}

  // 2) Fallback-Favicon (verhindert 404)
  try {
    if (!document.querySelector('link[rel="icon"]')) {
      const link = document.createElement("link");
      link.rel = "icon";
      link.href = "data:;base64,=";
      document.head.appendChild(link);
    }
  } catch {}
})();

/** --- CSS Self-Heal: injiziere Critical CSS, falls style.css nicht greift --- */
(() => {
  const TEST_CLASS = '___css_probe_btn';
  // Probe-Button anlegen
  const probe = document.createElement('button');
  probe.className = `btn ${TEST_CLASS}`;
  probe.style.position = 'absolute';
  probe.style.left = '-9999px';
  document.body.appendChild(probe);

  // Nach einem Tick prüfen, ob .btn sichtbar gestylt ist (border-radius oder background nicht default)
  requestAnimationFrame(() => {
    const cs = getComputedStyle(probe);
    const radius = parseFloat(cs.borderTopLeftRadius) || 0;
    const hasStyle = radius >= 8 || /rgb|#/.test(cs.backgroundColor || '');

    document.body.removeChild(probe);

    if (hasStyle) {
      console.log('[css] external style.css aktiv.');
      return; // Externe Styles wirken, nichts tun.
    }

    console.warn('[css] external style.css scheint NICHT zu greifen. Injektiere Fallback-CSS.');
    const css = `
@import url('https://fonts.googleapis.com/css2?family=Merriweather+Sans:wght@400;800&display=swap');
:root{
  --avus-blue:#003360; --avus-green:#c5d301; --avus-orange:#f49611;
  --bg:#f6f6f4; --text:#0e1220; --muted:#5c667a; --card:#ffffff; --border:#e3e7ee;
  --shadow:0 8px 24px rgba(0,0,0,.06);
}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;font:16px/1.45 "Merriweather Sans",system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:var(--text);background:var(--bg)}
.container{max-width:1200px;margin:24px auto;padding:0 16px}
header{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;padding:24px 16px 8px}
.brand{font-weight:800;font-size:48px;letter-spacing:.5px;color:var(--avus-blue)}
.nav{display:flex;gap:8px;flex-wrap:wrap}
main{padding:8px 16px}
.grid{display:grid;gap:16px}
.grid.cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}
@media (max-width:980px){ .grid.cols-2{grid-template-columns:1fr} }
.row{display:flex;gap:12px}
.row.vcenter{align-items:center}
.row.between{justify-content:space-between}
.row.end{justify-content:flex-end}
.wrap{flex-wrap:wrap}
.spacer-8{height:8px}
.card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:16px;box-shadow:var(--shadow)}
section.card h3{margin:0 0 4px 0;font-size:20px}
.btn{-webkit-appearance:none;appearance:none;border:1px solid var(--border);background:#fff;padding:8px 12px;border-radius:10px;font-weight:600;cursor:pointer;transition:.15s transform,.15s box-shadow}
.btn:hover{transform:translateY(-1px);box-shadow:0 6px 16px rgba(0,0,0,.06)}
.btn:disabled{opacity:.55;cursor:not-allowed;transform:none;box-shadow:none}
.btn.primary{background:var(--avus-orange);border-color:var(--avus-orange);color:#111}
.btn.danger{background:#e5484d;border-color:#e5484d;color:#fff}
.pill{border:1px solid var(--border);padding:4px 10px;border-radius:999px;background:#fff;cursor:pointer;font-weight:600;font-size:12px}
.pill-on{background:var(--avus-green);border-color:var(--avus-green);color:#10140a}
.pill-off{color:var(--muted)}
.toolbar{display:flex;gap:12px;flex-wrap:wrap;background:#fff;border:1px solid var(--border);border-radius:12px;padding:10px 12px}
.toolbar input,.toolbar select{border:1px solid var(--border);border-radius:8px;padding:8px;background:#fff}
.field{display:grid;gap:6px}
.field>span{font-size:12px;color:var(--muted)}
.field.row{display:flex;align-items:center}
.field input,.field textarea,.field select{width:100%;border:1px solid var(--border);border-radius:10px;padding:10px;background:#fff;font:inherit}
textarea{resize:vertical}
.list{display:grid;gap:10px}
.list .strong{font-weight:800}
.muted{color:var(--muted)}
.tag{display:inline-block;background:#eef3ff;border:1px solid #d6e2ff;color:#2a3d6a;padding:6px 10px;border-radius:999px;font-size:12px;font-weight:700}
.kpi{display:grid;gap:4px;align-items:center;justify-items:center;padding:18px}
.kpi-num{font-size:28px;font-weight:800;color:var(--avus-blue)}
.table-wrap{overflow:auto;border:1px solid var(--border);border-radius:12px;background:#fff}
.table{width:100%;border-collapse:separate;border-spacing:0}
.table.small td,.table.small th{padding:8px 10px;border-bottom:1px solid var(--border)}
.table.small thead th{background:#f3f6fb;color:#2a3d6a;font-weight:800}
.table.small tbody tr:nth-child(odd){background:#fcfdff}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace}
.error{background:#ffecee;border:1px solid #ffc6cb;color:#8b1c24;padding:10px 12px;border-radius:12px}
.sig-preview{border:1px dashed var(--border);border-radius:10px;padding:10px;background:#fff}
.nav .btn{border-radius:12px}
.nav .btn.active{background:var(--avus-blue);border-color:var(--avus-blue);color:#fff}
.hero{height:120px;border-radius:14px;background:linear-gradient(180deg,#f0f2f7,#c9d1dd);border:1px solid var(--border);box-shadow:var(--shadow)}
.bad{background:#fff4f4 !important;border:1px solid #f5c4c4}
`;
    const tag = document.createElement('style');
    tag.setAttribute('data-injected', 'avus-fallback');
    tag.appendChild(document.createTextNode(css));
    document.head.appendChild(tag);
  });
})();

/** React aliases */
const { useState, useEffect, useMemo, useCallback, useRef, Fragment } = React;

/** =====================
 *  CONFIG / API PATHS
 *  ===================== */
const API_BASE = "https://script.google.com/macros/s/AKfycbz1KyuZJlXy9xpjLipMG1ppat2bQDjH361Rv_P8TIGg5Xcjha1HPGvVGRV1xujD049DOw/exec";

/* --- API (ohne führenden Slash in path) --- */
const API = {
  // LOCAL
  contacts: (limit, includeInactive = true) =>
    `${API_BASE}?path=api/contacts&limit=${encodeURIComponent(limit || 50)}&includeInactive=${includeInactive ? 1 : 0}`,
  stats: () => `${API_BASE}?path=api/stats`,
  templates: () => `${API_BASE}?path=api/templates`,
  saveTemplate: (sequenceId) => `${API_BASE}?path=${encodeURIComponent("api/templates/" + sequenceId)}`,
  setActiveTemplate: () => `${API_BASE}?path=api/templates/active`,
  templatesActive: () => `${API_BASE}?path=api/templates/active`,

  // Signatures (lokal)
  signaturesLocal: () => `${API_BASE}?path=api/signatures`,
  signaturesLocalSave: () => `${API_BASE}?path=api/signatures/save`,
  signatureStandard: () => `${API_BASE}?path=api/signatures/standard`,
  signatureSaveActive: () => `${API_BASE}?path=api/signatures/active`,
  signaturesActive: () => `${API_BASE}?path=api/signatures/active`,
  deleteSignature: (name) => `${API_BASE}?path=${encodeURIComponent("api/signatures/delete/" + name)}`,

  blacklistLocal: (q, includeBounces) =>
    `${API_BASE}?path=api/blacklist&q=${encodeURIComponent(q || "")}&bounces=${includeBounces ? 1 : 0}`,

  setActive: () => `${API_BASE}?path=api/contacts/active`,
  setTodo: () => `${API_BASE}?path=api/contacts/todo`,
  removeContact: () => `${API_BASE}?path=api/contacts/remove`,

  upload: () => `${API_BASE}?path=api/upload`,
  prepareCampaign: () => `${API_BASE}?path=api/campaign/prepare`,
  startCampaign: () => `${API_BASE}?path=api/campaign/start`,
  stopCampaign: () => `${API_BASE}?path=api/campaign/stop`,

  // GLOBAL
  global: {
    templates: () => `${API_BASE}?path=api/global/templates`,
    saveTemplate: (sequenceId) => `${API_BASE}?path=${encodeURIComponent("api/global/templates/" + sequenceId)}`,
    setActiveTemplate: () => `${API_BASE}?path=api/global/templates/active`,

    signatures: () => `${API_BASE}?path=api/global/signatures`,
    signatureSave: () => `${API_BASE}?path=api/global/signatures/save`,
    signatureSetActive: () => `${API_BASE}?path=api/global/signatures/active`,

    blacklist: (q, includeBounces) => `${API_BASE}?path=api/global/blacklist&q=${encodeURIComponent(q || "")}&bounces=${includeBounces ? 1 : 0}`,
    addBlacklist: () => `${API_BASE}?path=api/global/blacklist`,

    errorsList: () => `${API_BASE}?path=api/global/error_list`,
    errorsAdd: () => `${API_BASE}?path=api/global/error_list/add`,
    errorsDelete: () => `${API_BASE}?path=api/global/error_list/delete`,
    errorsHide: () => `${API_BASE}?path=api/global/error_list/hide`, // Soft-Delete (visible=FALSE)
  },
};

/* --- HTTP-Layer (POST-only Reads, kein Preflight, Retry/Backoff) --- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url, options = {}, tries = 5) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.status === 429 || res.status === 503) {
        const wait = 250 * Math.pow(2, i) + Math.floor(Math.random() * 200);
        await sleep(wait);
        continue;
      }
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${url} ${txt.slice(0, 200)}`);
      }
      const txt = await res.text();
      try { return JSON.parse(txt); } catch { return { text: txt }; }
    } catch (err) {
      lastErr = err;
      await sleep(200 * (i + 1));
    }
  }
  throw lastErr || new Error(`Request failed: ${url}`);
}

// Reads → POST ohne Body, damit kein CORS-Preflight entsteht
async function httpGet(url) {
  return fetchWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: "",
  });
}
async function httpPost(url, body) {
  return fetchWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body || {}),
  });
}

// Plain-POST (Alias, semantisch getrennt)
const postPlain = (url, body) => httpPost(url, body);

// In Batches posten (z. B. große Uploads/Fixes)
async function postInBatches(url, rows, batchSize = 300) {
  const arr = Array.isArray(rows) ? rows : [];
  let inserted = 0;
  for (let i = 0; i < arr.length; i += batchSize) {
    const chunk = arr.slice(i, i + batchSize);
    const r = await httpPost(url, { rows: chunk });
    if (r && typeof r.inserted === "number") inserted += r.inserted;
    else inserted += chunk.length;
    await sleep(120);
  }
  return { inserted };
}

/** ============ helpers ============ */
function cn(...xs) { return xs.filter(Boolean).join(" "); }
function isEmail(x) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x || ""); }
function asBoolTF(v){ return String(v).toUpperCase() === "TRUE" || v === true; }
const toTF = (b) => (b ? "TRUE" : "FALSE");
function fmtDate(d){ if(!d) return ""; const dt=new Date(d); return isNaN(dt)?String(d):dt.toLocaleString(); }
// Steps-Helfer (max 5)
const clampSteps = (n) => Math.max(1, Math.min(5, Math.round(Number(n) || 1)));

/** ============ CSV/PDF parsing (gekürzt – unverändert) ============ */
// … (lass deine vorhandenen parseCSV/parsePDF aus der letzten Version hier drin)

/** ============ UI primitives ============ */
function PillToggle({ on, onLabel = "On", offLabel = "Off", onClick }) {
  return <button className={cn("pill", on ? "pill-on" : "pill-off")} onClick={onClick}>{on ? onLabel : offLabel}</button>;
}
function Switch({ checked, onChange, labelOn = "On", labelOff = "Off" }) {
  return (
    <button
      className={cn("pill", checked ? "pill-on" : "pill-off")}
      onClick={() => onChange(!checked)}
      type="button"
      aria-pressed={!!checked}
      title={checked ? labelOn : labelOff}
    >
      {checked ? labelOn : labelOff}
    </button>
  );
}
function KpiCard({ label, value }) {
  return (
    <section className="card kpi">
      <div className="kpi-num">{value}</div>
      <div className="muted">{label}</div>
    </section>
  );
}
function Toolbar({ children }) { return <div className="toolbar">{children}</div>; }
function Section({ title, right, children, className }) {
  return (
    <section className={cn("card", className)}>
      <div className="row between vcenter">
        <h3>{title}</h3>{right}
      </div>
      <div className="spacer-8" />
      {children}
    </section>
  );
}
function Field({ label, children, inline }) {
  return (
    <label className={cn("field", inline && "row vcenter gap")}>
      <span>{label}</span>
      {children}
    </label>
  );
}
function TextButton({ children, onClick, disabled }) { return (<button className="btn" onClick={onClick} disabled={disabled}>{children}</button>); }
function PrimaryButton({ children, onClick, disabled }) { return (<button className="btn primary" onClick={onClick} disabled={disabled}>{children}</button>); }
/* ==== END PART 1 ==== */

                                                         
















                                                         




                                                         




                                                         
/* =========================
 * Part 2 — Dashboard
 * ========================= */

function Dashboard() {
  const [stats, setStats] = React.useState({ sent: 0, replies: 0, hot: 0, needReview: 0, meetings: 0 });
  const [contacts, setContacts] = React.useState([]);
  const [limit, setLimit] = React.useState(25);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [perDay, setPerDay] = React.useState(25);
  const [campaignRunning, setCampaignRunning] = React.useState(false);
  const [updates, setUpdates] = React.useState({});
  const [showInactive, setShowInactive] = React.useState(true);
  const [todoUpdates, setTodoUpdates] = React.useState({});

  // NEW: aktive Signatur/Template-Anzeigen
  const [activeSig, setActiveSig] = React.useState({ scope: "", name: "" });
  const [activeTpl, setActiveTpl] = React.useState({ local: "", global: "" });

  const loadAll = React.useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [s, c, sigA, tplA] = await Promise.all([
        httpGet(API.stats()),
        httpGet(API.contacts(limit, showInactive)),
        httpGet(API.signaturesActive()),
        httpGet(API.templatesActive()),
      ]);
      setStats(s);

      const arr = Array.isArray(c.contacts) ? c.contacts : [];
      const norm = arr.map(r => ({ ...r, active: asBoolTF(r.active) }));
      setContacts(norm);

      setActiveSig({ scope: sigA.scope || "", name: sigA.name || "" });
      setActiveTpl({ local: tplA.local || "", global: tplA.global || "" });
    } catch (e) {
      setError(e.message || "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, [limit, showInactive]);

  React.useEffect(() => { loadAll(); }, [loadAll]);

  const toggleActive = (email, next) => {
    setUpdates(prev => ({ ...prev, [email]: { ...(prev[email] || {}), active: next } }));
    setContacts(prev => prev.map(r => r.email === email ? { ...r, active: next } : r));
  };
  const toggleTodo = (email, next) => {
    setTodoUpdates(prev => ({ ...prev, [email]: { ...(prev[email] || {}), todo: next } }));
    setContacts(prev => prev.map(r => r.email === email ? { ...r, todo: next } : r));
  };

  const saveActive = async () => {
    const payload = Object.entries(updates).map(([email, u]) => ({ email, active: !!u.active }));
    if (!payload.length) return;
    try {
      await httpPost(API.setActive(), { updates: payload });
      setUpdates({});
      alert("Aktiv-Status gespeichert");
    } catch (e) {
      alert(e.message || "Fehler beim Speichern");
    }
  };

  const saveTodos = async () => {
    const payload = Object.entries(todoUpdates).map(([email, u]) => ({ email, todo: !!u.todo }));
    if (!payload.length) return;
    try {
      await httpPost(API.setTodo(), { updates: payload });
      setTodoUpdates({});
      alert("To-Dos gespeichert");
    } catch (e) {
      alert(e.message || "Fehler beim Speichern");
    }
  };

  const start = async () => {
    setCampaignRunning(true);
    try {
      await httpPost(API.startCampaign(), {});
      alert('Kampagne gestartet: status="go" für alle Leads gesetzt.');
    } catch (e) {
      setError(e.message);
    }
  };
  const stop  = async () => {
    setCampaignRunning(false);
    try { await httpPost(API.stopCampaign(), {}); }
    catch (e) { setError(e.message); }
  };

  const finishedTodos = React.useMemo(
    () => contacts.filter((r) =>
      String(r.finished).toUpperCase() === "TRUE" &&
      String(r.todo).toUpperCase() === "TRUE"
    ),
    [contacts]
  );

  return (
    <section className="grid gap">
      {error && <div className="error">{error}</div>}

      <div className="grid cols-2 gap">
        <Section title="To-Dos (angeschrieben)">
          <div className="list">
            {finishedTodos.map((r) => (
              <div key={r.email} className="row between vcenter">
                <div>{r.firstName} {r.lastName} · {r.company}</div>
                <Switch
                  checked={asBoolTF(r.todo)}
                  onChange={(v) => toggleTodo(r.email, v)}
                  labelOn="TODO"
                  labelOff="—"
                />
              </div>
            ))}
          </div>
          <div className="row end">
            <PrimaryButton onClick={saveTodos} disabled={!Object.keys(todoUpdates).length}>Änderungen speichern</PrimaryButton>
          </div>
        </Section>

        <Section title="Kampagneneinstellungen"
          right={<TextButton onClick={loadAll} disabled={loading}>Neu laden</TextButton>}
        >
          <div className="grid gap">
            <div className="row gap wrap">
              <Field label="Sendouts pro Tag">
                <input type="number" min="0" value={perDay} onChange={(e) => setPerDay(Number(e.target.value || 0))} />
              </Field>
              <div className="row gap">
                <PrimaryButton onClick={start} disabled={campaignRunning}>Kampagne starten</PrimaryButton>
                <TextButton onClick={stop} disabled={!campaignRunning}>Stoppen</TextButton>
                <TextButton onClick={async ()=>{
                  try { await httpPost(API.prepareCampaign(), {}); alert("Vorbereitung ausgelöst"); }
                  catch(e){ alert(e.message || "Fehler bei Vorbereitung"); }
                }}>Vorbereiten</TextButton>
              </div>
            </div>

            <div className="grid gap">
              <div className="tag">Aktive Signatur: <strong>{activeSig.scope}/{activeSig.name || "—"}</strong></div>
              <div className="tag">Aktives Template (lokal): <strong>{activeTpl.local || "—"}</strong></div>
              <div className="tag">Aktives Template (global): <strong>{activeTpl.global || "—"}</strong></div>
            </div>
          </div>
        </Section>
      </div>

      <div className="grid cols-2 gap">
        <KpiCard label="Gesendet" value={stats.sent} />
        <KpiCard label="Replies" value={stats.replies} />
        <KpiCard label="HOT" value={stats.hot} />
        <KpiCard label="Need Review" value={stats.needReview} />
      </div>

      <Section
        title="Kontakte"
        right={
          <div className="row gap">
            <Field inline label="Limit">
              <input type="number" min="1" value={limit} onChange={(e) => setLimit(Number(e.target.value || 1))}/>
            </Field>
            <Field inline label="Inaktive zeigen">
              <Switch checked={showInactive} onChange={setShowInactive} />
            </Field>
            <TextButton onClick={loadAll} disabled={loading}>Neu laden</TextButton>
          </div>
        }
      >
        <div className="list">
          {contacts.map((r) => (
            <div key={`${r.email}-${r.id || ''}`} className={cn("row between vcenter", !asBoolTF(r.active) && "muted")}>
              <div className="row gap">
                <div className="strong">{r.firstName} {r.lastName}</div>
                <div className="muted">· {r.company}</div>
                <div className="muted">· {r.email}</div>
              </div>
              <Switch
                checked={asBoolTF(r.active)}
                onChange={(v) => toggleActive(r.email, v)}
                labelOn="Aktiv"
                labelOff="Inaktiv"
              />
            </div>
          ))}
        </div>
        <div className="row end">
          <PrimaryButton onClick={saveActive} disabled={!Object.keys(updates).length}>Änderungen speichern</PrimaryButton>
        </div>
      </Section>
    </section>
  );
}






























/* =========================
 * Part 3 — Templates
 * ========================= */

function Templates() {
  const [scope, setScope] = React.useState("local");
  const [localList, setLocalList] = React.useState([]);
  const [globalList, setGlobalList] = React.useState([]);
  const [activeName, setActiveName] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [cursorTarget, setCursorTarget] = React.useState(null);
  const [totalSteps, setTotalSteps] = React.useState(1);

  // NEW: Anzeige aktive Templates
  const [activeTpl, setActiveTpl] = React.useState({ local: "", global: "" });

  const load = React.useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const [loc, glob, act] = await Promise.all([
        httpGet(API.templates()),
        httpGet(API.global.templates()),
        httpGet(API.templatesActive()),  // { local, global }
      ]);
      const a = Array.isArray(loc) ? loc : [];
      const b = Array.isArray(glob) ? glob : [];
      setLocalList(a); setGlobalList(b);
      setActiveTpl({ local: act.local || "", global: act.global || "" });

      const first = (scope === "local" ? a : b);
      setActiveName(first[0]?.name || "");
      const steps = first[0]?.steps || [];
      const tsRaw = typeof first[0]?.total_steps === "number" ? first[0].total_steps : steps.length || 1;
      setTotalSteps(clampSteps(tsRaw));
    } catch (e) {
      setErr(e.message || "Fehler");
    } finally {
      setLoading(false);
    }
  }, [scope]);

  React.useEffect(() => { load(); }, [load]);

  const list = scope === "local" ? localList : globalList;
  const setListByScope = (fn) => { if (scope === "local") setLocalList(fn); else setGlobalList(fn); };
  const tpl = React.useMemo(() => list.find((t) => t.name === activeName) || null, [list, activeName]);

  React.useEffect(() => {
    if (!tpl) return;
    const len = Array.isArray(tpl.steps) ? tpl.steps.length : 0;
    const tsRaw = typeof tpl.total_steps === "number" ? tpl.total_steps : (len || 1);
    setTotalSteps(clampSteps(tsRaw));
  }, [tpl]);

  const updateStep = (idx, patch) => {
    setListByScope(prev => prev.map(t =>
      t.name !== activeName ? t : ({ ...t, steps: (t.steps || []).map((s, i) => i === idx ? { ...s, ...patch } : s) })
    ));
  };

  const save = async () => {
    if (!tpl) return;
    const safeTotal = clampSteps(totalSteps);
    const payload = {
      sequence_id: activeName,
      total_steps: safeTotal,
      steps: (tpl.steps || []).slice(0, safeTotal).map((s) => ({
        step: s.step || "",
        subject: s.subject || "",
        body_html: s.body_html || "",
        delay_days: Number(s.delay_days || 0),
      })),
    };
    try {
      if (scope === "local") await httpPost(API.saveTemplate(activeName), payload);
      else await httpPost(API.global.saveTemplate(activeName), payload);
      alert("Template gespeichert");
    } catch (e) {
      alert(e.message || "Fehler");
    }
  };

  // „Löschen“ durch Leeren der Sequenz (keine eigene Delete-Route erforderlich)
  const removeTemplate = async () => {
    if (!activeName) return;
    if (!confirm(`Template "${activeName}" wirklich leeren?`)) return;
    try {
      const payload = { sequence_id: activeName, total_steps: 0, steps: [] };
      if (scope === "local") await httpPost(API.saveTemplate(activeName), payload);
      else await httpPost(API.global.saveTemplate(activeName), payload);
      setListByScope(prev => prev.filter(t => t.name !== activeName));
      const nextName = (scope === "local" ? localList : globalList).find(t => t.name !== activeName)?.name || "";
      setActiveName(nextName);
      alert("Template geleert");
    } catch (e) {
      alert(e.message || "Fehler beim Leeren");
    }
  };

  const createNew = () => {
    const nm = prompt("Neuen Templatenamen eingeben:");
    if (!nm) return;
    const base = { name: nm, total_steps: 1, steps: [{ step: "1", subject: "", body_html: "", delay_days: 0 }] };
    setListByScope(prev => [{ ...base }, ...prev]);
    setActiveName(nm);
    setTotalSteps(1);
  };

  const insertAtCursor = (token) => {
    const el = cursorTarget; if (!el) return;
    const start = el.selectionStart || 0; const end = el.selectionEnd || 0;
    const value = el.value || "";
    const next = value.slice(0, start) + token + value.slice(end);
    const kind = el.dataset.kind;
    if (kind === "subject") el._updateSubject && el._updateSubject(next);
    else if (kind === "body") el._updateBody && el._updateBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };
  const setUpdateSubjectRef = (el, updater) => { if (el) el._updateSubject = updater; };
  const setUpdateBodyRef = (el, updater) => { if (el) el._updateBody = updater; };

  const visibleSteps = React.useMemo(() => {
    const arr = (tpl && Array.isArray(tpl.steps)) ? tpl.steps : [];
    const n = clampSteps(totalSteps);
    if (arr.length < n) {
      const fill = [];
      for (let i = arr.length; i < n; i++) fill.push({ step: String(i+1), subject:"", body_html:"", delay_days:0 });
      return [...arr, ...fill];
    }
    return arr.slice(0, n);
  }, [tpl, totalSteps]);

  const setActiveLocal = async () => {
    if (!activeName) return;
    try {
      await httpPost(API.setActiveTemplate(), { scope: "local", name: activeName });
      const act = await httpGet(API.templatesActive());
      setActiveTpl({ local: act.local || "", global: act.global || "" });
      alert(`Aktives Template (lokal): ${activeName}`);
    } catch (e) { alert(e.message || "Fehler"); }
  };
  const setActiveGlobal = async () => {
    if (!activeName) return;
    try {
      await httpPost(API.global.setActiveTemplate(), { name: activeName });
      const act = await httpGet(API.templatesActive());
      setActiveTpl({ local: act.local || "", global: act.global || "" });
      alert(`Aktives Template (global): ${activeName}`);
    } catch (e) { alert(e.message || "Fehler"); }
  };

  return (
    <section className="grid gap">
      {err && <div className="error">{err}</div>}

      <div className="row gap wrap">
        <Field label="Archiv">
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="local">Lokal</option>
            <option value="global">Global</option>
          </select>
        </Field>

        <Field label="Template">
          <select value={activeName} onChange={(e) => setActiveName(e.target.value)}>
            {list.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
          </select>
        </Field>

        <TextButton onClick={load} disabled={loading}>Neu laden</TextButton>
        <PrimaryButton onClick={createNew}>Neues Template</PrimaryButton>
        <TextButton onClick={removeTemplate} disabled={!activeName}>Leeren</TextButton>
      </div>

      {/* NEW: Anzeige aktive Templates */}
      <div className="row gap wrap">
        <div className="tag">Aktiv (lokal): <strong>{activeTpl.local || "—"}</strong></div>
        <div className="tag">Aktiv (global): <strong>{activeTpl.global || "—"}</strong></div>
        <TextButton onClick={setActiveLocal} disabled={!activeName}>Als aktiv setzen (lokal)</TextButton>
        <TextButton onClick={setActiveGlobal} disabled={!activeName}>Als aktiv setzen (global)</TextButton>
      </div>

      {tpl ? (
        <>
          <div className="card">
            <div className="row gap vcenter">
              <Field label="Total Steps">
                <div className="row gap">
                  {[1,2,3,4,5].map(n => (
                    <button key={n} onClick={() => setTotalSteps(n)} className={cn("btn", totalSteps===n && "primary")} type="button">{n}</button>
                  ))}
                </div>
              </Field>
              <div className="muted" style={{ alignSelf: 'end' }}>von {(tpl?.steps || []).length}</div>
            </div>
          </div>

          <div className="grid gap">
            {visibleSteps.map((s, i) => {
              const stepIndex = i + 1;
              return (
                <div key={i} className="card">
                  <div className="strong">{`Step ${stepIndex}`}</div>
                  <Field label="Betreff">
                    <input
                      value={s.subject || ""}
                      data-kind="subject"
                      onFocus={(e) => setCursorTarget(e.target)}
                      ref={(el) => { setUpdateSubjectRef(el, (v) => updateStep(i, { subject: v })); }}
                      onChange={(e) => updateStep(i, { subject: e.target.value })}
                    />
                  </Field>
                  <Field label="Body (HTML)">
                    <textarea
                      rows="8"
                      value={s.body_html || ""}
                      data-kind="body"
                      onFocus={(e) => setCursorTarget(e.target)}
                      ref={(el) => { setUpdateBodyRef(el, (v) => updateStep(i, { body_html: v })); }}
                      onChange={(e) => updateStep(i, { body_html: e.target.value })}
                    />
                  </Field>
                  <div className="row gap wrap">
                    {[
                      { key: "{{firstName}}", label: "Vorname" },
                      { key: "{{lastName}}", label: "Nachname" },
                      { key: "{{company}}", label: "Firma" },
                      { key: "{{position}}", label: "Position" },
                      { key: "{{sp_first_name}} {{sp_last_name}}", label: "Absender-Name" },
                    ].map((f) => (
                      <TextButton key={f.key} onClick={() => insertAtCursor(f.key)}>{f.label}</TextButton>
                    ))}
                  </div>
                  <Field label="Verzögerung (Tage)">
                    <input type="number" value={s.delay_days || 0} onChange={(e) => updateStep(i, { delay_days: Number(e.target.value || 0) })}/>
                  </Field>
                </div>
              );
            })}
            <div className="row end">
              <PrimaryButton onClick={save}>Template speichern</PrimaryButton>
            </div>
          </div>
        </>
      ) : (
        <div className="muted">Kein Template gewählt.</div>
      )}
    </section>
  );
}



































/* =========================
 * Part 4 — Signaturen
 * ========================= */

function Signatures() {
  const [listLocal, setListLocal] = React.useState([]);       // optionaler lokaler Pool (Sheet "signatures")
  const [stdHtml, setStdHtml]   = React.useState("");         // settings!A2 "Signatur"
  const [active, setActive]     = React.useState({ scope: "local", name: "standard" });
  const [globalList, setGlobal] = React.useState([]);         // globaler Pool (global sheet)

  const [loading, setLoading]   = React.useState(false);
  const [err, setErr]           = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const [std, loc, act, glob] = await Promise.all([
        httpGet(API.signatureStandard()),   // { html }
        httpGet(API.signaturesLocal()),     // { list, active }
        httpGet(API.signaturesActive()),    // { scope, name }
        httpGet(API.global.signatures()),   // { list }
      ]);
      setStdHtml(std.html || "");
      setListLocal(Array.isArray(loc.list) ? loc.list : []);
      setActive({ scope: act.scope || "local", name: act.name || "standard" });
      setGlobal(Array.isArray(glob.list) ? glob.list : []);
    } catch (e) {
      setErr(e.message || "Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const saveStandard = async () => {
    try {
      await httpPost(API.signatureSaveActive(), { scope: "local", name: "standard" }); // aktiv setzen
      // in settings: „Signatur“-Feld wird getrennt im Backend verwaltet; hier nur aktiv setzen
      alert("Standard-Signatur als aktiv gesetzt");
      const act = await httpGet(API.signaturesActive());
      setActive({ scope: act.scope || "local", name: act.name || "standard" });
    } catch (e) {
      alert(e.message || "Fehler beim Speichern");
    }
  };

  const setActiveSig = async (scope, name) => {
    try {
      if (scope === "global") {
        await httpPost(API.global.signatureSetActive(), { name });
      } else {
        await httpPost(API.signatureSaveActive(), { scope: "local", name });
      }
      const act = await httpGet(API.signaturesActive());
      setActive({ scope: act.scope || "local", name: act.name || "standard" });
      alert(`Aktive Signatur: ${scope}/${name}`);
    } catch (e) { alert(e.message || "Fehler beim Setzen aktiv"); }
  };

  const addLocal = async () => {
    const name = prompt("Namen für lokale Signatur:");
    if (!name) return;
    const html = prompt("HTML für diese Signatur (leer = später einfügen):") || "";
    try {
      await httpPost(API.signaturesLocalSave(), { name, html });
      await load();
      alert("Lokale Signatur gespeichert");
    } catch (e) { alert(e.message || "Fehler beim Speichern"); }
  };

  const addGlobal = async () => {
    const name = prompt("Namen für globale Signatur:");
    if (!name) return;
    const html = prompt("HTML für diese Signatur (leer = später einfügen):") || "";
    try {
      await httpPost(API.global.signatureSave(), { name, html });
      await load();
      alert("Globale Signatur gespeichert");
    } catch (e) { alert(e.message || "Fehler beim Speichern"); }
  };

  return (
    <section className="grid gap">
      {err && <div className="error">{err}</div>}

      <Section title="Standard (Settings)">
        <Field label="HTML">
          <textarea rows="8" value={stdHtml} onChange={(e) => setStdHtml(e.target.value)} readOnly />
        </Field>
        <div className="row gap">
          <TextButton onClick={saveStandard}>Als aktiv setzen (Standard)</TextButton>
          <div className="tag">Aktiv: <strong>{active.scope}/{active.name}</strong></div>
        </div>
      </Section>

      <div className="grid cols-2 gap">
        <Section title="Lokale Signaturen">
          <div className="list">
            {listLocal.map(s => (
              <div key={s.name} className="card">
                <div className="row between vcenter">
                  <div className="strong">{s.name}</div>
                  <TextButton onClick={() => setActiveSig("local", s.name)}>Als aktiv setzen</TextButton>
                </div>
                <div className="sig-preview" dangerouslySetInnerHTML={{ __html: s.html || "" }} />
              </div>
            ))}
          </div>
          <TextButton onClick={addLocal}>Neue lokale Signatur</TextButton>
        </Section>

        <Section title="Globale Signaturen">
          <div className="list">
            {globalList.map(s => (
              <div key={s.name} className="card">
                <div className="row between vcenter">
                  <div className="strong">{s.name}</div>
                  <TextButton onClick={() => setActiveSig("global", s.name)}>Als aktiv setzen</TextButton>
                </div>
                <div className="sig-preview" dangerouslySetInnerHTML={{ __html: s.html || "" }} />
              </div>
            ))}
          </div>
          <TextButton onClick={addGlobal}>Neue globale Signatur</TextButton>
        </Section>
      </div>
    </section>
  );
}


































/* ==== PART 5 ==== */
/** ============ BLACKLIST (GLOBAL) ============ */
function Blacklist() {
  const [q, setQ] = React.useState("");
  const [rows, setRows] = React.useState({ blacklist: [], bounces: [] });
  const [newEmail, setNewEmail] = React.useState("");
  const [err, setErr] = React.useState("");

  const load = React.useCallback(async () => {
    setErr("");
    try {
      const r = await httpGet(API.global.blacklist(q, true) + "&_=" + Date.now()); // Cache-Buster
      setRows({ blacklist: r.blacklist || [], bounces: r.bounces || [] });
    } catch (e) { setErr(e.message || "Fehler"); }
  }, [q]);

  React.useEffect(() => { load(); }, [load]);

  const add = async () => {
    const email = (newEmail || "").trim();
    if (!email || !isEmail(email)) return alert("Bitte gültige E-Mail");
    try {
      await httpPost(API.global.addBlacklist(), { email });
      setNewEmail("");
      await load();
    } catch (e) { alert(e.message || "Fehler"); }
  };

  return (
    <section className="grid gap">
      {err && <div className="error">{err}</div>}
      <Toolbar>
        <input placeholder="Suche" value={q} onChange={(e) => setQ(e.target.value)} />
        <TextButton onClick={load}>Suchen</TextButton>
      </Toolbar>

      <div className="grid cols-2 gap">
        <Section title="Blacklist">
          <ul className="list bulleted">
            {(rows.blacklist||[]).map((x, i) => (<li key={"bl-" + i}><span className="mono">{x}</span></li>))}
          </ul>
        </Section>
        <Section title="Bounces">
          <ul className="list bulleted">
            {(rows.bounces||[]).map((x, i) => (<li key={"bo-" + i}><span className="mono">{x}</span></li>))}
          </ul>
        </Section>
      </div>

      <Section title="Hinzufügen">
        <div className="row gap">
          <input placeholder="name@firma.de" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          <PrimaryButton onClick={add}>Hinzufügen</PrimaryButton>
        </div>
      </Section>
    </section>
  );
}

/** ============ ERROR LIST (GLOBAL PAGE) ============ */
function ErrorList() {
  const [rows, setRows] = React.useState([]);
  const [sel, setSel] = React.useState({}); // id -> true
  const [err, setErr] = React.useState("");

  // Filter + Suche
  const [search, setSearch] = React.useState("");
  const [filterCol, setFilterCol] = React.useState("");     // Spalte wählen
  const [onlyEmpty, setOnlyEmpty] = React.useState(true);   // nur leere anzeigen
  const errorCols = ['email','Anrede','firstName','lastName','company','phone','mobile','reason'];

  const load = React.useCallback(async () => {
    setErr("");
    try {
      const url = API.global.errorsList() + "&_=" + Date.now(); // Cache-Buster
      const r = await httpGet(url);
      const listRaw = Array.isArray(r?.rows) ? r.rows : (Array.isArray(r) ? r : []);
      // Defensiv: nur sichtbare anzeigen (Backend filtert bereits, hier doppelt)
      const visibleOnly = listRaw.filter(x => String(x.visible || 'TRUE').toUpperCase() !== 'FALSE');
      // Eindeutige IDs + Dedupe
      const map = new Map();
      for (let i = 0; i < visibleOnly.length; i++) {
        const x = visibleOnly[i] || {};
        const id = String(x.id || x._id || x.uuid || `row-${i}-${(x.email||'')}`);
        if (!map.has(id)) map.set(id, { ...x, id });
      }
      setRows(Array.from(map.values()));
    } catch (e) { setErr(e.message || "Fehler"); }
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const toggle = (id) => setSel(prev => ({ ...prev, [id]: !prev[id] }));
  const toggleAll = (checked) => {
    if (!rows.length) return;
    const next = {};
    if (checked) rows.forEach(r => next[r.id] = true);
    setSel(checked ? next : {});
  };

  // ➕ Soft-Hide statt Hard-Delete
  const removeSelected = async () => {
    const ids = rows.filter(r => sel[r.id]).map(r => r.id);
    if (!ids.length) return;
    if (!confirm(`${ids.length} Einträge ausblenden?`)) return;
    try {
      await httpPost(API.global.errorsVisible(), { ids, visible: false });
      // Lokal sofort aus der Sicht nehmen:
      setRows(prev => prev.filter(r => !ids.includes(r.id)));
      setSel({});
    } catch (e) {
      alert(e.message || "Fehler beim Ausblenden");
    }
  };

  const isBad = (row, key) => {
    if (["email","Anrede","firstName","lastName","company"].includes(key)) return !row[key];
    if (key === "phoneOrMobile") return !(row.phone || row.mobile);
    return false;
  };

  const filtered = React.useMemo(() => {
    const s = (search || "").toLowerCase();
    return rows.filter(r => {
      const txt = `${r.email||''} ${r.firstName||''} ${r.lastName||''} ${r.company||''}`.toLowerCase();
      if (s && !txt.includes(s)) return false;
      if (!filterCol) return true;
      const v = String(r[filterCol] ?? '').trim();
      return onlyEmpty ? v === '' : true;
    });
  }, [rows, search, filterCol, onlyEmpty]);

  const masterRef = React.useRef(null);
  const allChecked  = filtered.length > 0 && filtered.every(r => sel[r.id]);
  const someChecked = filtered.some(r => sel[r.id]) && !allChecked;
  React.useEffect(() => {
    if (masterRef.current) masterRef.current.indeterminate = someChecked;
  }, [someChecked, allChecked, filtered]);

  return (
    <section className="grid gap">
      {err && <div className="error">{err}</div>}

      <Toolbar>
        <input placeholder="Suchen…" value={search} onChange={(e)=>setSearch(e.target.value)} />
        <select value={filterCol} onChange={(e)=>setFilterCol(e.target.value)}>
          <option value="">— Spalte wählen —</option>
          {errorCols.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="row gap">
          <input type="checkbox" checked={onlyEmpty} onChange={(e)=>setOnlyEmpty(e.target.checked)} />
          nur leere anzeigen
        </label>
        <TextButton onClick={load}>Neu laden</TextButton>
        <PrimaryButton onClick={removeSelected} disabled={!filtered.some(r => sel[r.id])}>Erledigt (ausblenden)</PrimaryButton>
      </Toolbar>

      <div className="table-wrap">
        <table className="table small">
          <thead>
            <tr>
              <th style={{width:36}}>
                <input
                  ref={masterRef}
                  type="checkbox"
                  checked={allChecked}
                  onChange={(e)=>toggleAll(e.target.checked)}
                />
              </th>
              <th>email</th>
              <th>Anrede</th>
              <th>firstName</th>
              <th>lastName</th>
              <th>company</th>
              <th>phone</th>
              <th>mobile</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={!!sel[r.id]}
                    onChange={()=>toggle(r.id)}
                  />
                </td>
                <td className={isBad(r,"email")?"bad":""}>{r.email||""}</td>
                <td className={isBad(r,"Anrede")?"bad":""}>{r.Anrede||""}</td>
                <td className={isBad(r,"firstName")?"bad":""}>{r.firstName||""}</td>
                <td className={isBad(r,"lastName")?"bad":""}>{r.lastName||""}</td>
                <td className={isBad(r,"company")?"bad":""}>{r.company||""}</td>
                <td className={isBad(r,"phoneOrMobile")?"bad":""}>{r.phone||""}</td>
                <td className={isBad(r,"phoneOrMobile")?"bad":""}>{r.mobile||""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style>{`.bad{background:#281316;border:1px solid #5e2930}`}</style>
    </section>
  );
}
/* ==== END PART 5 ==== */

































/* =========================
 * Part 6 — Kontakte / Upload
 * ========================= */

function Contacts() {
  const [mode, setMode] = React.useState("append");
  const [rows, setRows] = React.useState([]);
  const [parseErr, setParseErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const onFile = async (e) => {
    setParseErr("");
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const name = (file.name || "").toLowerCase();
    try {
      if (name.endsWith(".csv")) {
        const text = await file.text();
        const parsed = parseCsvContacts(text); // deine bestehende CSV-Parse-Funktion
        setRows(parsed);
      } else if (name.endsWith(".pdf")) {
        const arrbuf = await file.arrayBuffer();
        const parsed = await parsePdfContacts(new Uint8Array(arrbuf)); // deine bestehende PDF-Parse-Funktion
        setRows(parsed);
      } else {
        setParseErr("Nur CSV oder PDF unterstützen wir hier.");
      }
    } catch (err) {
      setParseErr(err.message || "Fehler beim Parsen");
    }
  };

  // Buttonleiste ohne „Vorbereiten…“ (liegt jetzt im Dashboard)
  const Toolbar = () => (
    <div className="row gap wrap">
      <input type="file" accept=".csv,.pdf" onChange={onFile} />
      <select value={mode} onChange={(e) => setMode(e.target.value)}>
        <option value="append">Anhängen</option>
        <option value="overwrite" disabled>Überschreiben (Server)</option>
      </select>
      <TextButton onClick={upload} disabled={!rows.length || busy}>{busy ? "Lädt…" : "Upload ins Sheet"}</TextButton>
    </div>
  );

  const upload = async () => {
    if (!rows.length) return alert("Keine gültigen Zeilen");
    setBusy(true);
    try {
      // Globale Blacklist/Bounces (Plain-POST, GET nicht nötig)
      let g = { blacklist: [], bounces: [] };
      try { g = await postPlain(API.global.blacklist("", true), {}); } catch (_) {}

      // Validierung
      const requiredOk = (r) => !!(r.email && r.Anrede && r.firstName && r.lastName && r.company);
      const phoneOk    = (r) => !!(r.phone || r.mobile);

      const errors = [];
      for (const r of rows) {
        let reason = "";
        if (!requiredOk(r))                               reason = "MISSING_REQUIRED";
        else if (!phoneOk(r))                             reason = "MISSING_PHONE_OR_MOBILE";
        else if ((g.blacklist||[]).includes(r.email))     reason = "BLACKLIST";
        else if ((g.bounces||[]).includes(r.email))       reason = "BOUNCE";

        if (reason) {
          errors.push({
            email: r.email || "",
            Anrede: r.Anrede || "",
            firstName: r.firstName || "",
            lastName: r.lastName || "",
            company: r.company || "",
            phone: r.phone || "",
            mobile: r.mobile || "",
            reason
          });
        }
      }

      // 1) Fehler zusätzlich loggen
      if (errors.length) {
        await postInBatches(API.global.errorsAdd(), errors, 300);
      }

      // 2) ALLE Zeilen ins Upload-Tab
      const r = await postInBatches(API.upload(), rows, 250);

      alert(`Upload OK: ${r.inserted || rows.length} (alle Zeilen)${errors.length ? ` | Zusätzlich Fehler geloggt: ${errors.length}` : ""}`);
    } catch (e) {
      console.error(e);
      alert(e.message || "Fehler beim Upload");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="grid gap">
      <Section title="Kontakte hochladen" right={<Toolbar/>}>
        {parseErr && <div className="error">{parseErr}</div>}
        {rows.length ? (
          <div className="table">
            <div className="thead">
              {["email","Anrede","firstName","lastName","company","phone","mobile"].map(h => <div key={h} className="th">{h}</div>)}
            </div>
            <div className="tbody">
              {rows.slice(0,200).map((r,i) => (
                <div key={i} className="tr">
                  <div className="td">{r.email}</div>
                  <div className="td">{r.Anrede}</div>
                  <div className="td">{r.firstName}</div>
                  <div className="td">{r.lastName}</div>
                  <div className="td">{r.company}</div>
                  <div className="td">{r.phone}</div>
                  <div className="td">{r.mobile}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="muted">Noch keine Zeilen geladen.</div>
        )}
      </Section>
    </section>
  );
}

/* ==== END PART 6 ==== */

/* ==== BOOTSTRAP: App + globaler Export ==== */

// Kleines SPA-Shell mit Tabs
function App() {
  const { useState, Fragment } = React;

  const [tab, setTab] = useState("dashboard");

  const Tabs = [
    { id: "dashboard", label: "Dashboard", view: <Dashboard /> },
    { id: "contacts",  label: "Kontakte",  view: <Contacts /> },
    { id: "templates", label: "Templates", view: <Templates /> },
    { id: "signatures",label: "Signaturen",view: <Signatures /> },
    { id: "blacklist", label: "Blacklist", view: <Blacklist /> },
    { id: "errors",    label: "Fehlerliste", view: <ErrorList /> },
  ];

  return (
    <div className="container">
      <header className="topbar">
        <h1>avus smart-cap</h1>
        <nav className="tabs row gap wrap">
          {Tabs.map(t => (
            <button
              key={t.id}
              className={"btn" + (tab === t.id ? " primary" : "")}
              onClick={() => setTab(t.id)}
              type="button"
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="content">
        {Tabs.find(t => t.id === tab)?.view || <div className="error">Unbekannter Tab</div>}
      </main>
    </div>
  );
}

// Wichtig: global exportieren, damit index.html dich findet
window.App = App;

// Optionaler Auto-Mount (falls index.html kein mount-Fallback hat)
if (document.getElementById("app") && window.ReactDOM && !window.__AUTO_MOUNT_DONE__) {
  window.__AUTO_MOUNT_DONE__ = true;
  try {
    const root = ReactDOM.createRoot(document.getElementById("app"));
    root.render(<App />);
    console.log("[boot] App automatisch gemounted.");
  } catch (e) {
    console.warn("[boot] Auto-Mount nicht möglich:", e);
  }
}


                                                        
