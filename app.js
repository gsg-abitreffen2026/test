// ===== avus smart-cap Dashboard (global/local archives, todos, signatures, error list) =====
const { useState, useEffect, useMemo, useCallback, useRef, Fragment } = React;

/** =====================
 *  CONFIG / API PATHS
 *  ===================== */
const API_BASE =
  "https://script.google.com/macros/s/AKfycbz1KyuZJlXy9xpjLipMG1ppat2bQDjH361Rv_P8TIGg5Xcjha1HPGvVGRV1xujD049DOw/exec";

const API = {
  // LOCAL
  contacts: (limit, includeInactive = true) =>
    `${API_BASE}?path=api/contacts&limit=${encodeURIComponent(limit || 50)}&includeInactive=${includeInactive ? 1 : 0}`,
  stats: () => `${API_BASE}?path=api/stats`,
  templates: () => `${API_BASE}?path=api/templates`,
  saveTemplate: (sequenceId) => `${API_BASE}?path=${encodeURIComponent("api/templates/" + sequenceId)}`,
  setActiveTemplate: () => `${API_BASE}?path=api/templates/active`,
  signatures: () => `${API_BASE}?path=api/signatures`,
  saveSignature: () => `${API_BASE}?path=api/signatures/save`,
  setActiveSignature: () => `${API_BASE}?path=api/signatures/active`,
  signaturesStandard: () => `${API_BASE}?path=api/signatures/standard`,

  blacklistLocal: (q, includeBounces) =>
    `${API_BASE}?path=api/blacklist&q=${encodeURIComponent(q || "")}&bounces=${includeBounces ? 1 : 0}`,

  toggleActive: () => `${API_BASE}?path=api/contacts/active`,
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
    saveSignature: () => `${API_BASE}?path=api/global/signatures/save`,
    setActiveSignature: () => `${API_BASE}?path=api/global/signatures/active`,

    blacklist: (q, includeBounces) => `${API_BASE}?path=api/global/blacklist&q=${encodeURIComponent(q || "")}&bounces=${includeBounces ? 1 : 0}`,
    addBlacklist: () => `${API_BASE}?path=api/global/blacklist`,

    errorsList: () => `${API_BASE}?path=api/global/error_list`,
    errorsAdd: () => `${API_BASE}?path=api/global/error_list/add`,
    errorsDelete: () => `${API_BASE}?path=api/global/error_list/delete`,
  },
};

/** =====================
 *  HTTP Layer (robust)
 *  ===================== */
