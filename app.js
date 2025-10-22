// Email-Akquise Dashboard (GH Pages build — React + Babel, no bundler)
const { useState, useEffect, useCallback, useMemo } = React;

// ===================== API CONFIG =====================
const API_BASE = 'https://script.google.com/macros/s/AKfycbz1KyuZJlXy9xpjLipMG1ppat2bQDjH361Rv_P8TIGg5Xcjha1HPGvVGRV1xujD049DOw/exec';
const API = {
  // READ
  contacts: (limit) => `${API_BASE}?path=api/contacts&limit=${encodeURIComponent(limit || 50)}`,
  stats: () => `${API_BASE}?path=api/stats`,
  inbox: () => `${API_BASE}?path=api/review-inbox`,
  todos: (limit) => `${API_BASE}?path=api/sent-todos&limit=${encodeURIComponent(limit || 25)}`,
  templates: () => `${API_BASE}?path=api/templates`,
  blacklist: (q, includeBounces) => `${API_BASE}?path=api/blacklist&q=${encodeURIComponent(q||'')}&bounces=${includeBounces?1:0}`,
  // WRITE (allowed only)
  toggleActive: () => `${API_BASE}?path=api/contacts/active`,
  saveTemplate: (sequenceId) => `${API_BASE}?path=${encodeURIComponent('api/templates/' + sequenceId)}`,
  addBlacklist: () => `${API_BASE}?path=api/blacklist`,
  upload: () => `${API_BASE}?path=api/upload`,
  prepareCampaign: () => `${API_BASE}?path=api/campaign/prepare`,
  startCampaign: () => `${API_BASE}?path=api/campaign/start`,
  stopCampaign: () => `${API_BASE}?path=api/campaign/stop`,
};

// Simple GET/POST helpers. POST uses text/plain to avoid CORS preflight on Apps Script.
async function httpGet(url) {
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}
async function httpPost(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // simple request, no preflight
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error(`POST ${url} -> ${res.status}`);
  return res.json();
}

