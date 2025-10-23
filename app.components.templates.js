// app.components.templates.js
// Templates component with stable totalSteps handling and step==1 persistence.

window.App = window.App || {};
(function(App){
  'use strict';
  const { useState, useEffect } = React;

  function Templates(){
    const { active } = App.useData();
    const [scope, setScope] = useState('local');
    const [activeName, setActiveName] = useState('');
    const [templates, setTemplates] = useState([]);
    const [steps, setSteps] = useState([]);
    const [totalSteps, setTotalSteps] = useState(1);

    // load list by scope
    async function load(){
      const url = scope === 'global' ? '/api/global/templates' : '/api/templates';
      const data = await App.httpGet(url);
      setTemplates(Array.isArray(data) ? data : []);
      // keep activeName if available
      const exists = (Array.isArray(data) ? data : []).find(t => t.sequence_id === activeName);
      if (!exists && data && data[0]) setActiveName(data[0].sequence_id);
    }

    useEffect(()=>{ load(); }, [scope]);

    // select current template
    useEffect(()=>{
      const t = templates.find(t => t.sequence_id === activeName) || null;
      setSteps(t?.steps || []);
      const ts = Number(t?.total_steps || (t?.steps?.length || 1));
      setTotalSteps(ts > 0 ? ts : 1);
    }, [activeName, templates]);

    function changeTotalSteps(v){
      const n = Math.max(1, Number(v||1));
      setTotalSteps(n); // do NOT touch 'steps' here
    }

    const visibleSteps = steps.slice(0, totalSteps);

    // save
    async function save(){
      const payload = {
        scope, sequence_id: activeName, total_steps: totalSteps,
        steps: steps, // unchanged
      };
      const url = scope === 'global' ? '/api/global/templates/save' : '/api/templates/save';
      await App.httpPost(url, JSON.stringify(payload));
      await load();
    }

    return (
      React.createElement('div', {className:'card'},
        React.createElement('div', {className:'row'},
          React.createElement('h3', null, 'Templates'),
          React.createElement('div', {className:'spacer'}),
          React.createElement('label', null, 'Scope:'),
          React.createElement('select', {value:scope, onChange: e=>setScope(e.target.value)},
            React.createElement('option',{value:'local'},'local'),
            React.createElement('option',{value:'global'},'global')
          ),
          React.createElement('label',{style:{marginLeft:12}},'Template:'),
          React.createElement('select', {value:activeName, onChange:e=>setActiveName(e.target.value)},
            templates.map(t=>React.createElement('option',{key:t.sequence_id, value:t.sequence_id}, t.sequence_id))
          ),
          React.createElement('label',{style:{marginLeft:12}},'Total Steps:'),
          React.createElement('input',{type:'number', min:1, value:totalSteps, onChange:e=>changeTotalSteps(e.target.value), style:{width:80}}),
          React.createElement('button',{onClick:save, className:'btn primary', style:{marginLeft:12}},'Template speichern')
        ),
        React.createElement('div', {className:'stack'},
          visibleSteps.map((s, idx) => (
            React.createElement('div',{key:idx, className:'box'},
              React.createElement('div', {className:'row'},
                React.createElement('strong', null, `Step ${idx+1}`),
                React.createElement('div', {className:'spacer'}),
                React.createElement('label', null, 'Delay (d):'),
                React.createElement('input', {type:'number', min:0, value: s.delay || 0, onChange:e=>{
                  const v = Number(e.target.value||0);
                  const next = steps.slice(); next[idx] = {...next[idx], delay:v}; setSteps(next);
                }, style:{width:80}})
              ),
              React.createElement('label', null, 'Subject'),
              React.createElement('input', {value: s.subject || '', onChange:e=>{
                const next = steps.slice(); next[idx] = {...next[idx], subject:e.target.value}; setSteps(next);
              }}),
              React.createElement('label', null, 'Body'),
              React.createElement('textarea', {rows:6, value: s.body || '', onChange:e=>{
                const next = steps.slice(); next[idx] = {...next[idx], body:e.target.value}; setSteps(next);
              }})
            )
          ))
        )
      )
    );
  }

  App.Templates = Templates;

})(window.App);