async function fetchWithRetry(url, options = {}, tries = 5) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, options); // folgt Redirects normal
      if (res.status === 429 || res.status === 503) {
        const wait = 200 * Math.pow(2, i) + Math.floor(Math.random() * 120);
        await sleep(wait);
        continue;
      }
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${url} ${txt.slice(0, 120)}`);
      }
      const txt = await res.text();
      try { return JSON.parse(txt); } catch { return { text: txt }; }
    } catch (err) {
      lastErr = err;
      await sleep(150 * (i + 1));
    }
  }
  throw lastErr || new Error(`Request failed: ${url}`);
}
// httpGet: wieder echter GET (keine Header, kein Body, kein Preflight)
async function httpGet(url) {
  return fetchWithRetry(url, {
    method: "GET",
    // optional: cache ausschalten, damit Sheets-Änderungen sofort sichtbar sind
    cache: "no-store",
  });
}

async function httpPost(url, body) {
  return fetchWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body || {}),
  });
}

/** ============ helpers ============ */
function cn(...xs) { return xs.filter(Boolean).join(" "); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function isEmail(x) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x || ""); }
function asBoolTF(v){ return String(v).toUpperCase() === "TRUE"; }
function fmtDate(d){ if(!d) return ""; const dt=new Date(d); return isNaN(dt)?String(d):dt.toLocaleString(); }

/** ============ CSV/PDF parsing ============ */
function detectDelimiter(headerLine) {
  const c = (s, ch) => (s.match(new RegExp(`\\${ch}`, "g")) || []).length;
  const candidates = [{ d: ";", n: c(headerLine, ";") }, { d: ",", n: c(headerLine, ",") }, { d: "\t", n: c(headerLine, "\t") }];
  candidates.sort((a, b) => b.n - a.n);
  return candidates[0].n > 0 ? candidates[0].d : ",";
}
function normalizeKey(k) {
  const s = String(k || "").toLowerCase().replace(/\s+/g, "").replace(/[-_]/g, "");
  if (/^(email|e?mail|mailadresse)$/.test(s)) return "email";
  if (/^(lastname|nachname|name$)$/.test(s)) return "lastName";
  if (/^(firstname|vorname)$/.test(s)) return "firstName";
  if (/^(company|firma|unternehmen|organisation)$/.test(s)) return "company";
  if (/^(position|titel|rolle)$/.test(s)) return "position";
  if (/^(phone|telefon|telefonnummer|tel)$/.test(s)) return "phone";
  if (/^(mobile|handy|mobil)$/.test(s)) return "mobile";
  if (/^(anrede|salutation|gruß|gruss|grussformel)$/.test(s)) return "Anrede";
  return k;
}
function splitCSV(line, delim) {
  const out = []; let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === delim && !inQ) { out.push(cur); cur = ""; }
    else { cur += ch; }
  }
  out.push(cur);
  return out;
}
async function parseCSV(file) {
  const textRaw = await file.text();
  const text = textRaw.replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return [];
  const delim = detectDelimiter(lines[0]);
  const headersRaw = splitCSV(lines[0], delim).map((h) => h.trim());
  const headers = headersRaw.map(normalizeKey);
  const data = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = splitCSV(lines[r], delim).map((c) => c.trim());
    const rec = {}; headers.forEach((h, i) => (rec[h] = cols[i] !== undefined ? cols[i] : ""));
    const email = rec.email || ""; const last = rec.lastName || ""; const comp = rec.company || "";
    if (email && last && comp) {
      data.push({
        email: email, lastName: last, company: comp,
        firstName: rec.firstName || "", position: rec.position || "",
        phone: rec.phone || "", mobile: rec.mobile || "",
        Anrede: rec.Anrede || "",
      });
    }
  }
  return data;
}
async function parsePDF(file) {
  const arrayBuf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuf }).promise;
  async function pageToLines(page) {
    const tc = await page.getTextContent();
    const items = tc.items.map((it) => { const [a,b,c,d,e,f]=it.transform; return { x:e, y:f, str:it.str }; });
    items.sort((p, q) => q.y - p.y || p.x - q.x);
    const lines = []; const EPS = 2.5;
    for (const t of items) { const L = lines.find((l) => Math.abs(l.y - t.y) < EPS); if (L) L.items.push(t); else lines.push({ y: t.y, items: [t] }); }
    return lines.map((L) => { L.items.sort((p, q) => p.x - q.x); return { y: L.y, items: L.items, text: L.items.map((i) => i.str).join(" ") }; });
  }
  function detectColumns(headerLine) {
    const map = {};
    if (headerLine && headerLine.items) {
      for (const it of headerLine.items) {
        const s = it.str.toLowerCase();
        if (!map.firma && s.includes("firma")) map.firma = it.x;
        if (!map.anrede && s.includes("anrede")) map.anrede = it.x;
        if (!map.vorname && s.includes("vorname")) map.vorname = it.x;
        if (!map.nachname && s.includes("nachname")) map.nachname = it.x;
        if (!map.telefon && s.includes("telefon")) map.telefon = it.x;
        if (!map.email && (s.includes("e-mail") || s.includes("email") || s.includes("anspr."))) map.email = it.x;
      }
    }
    return { firma: map.firma ?? 30, anrede: map.anrede ?? 170, vor: map.vorname ?? 230, nach: map.nachname ?? 310, tel: map.telefon ?? 430, mail: map.email ?? 520 };
  }
  function sliceByColumns(line, cols) {
    const buckets = { firma: [], anrede: [], vor: [], nach: [], tel: [], mail: [] };
    for (const it of line.items) {
      const x = it.x;
      const key = x < cols.anrede ? "firma" : x < cols.vor ? "anrede" : x < cols.nach ? "vor" : x < cols.tel ? "nach" : x < cols.mail ? "tel" : "mail";
      buckets[key].push(it.str);
    }
    const join = (arr) => arr.join(" ").replace(/\s+/g, " ").trim();
    return { company: join(buckets.firma), Anrede: join(buckets.anrede), first: join(buckets.vor), last: join(buckets.nach), phone: join(buckets.tel), email: join(buckets.mail) };
  }
  const collected = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const lines = await pageToLines(page);
    const header = lines.find((L) => /firma/i.test(L.text) && /anrede/i.test(L.text) && /vorname/i.test(L.text) && /nachname/i.test(L.text));
    const cols = header ? detectColumns(header) : detectColumns(lines[0] || { items: [] });
    for (const L of lines) {
      if (header && Math.abs(L.y - header.y) < 3) continue;
      const rec = sliceByColumns(L, cols);
      const hasEmail = /\S+@\S+\.\S+/.test(rec.email);
      const minimal = rec.company && rec.last;
      if (hasEmail || minimal) {
        collected.push({ email: hasEmail ? rec.email : "", firstName: rec.first, lastName: rec.last, company: rec.company, position: "", phone: rec.phone || "", mobile: "", Anrede: rec.Anrede || "" });
      }
    }
  }
  const seen = new Set(); const rows = [];
  for (const r of collected) {
    const key = r.email ? `e:${r.email.toLowerCase()}` : `c:${(r.company || "").toLowerCase()}|${(r.lastName || "").toLowerCase()}`;
    if (!seen.has(key)) { seen.add(key); rows.push(r); }
  }
  return rows;
}

/** ============ UI helpers (müssen vor Nutzung definiert sein) ============ */
function PillToggle({ on, onLabel = "On", offLabel = "Off", onClick }) {
  return <button className={cn("pill", on ? "pill-on" : "pill-off")} onClick={onClick}>{on ? onLabel : offLabel}</button>;
}
function Toolbar({ children }) { return <div className="toolbar">{children}</div>; }
function Section({ title, right, children, className }) {
  return (<section className={cn("card", className)}><div className="row between vcenter"><h3>{title}</h3>{right}</div><div className="spacer-8" />{children}</section>);
}
function Field({ label, children }) { return (<label className="field"><span>{label}</span>{children}</label>); }
function TextButton({ children, onClick, disabled }) { return (<button className="btn" onClick={onClick} disabled={disabled}>{children}</button>); }
function PrimaryButton({ children, onClick, disabled }) { return (<button className="btn primary" onClick={onClick} disabled={disabled}>{children}</button>); }
 /* ==== END PART 1 ==== */












                                                         




                                                         




                                                         
 /* ==== PART 2 ==== */
/** ============ APP ============ */
function App() {
  const [page, setPage] = React.useState("login");
  const [authed, setAuthed] = React.useState(false);
  const [user, setUser] = React.useState("Maxi");
  const [pw, setPw] = React.useState("");
  const [err, setErr] = React.useState("");

  const doLogin = React.useCallback((e) => {
    e && e.preventDefault();
    const ok = (user === "Maxi" || user === "Thorsten") && pw === "avus";
    if (ok) { setAuthed(true); setPage("dashboard"); setErr(""); }
    else setErr("Login fehlgeschlagen");
  }, [user, pw]);

  const doLogout = React.useCallback(() => {
    setAuthed(false); setPage("login"); setPw("");
  }, []);

  return (
    <div className="app">
      <Header authed={authed} onNav={setPage} onLogout={doLogout} active={page} />
      <main className="container">
        {!authed && page === "login" && (
          <Login user={user} setUser={setUser} pw={pw} setPw={setPw} onSubmit={doLogin} err={err} />
        )}
        {authed && page === "dashboard" && <Dashboard />}
        {authed && page === "templates" && <Templates />}
        {authed && page === "signaturen" && <Signaturen />}
        {authed && page === "blacklist" && <Blacklist />}
        {authed && page === "errors" && <ErrorList />}
        {authed && page === "kontakte" && <Kontakte />}
      </main>
    </div>
  );
}

function Header({ authed, onNav, onLogout, active }) {
  const tabs = [
    { key: "dashboard", label: "Dashboard" },
    { key: "templates", label: "Templates" },
    { key: "signaturen", label: "Signaturen" },
    { key: "blacklist", label: "Blacklist" },
    { key: "errors", label: "Fehlerliste" },
    { key: "kontakte", label: "Kontakte" },
  ];
  return (
    <header className="topbar">
      <div className="brand">
        <div className="logo">av</div>
        <div>
          <div className="brand-top">avus gastro</div>
          <div className="brand-bottom">smart-cap Dashboard</div>
        </div>
      </div>
      {authed ? (
        <nav className="menu">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => onNav(t.key)}
              className={cn("menu-btn", active === t.key && "active")}
            >
              {t.label}
            </button>
          ))}
          <button onClick={onLogout} className="menu-btn">Logout</button>
        </nav>
      ) : (
        <div className="tag">pay easy — Bezahlen im Flow</div>
      )}
    </header>
  );
}

function Login({ user, setUser, pw, setPw, onSubmit, err }) {
  return (
    <section className="card narrow">
      <h2>Login</h2>
      <form onSubmit={onSubmit} className="grid gap">
        <Field label="Nutzer">
          <select value={user} onChange={(e) => setUser(e.target.value)}>
            <option>Maxi</option>
            <option>Thorsten</option>
          </select>
        </Field>
        <Field label="Passwort">
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="avus" />
        </Field>
        {err && <div className="error">{err}</div>}
        <PrimaryButton>Einloggen</PrimaryButton>
      </form>
    </section>
  );
}

/** ============ DASHBOARD ============ */
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

  const loadAll = React.useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [s, c] = await Promise.all([
        httpGet(API.stats()),
        httpGet(API.contacts(limit, showInactive))
      ]);
      setStats(s);
      const arr = Array.isArray(c.contacts) ? c.contacts : [];
      setContacts(arr);
    } catch (e) {
      setError(e.message || "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, [limit, showInactive]);

  React.useEffect(() => { loadAll(); }, [loadAll]);

  const start = async () => {
    setCampaignRunning(true);
    try { await httpPost(API.startCampaign(), {}); }
    catch (e) { setError(e.message); }
  };
  const stop = async () => {
    setCampaignRunning(false);
    try { await httpPost(API.stopCampaign(), {}); }
    catch (e) { setError(e.message); }
  };

  const toggleActive = (row) => {
    const key = (row.id || row.email || "").toString();
    const newActive = String(row.active).toUpperCase() === "TRUE" ? "FALSE" : "TRUE";
    setContacts((prev) => prev.map((r) => ((r.id || r.email) === key ? { ...r, active: newActive } : r)));
    setUpdates((prev) => ({ ...prev, [key]: { active: newActive } }));
  };

  const saveActive = async () => {
    const payload = Object.entries(updates).map(([k, v]) => ({
      id: k, email: k.includes("@") ? k : undefined, active: v.active
    }));
    if (!payload.length) return;
    try { await httpPost(API.toggleActive(), { updates: payload }); setUpdates({}); }
    catch (e) { setError(e.message || "Speichern fehlgeschlagen"); }
  };

  const markTodoDone = async (row) => {
    const key = (row.id || row.email || "").toString();
    setContacts((prev) => prev.map((r) => ((r.id || r.email) === key ? { ...r, todo: false } : r)));
    setTodoUpdates((prev) => ({ ...prev, [key]: { todo: false } }));
  };

  const saveTodos = async () => {
    const payload = Object.entries(todoUpdates).map(([k, v]) => ({
      id: k, email: k.includes("@") ? k : undefined, todo: v.todo
    }));
    if (!payload.length) return;
    try { await httpPost(API.setTodo(), { updates: payload }); setTodoUpdates({}); }
    catch (e) { setError(e.message || "Fehler beim Speichern der ToDos"); }
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
          <ul className="list">
            {finishedTodos.map((r) => (
              <li key={r.id || r.email} className="row between vcenter">
                <div className="grow">
                  <div className="strong">{[r.firstName, r.lastName].filter(Boolean).join(" ")}</div>
                  <div className="muted">{r.company} · {r.last_sent_at || r.lastMailAt}</div>
                </div>
                <TextButton onClick={() => markTodoDone(r)}>Erledigt</TextButton>
              </li>
            ))}
          </ul>
          <div className="row end">
            <PrimaryButton onClick={saveTodos} disabled={!Object.keys(todoUpdates).length}>
              Änderungen speichern
            </PrimaryButton>
          </div>
        </Section>

        <Section title="Kampagneneinstellungen">
          <div className="grid gap">
            <Field label="Sendouts pro Tag">
              <input
                type="number"
                min="0"
                value={perDay}
                onChange={(e) => setPerDay(Number(e.target.value || 0))}
              />
            </Field>
            <div className="row gap">
              <PrimaryButton onClick={start} disabled={campaignRunning}>Kampagne starten</PrimaryButton>
              <TextButton onClick={stop} disabled={!campaignRunning}>Stoppen</TextButton>
              <TextButton onClick={loadAll} disabled={loading}>Neu laden</TextButton>
            </div>
          </div>
        </Section>
      </div>

      <div className="grid cols-3 gap">
        <section className="card kpi"><div className="kpi-num">{stats.sent}</div><div className="muted">Gesendet</div></section>
        <section className="card kpi"><div className="kpi-num">{stats.replies}</div><div className="muted">Antworten</div></section>
        <section className="card kpi"><div className="kpi-num">{stats.hot}</div><div className="muted">HOT</div></section>
        <section className="card kpi"><div className="kpi-num">{stats.needReview}</div><div className="muted">Need Review</div></section>
        <section className="card kpi"><div className="kpi-num">{stats.meetings}</div><div className="muted">Meetings</div></section>
      </div>

      <Section
        title="Kontakte"
        right={
          <div className="row gap">
            <label className="row gap">
              <span>Anzahl</span>
              <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
                {[10,25,50,75,100,150,200].map((n) => (<option key={n} value={n}>{n}</option>))}
              </select>
            </label>
            <label className="row gap">
              <span>Deaktivierte zeigen</span>
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            </label>
            <TextButton onClick={loadAll} disabled={loading}>Laden</TextButton>
          </div>
        }
      >
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Firma</th><th>E-Mail</th><th>Status</th><th>Active</th></tr>
            </thead>
            <tbody>
              {contacts.map((r) => (
                <tr key={r.id || r.email}>
                  <td>{[r.firstName, r.lastName].filter(Boolean).join(" ")}</td>
                  <td>{r.company}</td>
                  <td>{r.email}</td>
                  <td>{r.status || ""}</td>
                  <td>
                    <PillToggle
                      on={String(r.active).toUpperCase() === "TRUE"}
                      onLabel="aktiv"
                      offLabel="deaktiviert"
                      onClick={() => toggleActive(r)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row end gap">
          <PrimaryButton onClick={saveActive} disabled={!Object.keys(updates).length}>
            Änderungen speichern
          </PrimaryButton>
        </div>
      </Section>
    </section>
  );
}
/* ==== END PART 2 ==== */


















/* ==== PART 3 ==== */
/** ============ TEMPLATES (local/global archive) ============ */
function Templates() {
  const [scope, setScope] = React.useState("local");
  const [localList, setLocalList] = React.useState([]);
  const [globalList, setGlobalList] = React.useState([]);
  const [activeName, setActiveName] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [cursorTarget, setCursorTarget] = React.useState(null);
  const [totalSteps, setTotalSteps] = React.useState(0);

  const load = React.useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const [loc, glob] = await Promise.all([
        httpGet(API.templates()),
        httpGet(API.global.templates())
      ]);
      const a = Array.isArray(loc) ? loc : [];
      const b = Array.isArray(glob) ? glob : [];
      setLocalList(a); setGlobalList(b);

      const first = (scope === "local" ? a : b);
      setActiveName(first[0]?.name || "");

      const steps = first[0]?.steps || [];
      const ts = typeof first[0]?.total_steps === "number" ? first[0].total_steps : steps.length || 1;
      setTotalSteps(Math.max(1, ts));
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

  // Wenn Template wechselt, totalSteps neu initialisieren (ohne Tippen zu überschreiben)
  React.useEffect(() => {
    if (!tpl) return;
    const len = Array.isArray(tpl.steps) ? tpl.steps.length : 0;
    const ts = typeof tpl.total_steps === "number" ? tpl.total_steps : (len || 1);
    setTotalSteps(Math.max(1, ts));
  }, [tpl]);

  const updateStep = (idx, patch) => {
    setListByScope(prev => prev.map(t =>
      t.name !== activeName ? t : ({ ...t, steps: (t.steps || []).map((s, i) => i === idx ? { ...s, ...patch } : s) })
    ));
  };

  const save = async () => {
    if (!tpl) return;
    const payload = {
      sequence_id: activeName,
      total_steps: totalSteps,
      steps: (tpl.steps || []).slice(0, totalSteps).map((s) => ({
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

  const createNew = () => {
    const nm = prompt("Neuen Templatenamen eingeben:");
    if (!nm) return;
    const base = { name: nm, total_steps: 1, steps: [{ step: "1", subject: "", body_html: "", delay_days: 0 }] };
    setListByScope(prev => [{ ...base }, ...prev]);
    setActiveName(nm);
    setTotalSteps(1);
  };

  const fields = [
    { key: "{{firstName}}", label: "Vorname" },
    { key: "{{lastName}}", label: "Nachname" },
    { key: "{{company}}", label: "Firma" },
    { key: "{{position}}", label: "Position" },
    { key: "{{sp_first_name}} {{sp_last_name}}", label: "Absender-Name" },
  ];

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

  // Sichtbare Steps auf totalSteps begrenzen
  const visibleSteps = React.useMemo(() => {
    const arr = (tpl && Array.isArray(tpl.steps)) ? tpl.steps : [];
    const n = Math.max(0, Number(totalSteps || 0));
    return arr.slice(0, n || arr.length);
  }, [tpl, totalSteps]);

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
      </div>

      {tpl ? (
        <>
          <div className="card">
            <div className="row gap">
              <Field label="Total Steps">
                <input
                  type="number"
                  min="1"
                  value={totalSteps}
                  onChange={(e) => {
                    const desired = Math.max(1, Number(e.target.value || 1));
                    const currentLen = (tpl?.steps || []).length;

                    // Falls gewünschte Steps > vorhandene → Steps-Array auffüllen
                    if (desired > currentLen) {
                      const toAdd = desired - currentLen;
                      const baseIndex = currentLen;
                      setListByScope(prev => prev.map(t => {
                        if (t.name !== activeName) return t;
                        const nextSteps = [...(t.steps || [])];
                        for (let i = 0; i < toAdd; i++) {
                          const stepNumber = String(baseIndex + i + 1);
                          nextSteps.push({ step: stepNumber, subject: "", body_html: "", delay_days: 0 });
                        }
                        return { ...t, steps: nextSteps };
                      }));
                    }

                    setTotalSteps(desired);
                  }}
                />
              </Field>
              <div className="muted" style={{ alignSelf: 'end' }}>
                von {(tpl.steps || []).length}
              </div>
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
                    {fields.map((f) => (
                      <TextButton key={f.key} onClick={() => insertAtCursor(f.key)}>
                        {f.label}
                      </TextButton>
                    ))}
                  </div>

                  <Field label="Verzögerung (Tage)">
                    <input
                      type="number"
                      value={s.delay_days || 0}
                      onChange={(e) => updateStep(i, { delay_days: Number(e.target.value || 0) })}
                    />
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
/* ==== END PART 3 ==== */
























/* ==== PART 4 ==== */
/** ============ SIGNATURES (local/global archive) ============ */
function Signaturen() {
  const [scope, setScope] = React.useState("local"); // local | global
  const [local, setLocal] = React.useState({ list: [], standard: "" });
  const [global, setGlobal] = React.useState({ list: [] });
  const [active, setActive] = React.useState({ scope: "local", name: "standard" });
  const [currentName, setCurrentName] = React.useState("standard");
  const [html, setHtml] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const loadingRef = React.useRef(false);
  const tokenRef = React.useRef(0);

  const load = React.useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const myToken = ++tokenRef.current;
    setLoading(true);
    setErr("");
    try {
      const locList = await httpGet(API.signatures());
      const std = await httpGet(API.signaturesStandard()).catch(() => ({ html: "" }));
      const globList = await httpGet(API.global.signatures());

      if (myToken !== tokenRef.current) return;

      const locArr = Array.isArray(locList?.list)
        ? locList.list
        : Array.isArray(locList)
        ? locList
        : [];
      const stdHtml = std?.html || std?.Signatur || "";
      const globArr = Array.isArray(globList?.list)
        ? globList.list
        : Array.isArray(globList)
        ? globList
        : [];

      setLocal({ list: locArr, standard: stdHtml });
      setGlobal({ list: globArr });

      if (locList?.active) setActive(locList.active);

      setCreating(false);
      if (scope === "local") {
        setCurrentName("standard");
        setHtml(stdHtml);
      } else {
        const first = globArr[0]?.name || "";
        setCurrentName(first);
        setHtml(globArr.find((x) => x.name === first)?.html || "");
      }
    } catch (e) {
      setErr(e.message || "Fehler");
    } finally {
      if (myToken === tokenRef.current) {
        setLoading(false);
        loadingRef.current = false;
      }
    }
  }, [scope]);

  React.useEffect(() => {
    load();
  }, [load]);

  const list =
    scope === "local"
      ? [{ name: "standard", html: local.standard, readonly: true }, ...(local.list || [])]
      : global.list || [];

  const onPick = (name) => {
    setCreating(false);
    setCurrentName(name);
    const found = list.find((x) => x.name === name);
    setHtml(found?.html || "");
  };

  const onSave = async () => {
    if (scope === "local" && currentName === "standard")
      return alert("Standard-Signatur ist unveränderlich.");
    if (!currentName) return alert("Bitte Name vergeben.");
    try {
      const body = { name: currentName, html };
      if (scope === "local") await httpPost(API.saveSignature(), body);
      else await httpPost(API.global.saveSignature(), body);
      alert("Signatur gespeichert");
      setCreating(false);
      await load();
    } catch (e) {
      alert(e.message || "Fehler beim Speichern");
    }
  };

  const onCreate = () => {
    setCreating(true);
    setHtml("");
    setCurrentName("");
  };

  const onSetActive = async () => {
    try {
      await httpPost(
        scope === "local"
          ? API.setActiveSignature()
          : API.global.setActiveSignature(),
        { scope, name: currentName }
      );
      setActive({ scope, name: currentName });
      alert("Aktive Signatur gesetzt");
    } catch (e) {
      alert(e.message || "Fehler");
    }
  };

  return (
    <section className="grid gap">
      {err && <div className="error">{err}</div>}

      <div className="row gap wrap">
        <Field label="Archiv">
          <select
            value={scope}
            onChange={(e) => {
              const sc = e.target.value;
              setScope(sc);
              setCreating(false);
              setCurrentName(
                sc === "local" ? "standard" : global.list?.[0]?.name || ""
              );
            }}
          >
            <option value="local">Lokal</option>
            <option value="global">Global</option>
          </select>
        </Field>

        <Field label="Signatur">
          <select
            value={currentName}
            onChange={(e) => onPick(e.target.value)}
            disabled={creating}
          >
            {list.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
                {s.readonly ? " (Standard)" : ""}
              </option>
            ))}
          </select>
        </Field>

        <TextButton onClick={load} disabled={loading}>
          Neu laden
        </TextButton>
        <PrimaryButton onClick={onCreate}>Neue Signatur</PrimaryButton>
      </div>

      <div className="card">
        {creating && (
          <Field label="Name">
            <input
              placeholder="Name der Signatur"
              value={currentName}
              onChange={(e) => setCurrentName(e.target.value)}
            />
          </Field>
        )}

        <Field label="HTML">
          <textarea
            rows="8"
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            disabled={scope === "local" && currentName === "standard"}
          />
        </Field>

        <div className="row gap">
          <PrimaryButton
            onClick={onSave}
            disabled={scope === "local" && currentName === "standard"}
          >
            Speichern
          </PrimaryButton>
          <TextButton onClick={onSetActive}>Als aktiv setzen</TextButton>
          <div className="muted">
            Aktiv: {active.scope}/{active.name}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ==== END PART 4 ==== */


















/* ==== PART 5 ==== */
/** ============ BLACKLIST (GLOBAL) ============ */
function Blacklist() {
  const [q, setQ] = React.useState("");
  const [withBounces, setWithBounces] = React.useState(true);
  const [rows, setRows] = React.useState({ blacklist: [], bounces: [] });
  const [newEmail, setNewEmail] = React.useState("");
  const [err, setErr] = React.useState("");

  const load = React.useCallback(async () => {
    setErr("");
    try {
      const r = await httpGet(API.global.blacklist(q, withBounces));
      setRows({ blacklist: r.blacklist || [], bounces: r.bounces || [] });
    } catch (e) { setErr(e.message || "Fehler"); }
  }, [q, withBounces]);

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
        <label className="row gap">
          <input type="checkbox" checked={withBounces} onChange={(e) => setWithBounces(e.target.checked)} />
          Bounces einbeziehen
        </label>
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
  const [filterCol, setFilterCol] = React.useState("");     // Spalte auswählen
  const [onlyEmpty, setOnlyEmpty] = React.useState(true);   // nur leere anzeigen
  const errorCols = ['email','Anrede','firstName','lastName','company','phone','mobile','reason'];

  const load = React.useCallback(async () => {
    setErr("");
    try {
      const r = await httpGet(API.global.errorsList());
      const list = Array.isArray(r?.rows) ? r.rows : (Array.isArray(r) ? r : []);
      setRows(list.map((x, i) => ({ ...x, id: x.id || x._id || `row-${i}` })));
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

  const removeSelected = async () => {
    const ids = rows.filter(r => sel[r.id]).map(r => r.id);
    if (!ids.length) return;
    try {
      await httpPost(API.global.errorsDelete(), { ids });
      setSel({});
      await load();
    } catch (e) { alert(e.message || "Fehler beim Löschen"); }
  };

  const isBad = (row, key) => {
    if (["email","Anrede","firstName","lastName","company"].includes(key)) return !row[key];
    if (key === "phoneOrMobile") return !(row.phone || row.mobile);
    return false;
  };

  // Gefilterte Sicht
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

  // master checkbox (indeterminate per Ref, kein JSX-Prop)
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
        <PrimaryButton onClick={removeSelected}>Erledigt (löschen)</PrimaryButton>
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
              {/* reason bleibt in den Daten, ist absichtlich nicht sichtbar */}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={r.id || i}>
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

      {/* UI-Polish später; leichte Markierung für fehlende Pflichtfelder */}
      <style>{`.bad{background:#281316;border:1px solid #5e2930}`}</style>
    </section>
  );
}
/* ==== END PART 5 ==== */




























