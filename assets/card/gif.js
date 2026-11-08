"use strict";

window.cardGif = (() => {
  let pending, percent = 0;
  const listeners = new Set();
  function update(value) { percent = value; for (const listener of listeners) listener(value); }
  async function generate() {
    const existing = await fetch("card.gif", {method:"HEAD"});
    if (existing.ok) { update(100); return; }
    return new Promise((resolve, reject) => {
      const events = new EventSource("card.gif.progress");
      events.onmessage = event => {
        const data = JSON.parse(event.data);
        update(data.percent);
        if (data.status === "complete") { events.close(); resolve(); }
        else if (data.status === "failed") { events.close(); reject(new Error("GIF export failed. Try again.")); }
      };
      events.onerror = () => { events.close(); reject(new Error("GIF export interrupted. Try again.")); };
    });
  }
  return {
    prepare(onProgress = () => {}) {
      listeners.add(onProgress);
      if (!pending) { percent = 0; pending = generate().finally(() => { pending = null; }); }
      onProgress(percent);
      return pending.finally(() => listeners.delete(onProgress));
    },
  };
})();
