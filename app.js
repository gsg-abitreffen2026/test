const { useState, useEffect, useCallback, useMemo, useRef } = React;

const API_BASE = 'https://script.google.com/macros/s/AKfycbz1KyuZJlXy9xpjLipMG1ppat2bQDjH361Rv_P8TIGg5Xcjha1HPGvVGRV1xujD049DOw/exec';
const API = {
  contacts: (limit) => `${API_BASE}?path=api/contacts&limit=${encodeURIComponent(limit || 50)}`,
  stats: () => `${API_BASE}?path=api/stats`,
  inbox: () => `${API_BASE}?path=api/review-inbox`,
  todos: (limit) => `${API_BASE}?path=api/sent-todos&limit=${encodeURIComponent(limit || 25)}`,
  templates: () => `${API_BASE}?path=api/templates`,
  blacklist: (q, includeBounces) => `${API_BASE}?path=api/blacklist&q=${encodeURIComponent(q||'')}&bounces=${includeBounces?1:0}`,
  toggleActive: () => `${API_BASE}?path=api/contacts/active`,
  saveTemplate: (sequenceId) => `${API_BASE}?path=${encodeURIComponent('api/templates/' + sequenceId)}`,
  addBlacklist: () => `${API_BASE}?path=api/blacklist`,
  upload: () => `${API_BASE}?path=api/upload`,
  prepareCampaign: () => `${API_BASE}?path=api/campaign/prepare`,
  startCampaign: () => `${API_BASE}?path=api/campaign/start`,
  stopCampaign: () => `${API_BASE}?path=api/campaign/stop`,
};

async function httpGet(url) { const r = await fetch(url); if(!r.ok) throw new Error('GET '+url+' -> '+r.status); return r.json(); }
async function httpPost(url, body) {
  const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body||{}) });
  if(!r.ok) throw new Error('POST '+url+' -> '+r.status);
  return r.json();
}

function cn(...xs){ return xs.filter(Boolean).join(' '); }

function App(){
  const [page, setPage] = useState('login');
  const [authed, setAuthed] = useState(false);
  const [user, setUser] = useState('Maxi');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');

  const doLogin = useCallback((e)=>{
    e && e.preventDefault();
    const ok = (user==='Maxi' || user==='Thorsten') && pw==='avus';
    if(ok){ setAuthed(true); setPage('dashboard'); setErr(''); } else setErr('Login fehlgeschlagen');
  }, [user,pw]);

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
          <div className="brand-bottom">smart‑cap Dashboard</div>
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
      const [s, c] = await Promise.all([
        httpGet(API.stats()),
        httpGet(API.contacts(limit)),
      ]);
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
          <h3>To‑Dos (angeschrieben)</h3>
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
            <thead><tr><th>Name</th><th>Firma</th><th>E‑Mail</th><th>Status</th><th>Active</th></tr></thead>
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

function Templates(){
  const [list, setList] = useState([]);
  const [active, setActive] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async ()=>{
    setLoading(true); // Intentional typo to ensure we test error handling? We'll fix to true.
  }, []);
}