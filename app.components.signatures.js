// app.components.signatures.js
// Signatures component with creation mode, name field, and no forced local scope switch.

window.App = window.App || {};
(function(App){
  'use strict';
  const { useState, useEffect } = React;

  function Signatures(){
    const [scope, setScope] = useState('local');
    const [list, setList] = useState([]);
    const [activeName, setActiveName] = useState('');
    const [html, setHtml] = useState('');
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');

    async function load(){
      const url = scope === 'global' ? '/api/global/signatures' : '/api/signatures';
      const data = await App.httpGet(url);
      const arr = Array.isArray(data) ? data : [];
      setList(arr);
      if (!creating){
        const found = arr.find(s => s.name === activeName) || arr[0];
        setActiveName(found ? found.name : '');
        setHtml(found ? (found.html || '') : '');
      }
    }

    useEffect(()=>{ load(); }, [scope]);
    useEffect(()=>{
      if (creating) return;
      const found = list.find(s => s.name === activeName);
      setHtml(found ? (found.html||'') : '');
    }, [activeName, list, creating]);

    function startCreate(){
      setCreating(true);
      setNewName('');
      setHtml('');
      // NOTE: DO NOT force scope to local; respect current scope
    }

    async function save(){
      const name = creating ? newName.trim() : activeName;
      if (!name) { alert('Bitte Name angeben.'); return; }
      const payload = { name, html };
      const url = scope === 'global' ? '/api/global/signatures/save' : '/api/signatures/save';
      await App.httpPost(url, JSON.stringify(payload));
      setCreating(false);
      await load();
    }

    return (
      React.createElement('div', {className:'card'},
        React.createElement('div', {className:'row'},
          React.createElement('h3', null, 'Signaturen'),
          React.createElement('div', {className:'spacer'}),
          React.createElement('label', null, 'Scope:'),
          React.createElement('select', {value:scope, onChange:e=>{ setScope(e.target.value); setCreating(false);} },
            React.createElement('option',{value:'local'},'local'),
            React.createElement('option',{value:'global'},'global')
          ),
          !creating && React.createElement(React.Fragment,null,
            React.createElement('label',{style:{marginLeft:12}},'Signatur:'),
            React.createElement('select',{value:activeName, onChange:e=>setActiveName(e.target.value)},
              list.map(s=>React.createElement('option',{key:s.name, value:s.name}, s.name))
            ),
            React.createElement('button',{className:'btn', style:{marginLeft:12}, onClick:startCreate},'Neue Signatur')
          ),
          creating && React.createElement(React.Fragment,null,
            React.createElement('label',{style:{marginLeft:12}},'Name:'),
            React.createElement('input',{value:newName, onChange:e=>setNewName(e.target.value), placeholder:'Name eingeben…'})
          ),
          React.createElement('button',{className:'btn primary', style:{marginLeft:12}, onClick:save}, 'Speichern')
        ),
        React.createElement('label', null, 'HTML'),
        React.createElement('textarea', {rows:10, value:html, onChange:e=>setHtml(e.target.value)})
      )
    );
  }

  App.Signatures = Signatures;

})(window.App);
