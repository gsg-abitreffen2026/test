// app.components.upload.js
// Upload module: parse CSV/PDF externally; here we handle prepared rows and copy errors to error_list.

window.App = window.App || {};
(function(App){
  'use strict';
  const { useState } = React;

  function validateRow(r){
    const must = ['email','firstName','lastName'];
    return must.every(k => String(r[k]||'').trim() !== '');
  }

  async function addToGlobalErrorList(row){
    const payload = {
      id: row.id || '',
      email: row.email || '',
      Anrede: row.Anrede || '',
      firstName: row.firstName || '',
      lastName: row.lastName || '',
      company: row.company || '',
      phone: row.phone || '',
      mobile: row.mobile || '',
      reason: row.reason || 'MISSING'
    };
    return App.httpPost('/api/global/error_list/add', JSON.stringify(payload));
  }

  function Upload(){
    const [rows, setRows] = useState([]);
    const [errors, setErrors] = useState([]);
    const [preview, setPreview] = useState([]);

    async function handlePreparedRows(inputRows){
      const ok = [];
      const errs = [];
      for (const r of inputRows){
        const isValid = validateRow(r);
        if (!isValid){
          try { await addToGlobalErrorList({...r, reason:'MISSING'}); } catch(e){ console.warn('error_list add failed', e); }
          errs.push(r);
        }
        ok.push(r); // FEHLERZEILEN BLEIBEN DRIN
      }
      setRows(ok);
      setErrors(errs);
      setPreview(ok.slice(0,15));
    }

    // UI stub to demo behavior; integrate with your existing parse/preview flow
    return (
      React.createElement('div',{className:'card'},
        React.createElement('h3',null,'Upload'),
        React.createElement('div',null,`Zeilen: ${rows.length} — Fehler kopiert: ${errors.length}`),
        React.createElement('div',{className:'stack'},
          preview.map((r,i)=>React.createElement('div',{key:i,className:'box'}, JSON.stringify(r)))
        ),
        React.createElement('div',{className:'row note'}, 'Hinweis: Fehlerzeilen werden in error_list kopiert, aber im Upload behalten.')
      )
    );
  }

  App.Upload = Upload;
  App.handlePreparedRows = async (rows)=>{ /* shim if needed */ };

})(window.App);
