// Email‑Akquise Dashboard (GH Pages build — React + Babel, no bundler)
const { useState, useEffect, useCallback, useMemo } = React;

// ---- API config ----
const API_BASE = 'https://script.google.com/macros/s/AKfycbz1KyuZJlXy9xpjLipMG1ppat2bQDjH361Rv_P8TIGg5Xcjha1HPGvVGRV1xujD049DOw/exec';
const API = {
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

async function httpGet(url) {
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}
async function httpPost(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    // Wichtig für Apps Script + CORS: "simple request", damit KEIN Preflight (OPTIONS) gesendet wird
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error(`POST ${url} -> ${res.status}`);
  return res.json();
}



function cn(...xs){ return xs.filter(Boolean).join(' '); }
function isEmail(x){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x); }

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

// ---- Dashboard ----
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

// ---- Templates ----
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

// ---- Blacklist ----
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
    if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return alert('Bitte gültige E‑Mail');
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

// ---- Kontakte Upload ----
function Kontakte(){
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [mode, setMode] = useState('append');
  const [info, setInfo] = useState('');

  const parseCSV = async (f) => {
    const text = await f.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [];
    const headers = lines[0].split(/,|;|\t/).map(h=>h.trim());
    const data = [];
    for (let i=1;i<lines.length;i++){
      const cols = lines[i].split(/,|;|\t/);
      const rec = {};
      headers.forEach((h,ix) => rec[h] = (cols[ix]||'').trim());
      data.push(rec);
    }
    return data;
  };

  const onFile = async (e)=>{
    const f = e.target.files && e.target.files[0];
    setFile(f||null);
    if (!f) return;
    if (f.name.toLowerCase().endsWith('.csv')) {
      const parsed = await parseCSV(f);
      const ok = parsed.filter(r => r.email && r.lastName && r.company);
      setRows(ok);
      setInfo(`Gefunden: ${ok.length} Zeilen (CSV)`);
    } else {
      setRows([]);
      setInfo('Bitte CSV verwenden (XLSX Support später via SheetJS)');
    }
  };

  const upload = async ()=>{
    if (!rows.length) return alert('Keine gültigen Zeilen');
    try { await httpPost(API.upload(), { rows }); alert('Upload gesendet'); }
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
              <thead><tr><th>email</th><th>lastName</th><th>company</th></tr></thead>
              <tbody>
                {rows.slice(0,10).map((r,i)=>(<tr key={i}><td>{r.email}</td><td>{r.lastName}</td><td>{r.company}</td></tr>))}
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
