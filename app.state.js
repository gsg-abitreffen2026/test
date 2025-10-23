// app.state.js
// Global lightweight state & context providers. No external libs.

window.App = window.App || {};
(function(App){
  'use strict';
  const { useState, useEffect, useMemo, useContext, createContext } = React;

  // --- Auth / User Context ---
  const UserCtx = createContext({ user:null, setUser:()=>{} });
  function UserProvider({children}){
    const [user, setUser] = useState(App.USER || null);
    const value = useMemo(()=>({user,setUser}),[user]);
    return React.createElement(UserCtx.Provider, {value}, children);
  }
  App.useUser = () => useContext(UserCtx);
  App.UserProvider = UserProvider;

  // --- App Data Context ---
  const DataCtx = createContext(null);
  function DataProvider({children}){
    const [settings, setSettings] = useState({});
    const [active, setActive] = useState({
      templateLocal:'', templateGlobal:'',
      signatureScope:'local', signatureName:''
    });

    async function reloadSettings(){
      try{
        const s = await App.httpGet('/api/settings'); // optional endpoint; tolerate 404
        if (s && typeof s === 'object') setSettings(s);
      }catch(e){ console.warn('settings load failed', e); }
    }

    useEffect(()=>{ reloadSettings(); },[]);

    const value = useMemo(()=>({settings,setSettings,active,setActive,reloadSettings}),[settings,active]);
    return React.createElement(DataCtx.Provider, {value}, children);
  }
  App.useData = () => useContext(DataCtx);
  App.DataProvider = DataProvider;

  // --- Mount helper ---
  App.mount = function(Component){
    const root = document.getElementById('root');
    const tree = React.createElement(App.UserProvider, null,
                  React.createElement(App.DataProvider, null,
                    React.createElement(Component)));
    ReactDOM.createRoot(root).render(tree);
  };

})(window.App);
