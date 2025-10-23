
// ===== avus smart-cap Dashboard (updated: templates signature UX) =====
const {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  Fragment,
} = React;

const API_BASE =
  "https://script.google.com/macros/s/AKfycbz1KyuZJlXy9xpjLipMG1ppat2bQDjH361Rv_P8TIGg5Xcjha1HPGvVGRV1xujD049DOw/exec";

const API = {
  contacts: (limit, includeInactive = true) =>
    `${API_BASE}?path=api/contacts&limit=${encodeURIComponent(
      limit || 50
    )}&includeInactive=${includeInactive ? 1 : 0}`,
  stats: () => `${API_BASE}?path=api/stats`,
  inbox: () => `${API_BASE}?path=api/review-inbox`,
  todos: (limit) =>
    `${API_BASE}?path=api/sent-todos&limit=${encodeURIComponent(limit || 25)}`,
  templates: () => `${API_BASE}?path=api/templates`,
  blacklist: (q, includeBounces) =>
    `${API_BASE}?path=api/blacklist&q=${encodeURIComponent(
      q || ""
    )}&bounces=${includeBounces ? 1 : 0}`,
  toggleActive: () => `${API_BASE}?path=api/contacts/active`,
  saveTemplate: (sequenceId) =>
    `${API_BASE}?path=${encodeURIComponent("api/templates/" + sequenceId)}`,
  addBlacklist: () => `${API_BASE}?path=api/blacklist`,
  upload: () => `${API_BASE}?path=api/upload`,
  prepareCampaign: () => `${API_BASE}?path=api/campaign/prepare`,
  startCampaign: () => `${API_BASE}?path=api/campaign/start`,
  stopCampaign: () => `${API_BASE}?path=api/campaign/stop`,

  // settings for signature
  settings: () => `${API_BASE}?path=api/settings`,
  saveSettings: () => `${API_BASE}?path=api/settings/save`,

  // remove a contact (best-effort; falls back to deactivating)
  removeContact: () => `${API_BASE}?path=api/contacts/remove`,
};

async function httpGet(url) {
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { text }; }
}
async function httpPost(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error(`POST ${url} -> ${res.status}`);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { text }; }
}

function cn(...xs) { return xs.filter(Boolean).join(" "); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function isEmail(x) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x || ""); }
function normalizePhone(x) { return String(x || "").replace(/[^\d+]/g, ""); }
function asBoolTF(v){ return String(v).toUpperCase() === "TRUE"; }
function toTF(v){ return v ? "TRUE" : "FALSE"; }
function fmtDate(d){ if(!d) return ""; const dt=new Date(d); return isNaN(dt)?String(d):dt.toLocaleString(); }

