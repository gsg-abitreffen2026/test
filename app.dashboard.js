// app.dashboard.js
// Minimal App shell that wires modules together; extend with KPIs/Contacts as needed.

window.App = window.App || {};
(function(App){
  'use strict';

  function Tabs(){
    const [tab, setTab] = React.useState('templates');
    const TabBtn = ({id, label}) => React.createElement('button', {
      className: App.cx('tabbtn', tab===id && 'active'),
      onClick: ()=>setTab(id)
    }, label);

    return React.createElement('div', null,
      React.createElement('div', {className:'tabs'},
        React.createElement(TabBtn,{id:'templates',label:'Templates'}),
        React.createElement(TabBtn,{id:'signatures',label:'Signaturen'}),
        React.createElement(TabBtn,{id:'upload',label:'Upload'}),
        React.createElement(TabBtn,{id:'errors',label:'Fehlerliste'})
      ),
      tab==='templates' && React.createElement(App.Templates),
      tab==='signatures' && React.createElement(App.Signatures),
      tab==='upload' && React.createElement(App.Upload),
      tab==='errors' && React.createElement(App.ErrorList)
    );
  }

  function AppRoot(){
    return React.createElement('div',{className:'container'},
      React.createElement('h2', null, 'Email-Akquise Dashboard'),
      React.createElement(Tabs)
    );
  }

  App.AppRoot = AppRoot;

})(window.App);