// ===================== UTILS =====================
function cn(...xs){ return xs.filter(Boolean).join(' '); }
function isEmail(x){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x); }
function asBoolTF(v){ return String(v).toUpperCase() === 'TRUE'; }
function toTF(v){ return v ? 'TRUE' : 'FALSE'; }
// ---------- PDF -> Kontakte (Firma, Anrede, firstName, lastName, phone, email) ----------
async function parsePDF(file) {
  const arrayBuf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuf }).promise;

  // Hilfsfunktion: Texte einer Seite in Zeilen gruppieren (nach Y), innerhalb der Zeile nach X sortieren
  async function pageToLines(page) {
    const tc = await page.getTextContent();
    const items = tc.items.map(it => {
      const [a, b, c, d, e, f] = it.transform; // transform matrix
      return { x: e, y: f, str: it.str };
    });
    // nach y absteigend (pdf.js-Koords), dann x aufsteigend
    items.sort((p,q) => (q.y - p.y) || (p.x - q.x));

    // Zeilen bilden (Toleranz für gleiche y)
    const lines = [];
    const EPS = 2.5;
    for (const t of items) {
      const L = lines.find(l => Math.abs(l.y - t.y) < EPS);
      if (L) L.items.push(t);
      else lines.push({ y: t.y, items: [t] });
    }
    // innerhalb der Zeile nach x sortieren & zu einem String zusammenbauen + auch Spaltenpositionen behalten
    return lines.map(L => {
      L.items.sort((p,q) => p.x - q.x);
      return { y: L.y, items: L.items, text: L.items.map(i => i.str).join(' ') };
    });
  }

  // Spalten anhand der Kopfzeile erkennen (Firma | Anrede | Vorname | Nachname | Telefon | Anspr. E-Mail)
  function detectColumns(headerLine) {
    // Positionen der ersten Tokens in der Kopfzeile suchen
    function findX(label) {
      const token = headerLine.items.find(i => headerLine.text.toLowerCase().includes(label));
      // fallback: harte Werte, wenn nicht gefunden
      return token ? token.x : null;
    }
    // Wir scannen die Items und merken uns die x-Startwerte der Schlüsselwörter
    const map = {};
    for (const it of headerLine.items) {
      const s = it.str.toLowerCase();
      if (!map.firma && s.includes('firma')) map.firma = it.x;
      if (!map.anrede && s.includes('anrede')) map.anrede = it.x;
      if (!map.vorname && s.includes('vorname')) map.vorname = it.x;
      if (!map.nachname && s.includes('nachname')) map.nachname = it.x;
      if (!map.telefon && s.includes('telefon')) map.telefon = it.x;
      if (!map.email && (s.includes('e-mail') || s.includes('email') || s.includes('anspr.'))) map.email = it.x;
    }
    // Fallback-Spalten, falls der Kopf nicht sauber erkannt wird (ca.-Werte für dein PDF)
    return {
      firma:  map.firma  ??  30,
      anrede: map.anrede ?? 170,
      vor:    map.vorname?? 230,
      nach:   map.nachname?? 310,
      tel:    map.telefon?? 430,
      mail:   map.email  ?? 520
    };
  }

  function sliceByColumns(line, cols) {
    // Items anhand der x-Positionen in Spalten einsortieren
    const buckets = { firma:[], anrede:[], vor:[], nach:[], tel:[], mail:[] };
    for (const it of line.items) {
      const x = it.x;
      const key =
        x < cols.anrede ? 'firma' :
        x < cols.vor    ? 'anrede' :
        x < cols.nach   ? 'vor' :
        x < cols.tel    ? 'nach' :
        x < cols.mail   ? 'tel' : 'mail';
      buckets[key].push(it.str);
    }
    const join = arr => arr.join(' ').replace(/\s+/g,' ').trim();
    return {
      company:  join(buckets.firma),
      Anrede:   join(buckets.anrede),
      first:    join(buckets.vor),
      last:     join(buckets.nach),
      phone:    join(buckets.tel),
      email:    join(buckets.mail)
    };
  }

  const out = [];
  for (let p=1; p<=pdf.numPages; p++){
    const page = await pdf.getPage(p);
    const lines = await pageToLines(page);

    // Kopfzeile und Spaltenbreiten je Seite bestimmen (erste Zeile, die alle Schlüsselwörter enthält)
    const header = lines.find(L => /firma/i.test(L.text) && /anrede/i.test(L.text) && /vorname/i.test(L.text) && /nachname/i.test(L.text));
    const cols = header ? detectColumns(header) : detectColumns(lines[0] || {items:[]});

    // Relevante Zeilen: solche, die mindestens Firma und irgendwas rechts davon haben
    for (const L of lines) {
      if (header && Math.abs(L.y - header.y) < 3) continue; // Kopfzeile überspringen
      const rec = sliceByColumns(L, cols);

      // Validierung: mindestens E-Mail ODER (Firma + Nachname)
      const hasEmail = /\S+@\S+\.\S+/.test(rec.email);
      const minimal  = rec.company && rec.last;
      if (hasEmail || minimal) {
        out.push({
          email: hasEmail ? rec.email : '',
          firstName: rec.first,
          lastName: rec.last,
          company: rec.company,
          position: '',            // aus PDF nicht vorhanden
          phone: rec.phone || '',
          mobile: ''
        });
      }
    }
  }
  // Deduplizieren nach E-Mail (falls vorhanden) sonst (Firma+Nachname)
  const seen = new Set();
  const rows = [];
  for (const r of out) {
    const key = r.email ? `e:${r.email.toLowerCase()}` : `c:${r.company.toLowerCase()}|${r.last.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(r);
  }
  return rows;
}

// CSV parsing (supports ; , \t, quotes, german headers)
function detectDelimiter(headerLine) {
  const c = (s,ch)=> (s.match(new RegExp(`\\${ch}`,'g'))||[]).length;
  const candidates = [{d:';', n:c(headerLine,';')}, {d:',', n:c(headerLine,',')}, {d:'\t', n:c(headerLine,'\t')}];
  candidates.sort((a,b)=>b.n-a.n);
  return candidates[0].n>0 ? candidates[0].d : ',';
}
function normalizeKey(k){
  const s = String(k||'').toLowerCase().replace(/\s+/g,'').replace(/[-_]/g,'');
  if (/^(email|e?mail|e\-?mail|mailadresse)$/.test(s)) return 'email';
  if (/^(lastname|nachname|name$)$/.test(s)) return 'lastName';
  if (/^(firstname|vorname)$/.test(s)) return 'firstName';
  if (/^(company|firma|unternehmen|organisation)$/.test(s)) return 'company';
  if (/^(position|titel|rolle)$/.test(s)) return 'position';
  if (/^(phone|telefon|telefonnummer|tel)$/.test(s)) return 'phone';
  if (/^(mobile|handy|mobil)$/.test(s)) return 'mobile';
  return k; // fallback
}
function splitCSV(line, delim) {
  const out = [];
  let cur = '', inQ = false;
  for (let i=0;i<line.length;i++){
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i+1] === '"'){ cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === delim && !inQ) {
      out.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}
async function parseCSV(file) {
  const textRaw = await file.text();
  const text = textRaw.replace(/^\uFEFF/,''); // remove BOM
  const lines = text.split(/\r?\n/).filter(l => l.trim().length>0);
  if (!lines.length) return [];

  const delim = detectDelimiter(lines[0]);
  const headersRaw = splitCSV(lines[0], delim).map(h=>h.trim());
  const headers = headersRaw.map(normalizeKey);

  const data = [];
  for (let r=1;r<lines.length;r++){
    const cols = splitCSV(lines[r], delim).map(c=>c.trim());
    const rec = {};
    headers.forEach((h,i)=> rec[h] = (cols[i]!==undefined ? cols[i] : ''));
    const email = rec.email || '';
    const last  = rec.lastName || '';
    const comp  = rec.company || '';
    if (email && last && comp) {
      data.push({
        email: email,
        lastName: last,
        company: comp,
        firstName: rec.firstName || '',
        position: rec.position || '',
        phone: rec.phone || '',
        mobile: rec.mobile || ''
      });
    }
  }
  return data;
}

// ===================== APP =====================
function App(){
  const [page, setPage] = useState('login');
  const [authed, setAuthed] = useState(false);
  const [user, setUser] = useState('Maxi');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');

  const doLogin = useCallback((e) => {
    e && e.preventDefault();
    const ok = (user==='Maxi' || user==='Thorsten') && pw==='avus';
    if(ok){ setAuthed(true); setPage('dashboard'); setErr(''); }
    else setErr('Login fehlgeschlagen');
  }, [user, pw]);
  const doLogout = useCallback(()=>{ setAuthed(false); setPage('login'); setPw(''); }, []);

  return (
    <div className="app">
      <Header authed={authed} onNav={setPage} onLogout={doLogout} active={page} />
      <main className="container">
        {(!authed && page==='login') && <Login user={user} setUser={setUser} pw={pw} setPw={setPw} onSubmit={doLogin} err={err} />}
        {(authed && page==='dashboard') && <Dashboard />}
        {(authed && page==='templates') && <Templates />}
        {(authed && page==='blacklist') && <Blacklist />}
        {(authed && page==='kontakte') && <Kontakte />}
      </main>
    </div>
  );
}

function Header({ authed, onNav, onLogout, active }){
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
          {['dashboard','templates','blacklist','kontakte'].map(key => (
            <button key={key} onClick={()=>onNav(key)} className={cn('menu-btn', active===key && 'active')}>{key[0].toUpperCase()+key.slice(1)}</button>
          ))}
          <button onClick={onLogout} className="menu-btn">Logout</button>
        </nav>
      ) : (
        <div className="tag">pay easy — Bezahlen im Flow</div>
      )}
    </header>
  );
}

function Login({ user, setUser, pw, setPw, onSubmit, err }){
  return (
    <section className="card narrow">
      <h2>Login</h2>
      <form onSubmit={onSubmit} className="grid gap">
        <label className="field">
          <span>Nutzer</span>
          <select value={user} onChange={e=>setUser(e.target.value)}>
            <option>Maxi</option>
            <option>Thorsten</option>
          </select>
        </label>
        <label className="field">
          <span>Passwort</span>
          <input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="avus" />
        </label>
        {err && <div className="error">{err}</div>}
        <button className="btn primary" type="submit">Einloggen</button>
      </form>
    </section>
  );
}

// ===================== DASHBOARD =====================
function Dashboard(){
  const [stats, setStats] = useState({ sent:0, replies:0, hot:0, needReview:0, meetings:0 });
  const [contacts, setContacts] = useState([]);
  const [limit, setLimit] = useState(25);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [perDay, setPerDay] = useState(25);
  const [campaignRunning, setCampaignRunning] = useState(false);
  const [updates, setUpdates] = useState({});

  const loadAll = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [s, c] = await Promise.all([ httpGet(API.stats()), httpGet(API.contacts(limit)) ]);
      setStats(s);
      setContacts(Array.isArray(c.contacts)? c.contacts : []);
    } catch (e){
      setError(e.message || 'Fehler beim Laden');
    } finally { setLoading(false); }
  }, [limit]);

  useEffect(()=>{ loadAll(); }, [loadAll]);

  const start = async ()=>{ setCampaignRunning(true); try{ await httpPost(API.startCampaign(), {}); }catch(e){ setError(e.message);} };
  const stop  = async ()=>{ setCampaignRunning(false); try{ await httpPost(API.stopCampaign(), {}); }catch(e){ setError(e.message);} };

  const toggleActive = (row) => {
    const key = (row.id || row.email || '').toString();
    const newActive = String(row.active).toUpperCase() === 'TRUE' ? 'FALSE' : 'TRUE';
    setContacts(prev => prev.map(r => ( (r.id||r.email)===key ? {...r, active:newActive} : r )));
    setUpdates(prev => ({...prev, [key]: { active: newActive }}));
  };
  const saveActive = async ()=>{
    const payload = Object.entries(updates).map(([k,v])=> ({ id:k, email: k.includes('@')?k:undefined, active: v.active }));
    if (!payload.length) return;
    try{ await httpPost(API.toggleActive(), { updates: payload }); setUpdates({}); }
    catch(e){ setError(e.message || 'Speichern fehlgeschlagen'); }
  };

  return (
    <section className="grid gap">
      {error && <div className="error">{error}</div>}
      <div className="grid cols-2 gap">
        <section className="card">
          <h3>To-Dos (angeschrieben)</h3>
          <ul className="list">
            {contacts.filter(r => String(r.status)==='finished' && (r.last_sent_at||r.lastMailAt)).map(r => (
              <li key={r.id||r.email} className="row">
                <div className="grow">
                  <div className="strong">{[r.firstName,r.lastName].filter(Boolean).join(' ')}</div>
                  <div className="muted">{r.company} · {r.last_sent_at || r.lastMailAt}</div>
                </div>
                {(r.phone||r.mobile) && <a className="btn link" href={`tel:${String(r.phone||r.mobile).replace(/\s+/g,'')}`}>Anrufen</a>}
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h3>Kampagneneinstellungen</h3>
          <div className="grid gap">
            <label className="field">
              <span>Sendouts pro Tag</span>
              <input type="number" min="0" value={perDay} onChange={e=>setPerDay(Number(e.target.value||0))} />
            </label>
            <div className="row gap">
              <button className="btn primary" onClick={start} disabled={campaignRunning}>Kampagne starten</button>
              <button className="btn" onClick={stop} disabled={!campaignRunning}>Stoppen</button>
              <button className="btn" onClick={loadAll} disabled={loading}>Neu laden</button>
            </div>
          </div>
        </section>
      </div>

      <div className="grid cols-3 gap">
        <section className="card kpi"><div className="kpi-num">{stats.sent}</div><div className="muted">Gesendet</div></section>
        <section className="card kpi"><div className="kpi-num">{stats.replies}</div><div className="muted">Antworten</div></section>
        <section className="card kpi"><div className="kpi-num">{stats.hot}</div><div className="muted">HOT</div></section>
        <section className="card kpi"><div className="kpi-num">{stats.needReview}</div><div className="muted">Need Review</div></section>
        <section className="card kpi"><div className="kpi-num">{stats.meetings}</div><div className="muted">Meetings</div></section>
      </div>

      <section className="card">
        <div className="row between">
          <h3>Kontakte</h3>
          <label className="row gap">
            <span>Anzahl anzeigen</span>
            <select value={limit} onChange={e=>setLimit(Number(e.target.value))}>
              {[10,25,50,75,100,150,200].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <button className="btn" onClick={loadAll} disabled={loading}>Laden</button>
          </label>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Name</th><th>Firma</th><th>E-Mail</th><th>Status</th><th>Active</th></tr></thead>
            <tbody>
              {contacts.map(r => (
                <tr key={r.id||r.email}>
                  <td>{[r.firstName,r.lastName].filter(Boolean).join(' ')}</td>
                  <td>{r.company}</td>
                  <td>{r.email}</td>
                  <td>{r.status||''}</td>
                  <td>
                    <button className={cn('pill', String(r.active).toUpperCase()==='TRUE'?'green':'red')} onClick={()=>toggleActive(r)}>
                      {String(r.active).toUpperCase()==='TRUE'?'aktiv':'deaktiviert'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row end gap">
          <button className="btn primary" onClick={saveActive} disabled={!Object.keys(updates).length}>Änderungen speichern</button>
        </div>
      </section>
    </section>
  );
}

// ===================== TEMPLATES =====================
function Templates(){
  const [list, setList] = useState([]);
  const [active, setActive] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async ()=>{
    setLoading(true); setErr('');
    try{
      const res = await httpGet(API.templates());
      setList(Array.isArray(res)?res:[]);
      setActive((res&&res[0]&&res[0].name) ? res[0].name : '');
    }catch(e){ setErr(e.message || 'Fehler'); }
    finally{ setLoading(false); }
  }, []);
  useEffect(()=>{ load(); }, [load]);

  const tpl = useMemo(()=> list.find(t=>t.name===active) || null, [list, active]);

  const updateStep = (idx, patch) => {
    setList(prev => prev.map(t => t.name!==active ? t : ({...t, steps: t.steps.map((s,i)=> i===idx? {...s, ...patch} : s)})));
  };
  const save = async ()=>{
    if(!tpl) return;
    const payload = { sequence_id: active, total_steps: (tpl.steps||[]).length, steps: (tpl.steps||[]).map(s=>({ step:s.step||'', subject:s.subject||'', body_html:s.body_html||'', delay_days:Number(s.delay_days||0) })) };
    try{ await httpPost(API.saveTemplate(active), payload); alert('Template gespeichert'); }catch(e){ alert(e.message||'Fehler'); }
  };

  return (
    <section className="grid gap">
      {err && <div className="error">{err}</div>}
      <div className="row gap">
        <select value={active} onChange={e=>setActive(e.target.value)}>
          {list.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
        </select>
        <button className="btn" onClick={load} disabled={loading}>Neu laden</button>
      </div>
      {tpl ? (
        <div className="grid gap">
          {(tpl.steps||[]).map((s, i) => (
            <div key={i} className="card">
              <div className="strong">{s.step}</div>
              <label className="field"><span>Betreff</span><input value={s.subject||''} onChange={e=>updateStep(i,{subject:e.target.value})} /></label>
              <label className="field"><span>Body (HTML)</span><textarea rows="6" value={s.body_html||''} onChange={e=>updateStep(i,{body_html:e.target.value})} /></label>
              <label className="field"><span>Verzögerung (Tage)</span><input type="number" value={s.delay_days||0} onChange={e=>updateStep(i,{delay_days:Number(e.target.value||0)})} /></label>
            </div>
          ))}
          <div className="row end">
            <button className="btn primary" onClick={save}>Speichern</button>
          </div>
        </div>
      ) : <div className="muted">Keine Templates geladen.</div>}
    </section>
  );
}

// ===================== BLACKLIST =====================
function Blacklist(){
  const [q, setQ] = useState('');
  const [withBounces, setWithBounces] = useState(true);
  const [rows, setRows] = useState({ blacklist:[], bounces:[] });
  const [newEmail, setNewEmail] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async ()=>{
    setErr('');
    try{
      const r = await httpGet(API.blacklist(q, withBounces));
      setRows(r);
    }catch(e){ setErr(e.message||'Fehler'); }
  }, [q, withBounces]);

  useEffect(()=>{ load(); }, [load]);

  const add = async ()=>{
    const email = (newEmail||'').trim();
    if(!email || !isEmail(email)) return alert('Bitte gültige E-Mail');
    try{ await httpPost(API.addBlacklist(), { email }); setNewEmail(''); await load(); }catch(e){ alert(e.message||'Fehler'); }
  };

  return (
    <section className="grid gap">
      {err && <div className="error">{err}</div>}
      <div className="row gap">
        <input placeholder="Suche" value={q} onChange={e=>setQ(e.target.value)} />
        <label className="row gap"><input type="checkbox" checked={withBounces} onChange={e=>setWithBounces(e.target.checked)} /> Bounces einbeziehen</label>
        <button className="btn" onClick={load}>Suchen</button>
      </div>
      <div className="grid cols-2 gap">
        <div className="card">
          <div className="strong">Blacklist</div>
          <ul className="list">{rows.blacklist.map((x,i)=>(<li key={x+'|'+i}>{x}</li>))}</ul>
        </div>
        <div className="card">
          <div className="strong">Bounces</div>
          <ul className="list">{rows.bounces.map((x,i)=>(<li key={x+'|'+i}>{x}</li>))}</ul>
        </div>
      </div>
      <div className="card">
        <div className="row gap">
          <input placeholder="name@firma.de" value={newEmail} onChange={e=>setNewEmail(e.target.value)} />
          <button className="btn primary" onClick={add}>Hinzufügen</button>
        </div>
      </div>
    </section>
  );
}

// ===================== KONTAKTE (UPLOAD) =====================
function Kontakte(){
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [mode, setMode] = useState('append');
  const [info, setInfo] = useState('');

  const onFile = async (e)=>{
    const f = e.target.files && e.target.files[0];
    setFile(f||null);
    if (!f) return;
    if (/\.(csv)$/i.test(f.name)) {
      const parsed = await parseCSV(f);
      setRows(parsed);
      setInfo(`Gefunden: ${parsed.length} Zeilen (CSV)`);
    } else {
      setRows([]);
      setInfo('Bitte CSV verwenden (XLSX Support später via SheetJS)');
    }
  };

  const upload = async ()=>{
    if (!rows.length) return alert('Keine gültigen Zeilen');
    try { await httpPost(API.upload(), { rows, mode }); alert('Upload gesendet'); }
    catch(e){ alert(e.message||'Fehler beim Upload'); }
  };
  const prepare = async ()=>{
    try { await httpPost(API.prepareCampaign(), {}); alert('Vorbereitung ausgelöst'); }
    catch(e){ alert(e.message||'Fehler bei Vorbereitung'); }
  };

  return (
    <section className="grid gap">
      <div className="card">
        <div className="strong">Kontaktliste importieren</div>
        <div className="row gap">
          <input type="file" accept=".csv" onChange={onFile} />
          <select value={mode} onChange={e=>setMode(e.target.value)}>
            <option value="append">Anhängen</option>
            <option value="overwrite" disabled>Überschreiben (Server)</option>
          </select>
          <button className="btn" onClick={upload} disabled={!rows.length}>Upload ins Sheet</button>
          <button className="btn" onClick={prepare}>Vorbereiten der neuen Kampagne</button>
        </div>
        {info && <div className="muted">{info}</div>}
        {rows.length>0 && (
          <div className="table-wrap">
            <table className="table small">
              <thead><tr><th>email</th><th>lastName</th><th>company</th><th>firstName</th><th>position</th></tr></thead>
              <tbody>
                {rows.slice(0,10).map((r,i)=>(
                  <tr key={i}><td>{r.email}</td><td>{r.lastName}</td><td>{r.company}</td><td>{r.firstName}</td><td>{r.position}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="muted">Vorschau: {rows.length} Zeilen (erste 10)</div>
          </div>
        )}
      </div>
    </section>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