function detectDelimiter(headerLine) {
  const c = (s, ch) => (s.match(new RegExp(`\\${ch}`, "g")) || []).length;
  const candidates = [
    { d: ";", n: c(headerLine, ";") },
    { d: ",", n: c(headerLine, ",") },
    { d: "\t", n: c(headerLine, "\t") },
  ];
  candidates.sort((a, b) => b.n - a.n);
  return candidates[0].n > 0 ? candidates[0].d : ",";
}
function normalizeKey(k) {
  const s = String(k || "").toLowerCase().replace(/\s+/g, "").replace(/[-_]/g, "");
  if (/^(email|e?mail|e\-?mail|mailadresse)$/.test(s)) return "email";
  if (/^(lastname|nachname|name$)$/.test(s)) return "lastName";
  if (/^(firstname|vorname)$/.test(s)) return "firstName";
  if (/^(company|firma|unternehmen|organisation)$/.test(s)) return "company";
  if (/^(position|titel|rolle)$/.test(s)) return "position";
  if (/^(phone|telefon|telefonnummer|tel)$/.test(s)) return "phone";
  if (/^(mobile|handy|mobil)$/.test(s)) return "mobile";
  if (/^(anrede|salutation|gruess|grussformel)$/.test(s)) return "salutation";
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
        salutation: rec.salutation || "",
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
    const items = tc.items.map((it) => {
      const [a, b, c, d, e, f] = it.transform;
      return { x: e, y: f, str: it.str };
    });
    items.sort((p, q) => q.y - p.y || p.x - q.x);
    const lines = []; const EPS = 2.5;
    for (const t of items) { const L = lines.find((l) => Math.abs(l.y - t.y) < EPS);
      if (L) L.items.push(t); else lines.push({ y: t.y, items: [t] }); }
    return lines.map((L) => { L.items.sort((p, q) => p.x - q.x);
      return { y: L.y, items: L.items, text: L.items.map((i) => i.str).join(" ") }; });
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
        if (!map.email && (s.includes("e-mail") || s.includes("email") || s.includes("anspr.")))
          map.email = it.x;
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
    return { company: join(buckets.firma), salutation: join(buckets.anrede), first: join(buckets.vor), last: join(buckets.nach), phone: join(buckets.tel), email: join(buckets.mail) };
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
        collected.push({ email: hasEmail ? rec.email : "", firstName: rec.first, lastName: rec.last, company: rec.company, position: "", phone: rec.phone || "", mobile: "", salutation: rec.salutation || "" });
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

function Badge({ children, tone = "muted" }) { return <span className={cn("badge", `badge-${tone}`)}>{children}</span>; }
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

function App() {
  const [page, setPage] = React.useState("login");
  const [authed, setAuthed] = React.useState(false);
  const [user, setUser] = React.useState("Maxi");
  const [pw, setPw] = React.useState("");
  const [err, setErr] = React.useState("");
  const doLogin = React.useCallback((e) => {
    e && e.preventDefault();
    const ok = (user === "Maxi" || user === "Thorsten") && pw === "avus";
    if (ok) { setAuthed(true); setPage("dashboard"); setErr(""); } else setErr("Login fehlgeschlagen");
  }, [user, pw]);
  const doLogout = React.useCallback(() => { setAuthed(false); setPage("login"); setPw(""); }, []);
  return (<div className="app">
    <Header authed={authed} onNav={setPage} onLogout={doLogout} active={page} />
    <main className="container">
      {!authed && page === "login" && (<Login user={user} setUser={setUser} pw={pw} setPw={setPw} onSubmit={doLogin} err={err} />)}
      {authed && page === "dashboard" && <Dashboard />}
      {authed && page === "templates" && <Templates />}
      {authed && page === "blacklist" && <Blacklist />}
      {authed && page === "kontakte" && <Kontakte />}
    </main>
  </div>);
}
function Header({ authed, onNav, onLogout, active }) {
  const tabs = [{ key: "dashboard", label: "Dashboard" },{ key: "templates", label: "Templates" },{ key: "blacklist", label: "Blacklist" },{ key: "kontakte", label: "Kontakte" }];
  return (<header className="topbar">
    <div className="brand"><div className="logo">av</div><div><div className="brand-top">avus gastro</div><div className="brand-bottom">smart-cap Dashboard</div></div></div>
    {authed ? (<nav className="menu">{tabs.map((t) => (<button key={t.key} onClick={() => onNav(t.key)} className={cn("menu-btn", active === t.key && "active")}>{t.label}</button>))}<button onClick={onLogout} className="menu-btn">Logout</button></nav>) : (<div className="tag">pay easy — Bezahlen im Flow</div>)}
  </header>);
}
function Login({ user, setUser, pw, setPw, onSubmit, err }) {
  return (<section className="card narrow"><h2>Login</h2><form onSubmit={onSubmit} className="grid gap">
    <Field label="Nutzer"><select value={user} onChange={(e) => setUser(e.target.value)}><option>Maxi</option><option>Thorsten</option></select></Field>
    <Field label="Passwort"><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="avus" /></Field>
    {err && <div className="error">{err}</div>}
    <PrimaryButton>Einloggen</PrimaryButton>
  </form></section>);
}

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
  const [tplList, setTplList] = React.useState([]);
  const [selectedTpl, setSelectedTpl] = React.useState("");

  const loadAll = React.useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [s, c, tpls] = await Promise.all([
        httpGet(API.stats()),
        httpGet(API.contacts(limit, showInactive)),
        httpGet(API.templates()),
      ]);
      setStats(s);
      const arr = Array.isArray(c.contacts) ? c.contacts : [];
      const filtered = arr.filter(r => String(r.opt_out).toUpperCase() !== "TRUE"); // hide opt-outs
      setContacts(filtered);
      const l = Array.isArray(tpls) ? tpls : [];
      setTplList(l);
      if (!selectedTpl && l.length) setSelectedTpl(l[0].name || "");
    } catch (e) { setError(e.message || "Fehler beim Laden"); }
    finally { setLoading(false); }
  }, [limit, showInactive, selectedTpl]);
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
  const saveCampaignSettings = async () => {
    try {
      await httpPost(API.prepareCampaign(), { sequence_id: selectedTpl, per_day: perDay });
      alert("Kampagne vorbereitet.");
    } catch (e) { alert(e.message || "Fehler"); }
  };

  const toggleActive = (row) => {
    const key = (row.id || row.email || "").toString();
    const newActive = String(row.active).toUpperCase() === "TRUE" ? "FALSE" : "TRUE";
    setContacts((prev) => prev.map((r) => ((r.id || r.email) === key ? { ...r, active: newActive } : r)));
    setUpdates((prev) => ({ ...prev, [key]: { active: newActive } }));
  };
  const saveActive = async () => {
    const payload = Object.entries(updates).map(([k, v]) => ({ id: k, email: k.includes("@") ? k : undefined, active: v.active }));
    if (!payload.length) return;
    try { await httpPost(API.toggleActive(), { updates: payload }); setUpdates({}); } catch (e) { setError(e.message || "Speichern fehlgeschlagen"); }
  };

  const finishedTodos = React.useMemo(() => contacts.filter((r) => String(r.status) === "finished" && (r.last_sent_at || r.lastMailAt)), [contacts]);
  const removeContact = async (r) => {
    const key = (r.id || r.email || "").toString();
    try { await httpPost(API.removeContact(), { id: r.id, email: r.email }); }
    catch (e) { await httpPost(API.toggleActive(), { updates: [{ id: key, email: r.email, active: "FALSE" }] }); }
    setContacts(prev => prev.filter(x => (x.id || x.email) !== key));
  };

  return (<section className="grid gap">
    {error && <div className="error">{error}</div>}
    <div className="grid cols-2 gap">
      <Section title="To-Dos (angeschrieben)">
        <ul className="list">
          {finishedTodos.map((r) => (<li key={r.id || r.email} className="row">
            <div className="grow"><div className="strong">{[r.firstName, r.lastName].filter(Boolean).join(" ")}</div>
              <div className="muted">{r.company} · {r.last_sent_at || r.lastMailAt}</div></div>
            {(r.phone || r.mobile) && (<a className="btn link" href={`tel:${String(r.phone || r.mobile).replace(/\s+/g, "")}`}>Anrufen</a>)}
            <button className="btn danger" onClick={() => removeContact(r)} title="Kontakt entfernen">Entfernen</button>
          </li>))}
        </ul>
      </Section>

      <Section title="Kampagneneinstellungen">
        <div className="grid gap">
          <Field label="Sendouts pro Tag"><input type="number" min="0" value={perDay} onChange={(e) => setPerDay(Number(e.target.value || 0))} /></Field>
          <Field label="Template-Auswahl">
            <select value={selectedTpl} onChange={(e) => setSelectedTpl(e.target.value)}>
              {tplList.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
            </select>
          </Field>
          <div className="row gap">
            <PrimaryButton onClick={saveCampaignSettings}>Einstellungen speichern</PrimaryButton>
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
      <section className="card kpi"><div className="muted">Need Review</div><div className="kpi-num">{stats.needReview}</div></section>
      <section className="card kpi"><div className="muted">Meetings</div><div className="kpi-num">{stats.meetings}</div></section>
    </div>

    <Section title="Kontakte" right={<div className="row gap">
      <label className="row gap"><span>Anzahl</span>
        <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
          {[10,25,50,75,100,150,200].map((n) => (<option key={n} value={n}>{n}</option>))}
        </select>
      </label>
      <label className="row gap"><span>Deaktivierte zeigen</span>
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
      </label>
      <TextButton onClick={loadAll} disabled={loading}>Laden</TextButton>
    </div>}>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Name</th><th>Firma</th><th>E-Mail</th><th>Status</th><th>Active</th></tr></thead>
          <tbody>
            {contacts.map((r) => (<tr key={r.id || r.email}>
              <td>{[r.firstName, r.lastName].filter(Boolean).join(" ")}</td>
              <td>{r.company}</td>
              <td>{r.email}</td>
              <td>{r.status || ""}</td>
              <td><PillToggle on={String(r.active).toUpperCase() === "TRUE"} onLabel="aktiv" offLabel="deaktiviert" onClick={() => toggleActive(r)} /></td>
            </tr>))}
          </tbody>
        </table>
      </div>
      <div className="row end gap">
        <PrimaryButton onClick={saveActive} disabled={!Object.keys(updates).length}>Änderungen speichern</PrimaryButton>
      </div>
    </Section>
  </section>);
}

