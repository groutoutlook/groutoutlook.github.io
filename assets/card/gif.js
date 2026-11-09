"use strict";

window.cardGif = (() => {
  const states = new Map();
  function update(state,value) { state.percent = value; for (const listener of state.listeners) listener(value); }
  async function generate(file,state) {
    const existing = await fetch(file, {method:"HEAD"});
    if (existing.ok) { update(state,100); return; }
    return new Promise((resolve, reject) => {
      const events = new EventSource(file+".progress");
      events.onmessage = event => {
        const data = JSON.parse(event.data);
        update(state,data.percent);
        if (data.status === "complete") { events.close(); resolve(); }
        else if (data.status === "failed") { events.close(); reject(new Error("GIF export failed. Try again.")); }
      };
      events.onerror = () => { events.close(); reject(new Error("GIF export interrupted. Try again.")); };
    });
  }
  return {
    prepare(onProgress = () => {}, file = "card.gif") {
      if (!states.has(file)) states.set(file,{pending:null,percent:0,listeners:new Set()});
      const state=states.get(file); state.listeners.add(onProgress);
      if (!state.pending) { state.percent=0; state.pending=generate(file,state).finally(()=>{state.pending=null;}); }
      onProgress(state.percent);
      return state.pending.finally(()=>state.listeners.delete(onProgress));
    },
  };
})();