/* ==== PART 6 ==== */
/** ============ KONTAKTE (upload + validation -> error_list COPY) ============ */
function Kontakte() {
  const [file, setFile] = React.useState(null);
  const [rows, setRows] = React.useState([]);
  const [mode, setMode] = React.useState("append");
  const [info, setInfo] = React.useState("");

  const onFile = async (e) => {
    const f = e.target.files && e.target.files[0];
    setFile(f || null);
    if (!f) { setRows([]); setInfo(""); return; }

    if (/\.(csv)$/i.test(f.name)) {
      const parsed = await parseCSV(f);
      setRows(parsed);
      setInfo(`Gefunden: ${parsed.length} Zeilen (CSV)`);
    } else if (/\.(pdf)$/i.test(f.name)) {
      try {
        const parsed = await parsePDF(f);
        setRows(parsed);
        setInfo(`Gefunden: ${parsed.length} Zeilen (PDF)`);
      } catch (err) {
        console.error(err);
        setRows([]);
        setInfo("PDF konnte nicht gelesen werden.");
      }
    } else {
      setRows([]);
      setInfo("Bitte CSV oder PDF verwenden");
    }
  };

  // Pflichtfelder + Telefonregel
  const requiredOk = (r) => !!(r.email && r.Anrede && r.firstName && r.lastName && r.company);
  const phoneOk    = (r) => !!(r.phone || r.mobile);

  const upload = async () => {
    if (!rows.length) return alert("Keine gültigen Zeilen");

    // Globale Blacklist/Bounces (optional)
    let g = { blacklist: [], bounces: [] };
    try { g = await httpGet(API.global.blacklist("", true)); } catch (e) {}

    const errors = [];
    const valid  = [];

    for (const r of rows) {
      let reason = "";
      if (!requiredOk(r))              reason = "MISSING_REQUIRED";
      else if (!phoneOk(r))           reason = "MISSING_PHONE_OR_MOBILE";
      else if ((g.blacklist||[]).includes(r.email)) reason = "BLACKLIST";
      else if ((g.bounces||[]).includes(r.email))   reason = "BOUNCE";

      if (reason) {
        // ★ COPY to error_list (nicht entfernen)
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
        // Wichtig: NICHT aus rows entfernen — UI behält alle Zeilen
      } else {
        valid.push(r);
      }
    }

    try {
      if (errors.length) {
        await httpPost(API.global.errorsAdd(), { rows: errors });
      }
      if (valid.length) {
        await httpPost(API.upload(), { rows: valid, mode });
        alert(`Upload gesendet. OK: ${valid.length}${errors.length ? ` | Fehler kopiert: ${errors.length}` : ""}`);
      } else {
        alert(`Keine gültigen Zeilen. ${errors.length} Fehler wurden in die Fehlerliste kopiert.`);
      }
      // ★ rows UNVERÄNDERT lassen, damit die Upload-Ansicht gleich bleibt (Anforderung)
    } catch (e) {
      alert(e.message || "Fehler beim Upload");
    }
  };

  const prepare = async () => {
    try {
      await httpPost(API.prepareCampaign(), {});
      alert("Vorbereitung ausgelöst");
    } catch (e) {
      alert(e.message || "Fehler bei Vorbereitung");
    }
  };

  return (
    <section className="grid gap">
      <Section title="Kontaktliste importieren">
        <div className="row gap wrap">
          <input type="file" accept=".csv,.pdf" onChange={onFile} />
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="append">Anhängen</option>
            <option value="overwrite" disabled>Überschreiben (Server)</option>
          </select>
          <TextButton onClick={upload} disabled={!rows.length}>Upload ins Sheet</TextButton>
          <TextButton onClick={prepare}>Vorbereiten der neuen Kampagne</TextButton>
        </div>

        {info && <div className="muted">{info}</div>}

        {rows.length > 0 && (
          <div className="table-wrap">
            <table className="table small">
              <thead>
                <tr>
                  <th>email</th>
                  <th>Anrede</th>
                  <th>firstName</th>
                  <th>lastName</th>
                  <th>company</th>
                  <th>position</th>
                  <th>phone</th>
                  <th>mobile</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 15).map((r, i) => (
                  <tr key={i}>
                    <td>{r.email}</td>
                    <td>{r.Anrede || ""}</td>
                    <td>{r.firstName}</td>
                    <td>{r.lastName}</td>
                    <td>{r.company}</td>
                    <td>{r.position || ""}</td>
                    <td>{r.phone || ""}</td>
                    <td>{r.mobile || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="muted">Vorschau: {rows.length} Zeilen (erste 15)</div>
          </div>
        )}
      </Section>
    </section>
  );
}

/* ==== MOUNT (Singleton-Root, verhindert doppeltes createRoot) ==== */
(function () {
  var rootEl = document.getElementById('root');
  if (!rootEl) {
    console.error('No #root element found. Add <div id="root"></div> to your HTML.');
    return;
  }
  if (window.__APP_MOUNTED__) return;
  window.__APP_MOUNTED__ = true;

  try {
    if (!window.__APP_ROOT__) {
      window.__APP_ROOT__ = ReactDOM.createRoot(rootEl);
    }
    window.__APP_ROOT__.render(React.createElement(App));
    console.log('[app] mounted');
  } catch (e) {
    console.error('Mount error:', e);
  }
})();
/* ==== END PART 6 ==== */
                                                        