function Templates() {
  const [list, setList] = React.useState([]);
  const [active, setActive] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [cursorTarget, setCursorTarget] = React.useState(null);
  const [signature, setSignature] = React.useState("");
  const [showSig, setShowSig] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const [res, settings] = await Promise.all([ httpGet(API.templates()), httpGet(API.settings()).catch(() => ({})) ]);
      const arr = Array.isArray(res) ? res : [];
      setList(arr);
      setActive(arr && arr[0] && arr[0].name ? arr[0].name : "");
      setSignature(settings.Signatur || settings.signature_html || settings.signature || "");
    }
    catch (e) { setErr(e.message || "Fehler"); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const tpl = React.useMemo(() => list.find((t) => t.name === active) || null, [list, active]);
  const updateStep = (idx, patch) => {
    setList((prev) => prev.map((t) => t.name !== active ? t : ({ ...t, steps: t.steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)) })));
  };
  const save = async () => {
    if (!tpl) return;
    const payload = {
      sequence_id: active,
      total_steps: (tpl.steps || []).length,
      steps: (tpl.steps || []).map((s) => ({
        step: s.step || "", subject: s.subject || "", body_html: s.body_html || "", delay_days: Number(s.delay_days || 0),
      }))
    };
    try { await httpPost(API.saveTemplate(active), payload); alert("Template gespeichert"); }
    catch (e) { alert(e.message || "Fehler"); }
  };
  const saveSignatureOnly = async () => {
    try { await httpPost(API.saveSettings(), { signature_html: signature }); alert("Signatur gespeichert"); }
    catch (e) { alert(e.message || "Fehler beim Speichern der Signatur"); }
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
    requestAnimationFrame(() => { el.focus(); const pos = start + token.length; el.setSelectionRange(pos, pos); });
  };

  const setUpdateSubjectRef = (el, updater) => { if (el) { el._updateSubject = updater; } };
  const setUpdateBodyRef = (el, updater) => { if (el) { el._updateBody = updater; } };

  return (<section className="grid gap">
    {err && <div className="error">{err}</div>}
    <div className="row gap">
      <select value={active} onChange={(e) => setActive(e.target.value)}>
        {list.map((t) => (<option key={t.name} value={t.name}>{t.name}</option>))}
      </select>
      <TextButton onClick={load} disabled={loading}>Neu laden</TextButton>
      <TextButton onClick={() => setShowSig(s => !s)}>{showSig ? "Signatur ausblenden" : "Signatur"}</TextButton>
    </div>

    {showSig && (
      <div className="card">
        <Field label="Signatur (HTML)">
          <textarea
            rows="5"
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
          />
        </Field>
        <div className="row end">
          <PrimaryButton onClick={saveSignatureOnly}>Signatur speichern</PrimaryButton>
        </div>
      </div>
    )}

    {tpl ? (<div className="grid gap">
      {(tpl.steps || []).map((s, i) => (<div key={i} className="card">
        <div className="strong">{s.step}</div>
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
          {fields.map((f) => (<TextButton key={f.key} onClick={() => insertAtCursor(f.key)}>{f.label}</TextButton>))}
        </div>
        <Field label="Verzögerung (Tage)"><input type="number" value={s.delay_days || 0} onChange={(e) => updateStep(i, { delay_days: Number(e.target.value || 0) })} /></Field>
      </div>))}
      <div className="row end">
        <PrimaryButton onClick={save}>Template(s) speichern</PrimaryButton>
      </div>
    </div>) : (<div className="muted">Keine Templates geladen.</div>)}
  </section>);
}

