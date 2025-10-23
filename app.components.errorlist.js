// app.components.errorlist.js
// ErrorList with column filters: show rows where selected column is empty. UI polish deferred to CSS.

window.App = window.App || {};
(function(App){
  'use strict';
  const { useEffect, useState } = React;

  function ErrorList(){
    const [rows, setRows] = useState([]);
    const [search, setSearch] = useState('');
    const [filterCol, setFilterCol] = useState('');
    const [onlyEmpty, setOnlyEmpty] = useState(true);
    const cols = ['email','Anrede','firstName','lastName','company','phone','mobile','reason'];

    useEffect(()=>{ (async()=>{
      const data = await App.httpGet('/api/global/error_list');
      setRows(Array.isArray(data)?data:[]);
    })(); },[]);

    function toggleRow(row){ row._checked = !row._checked; setRows([...rows]); }
    function toggleAll(e){ const v=e.target.checked; setRows(rows.map(r=>({...r, _checked:v}))); }

    const filtered = rows.filter(r => {
      const txt = `${r.email||''} ${r.firstName||''} ${r.lastName||''} ${r.company||''}`.toLowerCase();
      if (search && !txt.includes(search.toLowerCase())) return false;
      if (!filterCol) return true;
      const v = String(r[filterCol] ?? '').trim();
      return onlyEmpty ? v === '' : true;
    });

    async function deleteChecked(){
      const ids = rows.filter(r=>r._checked && r.id).map(r=>r.id);
      if (!ids.length) return;
      await App.httpPost('/api/global/error_list/delete', JSON.stringify({ ids }));
      setRows(rows.filter(r=>!r._checked));
    }

    return (
      React.createElement('div',{className:'card'},
        React.createElement('div',{className:'row'},
          React.createElement('h3',null,'Fehlerliste'),
          React.createElement('div',{className:'spacer'}),
          React.createElement('input',{placeholder:'Suchen…', value:search, onChange:e=>setSearch(e.target.value)}),
          React.createElement('select',{value:filterCol, onChange:e=>setFilterCol(e.target.value), style:{marginLeft:8}},
            React.createElement('option',{value:''},'— Spalte wählen —'),
            cols.map(c=>React.createElement('option',{key:c,value:c},c))
          ),
          React.createElement('label',{style:{marginLeft:8, display:'inline-flex', alignItems:'center', gap:8}},
            React.createElement('input',{type:'checkbox', checked:onlyEmpty, onChange:e=>setOnlyEmpty(e.target.checked)}),
            'nur leere anzeigen'
          ),
          React.createElement('button',{className:'btn danger', style:{marginLeft:12}, onClick:deleteChecked},'Ausgewählte löschen')
        ),
        React.createElement('table',{className:'table errorlist'},
          React.createElement('thead',null,
            React.createElement('tr',null,
              React.createElement('th',{style:{width:36}},
                React.createElement('input',{type:'checkbox', onChange:toggleAll})
              ),
              React.createElement('th',null,'email'),
              React.createElement('th',null,'Anrede'),
              React.createElement('th',null,'firstName'),
              React.createElement('th',null,'lastName'),
              React.createElement('th',null,'company'),
              React.createElement('th',null,'phone'),
              React.createElement('th',null,'mobile')
              // reason bewusst weggelassen; bleibt in Daten vorhanden
            )
          ),
          React.createElement('tbody',null,
            filtered.map((r,idx)=>React.createElement('tr',{key:r.id||idx, className:(!r.email||!r.firstName||!r.lastName)?'row-error':''},
              React.createElement('td',null, React.createElement('input',{type:'checkbox', checked:!!r._checked, onChange:()=>toggleRow(r)})),
              React.createElement('td',null, r.email||''),
              React.createElement('td',null, r.Anrede||''),
              React.createElement('td',null, r.firstName||''),
              React.createElement('td',null, r.lastName||''),
              React.createElement('td',null, r.company||''),
              React.createElement('td',null, r.phone||''),
              React.createElement('td',null, r.mobile||'')
            ))
          )
        )
      )
    );
  }

  App.ErrorList = ErrorList;

})(window.App);