function Blacklist() {
  const [q, setQ] = React.useState(""); const [withBounces, setWithBounces] = React.useState(true);
  const [rows, setRows] = React.useState({ blacklist: [], bounces: [] }); const [newEmail, setNewEmail] = React.useState(""); const [err, setErr] = React.useState("");
  const load = React.useCallback(async () => { setErr(""); try { const r = await httpGet(API.blacklist(q, withBounces)); setRows({ blacklist: r.blacklist || [], bounces: r.bounces || [] }); } catch (e) { setErr(e.message || "Fehler"); } }, [q, withBounces]);
  React.useEffect(() => { load(); }, [load]);
  const add = async () => { const email = (newEmail || "").trim(); if (!email || !isEmail(email)) return alert("Bitte gültige E-Mail");
    try { await httpPost(API.addBlacklist(), { email }); setNewEmail(""); await load(); } catch (e) { alert(e.message || "Fehler"); } };
  return (<section className="grid gap">
    {err && <div className="error">{err}</div>}
    <Toolbar>
      <input placeholder="Suche" value={q} onChange={(e) => setQ(e.target.value)} />
      <label className="row gap"><input type="checkbox" checked={withBounces} onChange={(e) => setWithBounces(e.target.checked)} /> Bounces einbeziehen</label>
      <TextButton onClick={load}>Suchen</TextButton>
    </Toolbar>
    <div className="grid cols-2 gap">
      <Section title="Blacklist">
        <ul className="list bulleted">{(rows.blacklist||[]).map((x, i) => (<li key={"bl-" + i}><span className="mono">{x}</span></li>))}</ul>
      </Section>
      <Section title="Bounces">
        <ul className="list bulleted">{(rows.bounces||[]).map((x, i) => (<li key={"bo-" + i}><span className="mono">{x}</span></li>))}</ul>
      </Section>
    </div>
    <Section title="Hinzufügen">
      <div className="row gap"><input placeholder="name@firma.de" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} /><PrimaryButton onClick={add}>Hinzufügen</PrimaryButton></div>
    </Section>
  </section>);
}

function Kontakte() {
  const [file, setFile] = React.useState(null);
  const [rows, setRows] = React.useState([]);
  const [mode, setMode] = React.useState("append");
  const [info, setInfo] = React.useState("");
  const onFile = async (e) => {
    const f = e.target.files && e.target.files[0];
    setFile(f || null); if (!f) return;
    if (/\.(csv)$/i.test(f.name)) {
      const parsed = await parseCSV(f); setRows(parsed); setInfo(`Gefunden: ${parsed.length} Zeilen (CSV)`);
    } else if (/\.(pdf)$/i.test(f.name)) {
      try { const parsed = await parsePDF(f); setRows(parsed); setInfo(`Gefunden: ${parsed.length} Zeilen (PDF)`); }
      catch (err) { console.error(err); setRows([]); setInfo("PDF konnte nicht gelesen werden."); }
    } else { setRows([]); setInfo("Bitte CSV oder PDF verwenden"); }
  };
  const upload = async () => { if (!rows.length) return alert("Keine gültigen Zeilen");
    try { await httpPost(API.upload(), { rows, mode }); alert("Upload gesendet"); } catch (e) { alert(e.message || "Fehler beim Upload"); } };
  const prepare = async () => { try { await httpPost(API.prepareCampaign(), {}); alert("Vorbereitung ausgelöst"); } catch (e) { alert(e.message || "Fehler bei Vorbereitung"); } };
  return (<section className="grid gap">
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
      {rows.length > 0 && (<div className="table-wrap">
        <table className="table small">
          <thead><tr>
            <th>email</th><th>lastName</th><th>company</th><th>firstName</th><th>salutation</th><th>position</th><th>phone</th><th>mobile</th>
          </tr></thead>
          <tbody>{rows.slice(0, 15).map((r, i) => (<tr key={i}>
            <td>{r.email}</td><td>{r.lastName}</td><td>{r.company}</td><td>{r.firstName}</td><td>{r.salutation || ""}</td><td>{r.position}</td><td>{r.phone}</td><td>{r.mobile || ""}</td>
          </tr>))}</tbody>
        </table><div className="muted">Vorschau: {rows.length} Zeilen (erste 15)</div></div>)}
    </Section>
  </section>);
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
