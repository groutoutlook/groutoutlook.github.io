"use strict";
if (new URLSearchParams(location.search).has("embed")) document.documentElement.classList.add("embedded");

// The WASM module owns state and rendering. This host only supplies browser I/O.
const terminal = document.querySelector("#terminal");
const stage = document.querySelector("#stage");
const status = document.querySelector("#status");
const restart = document.querySelector("#restart");
const decoder = new TextDecoder();
const palette = ["#000000", "#800000", "#008000", "#808000", "#000080", "#800080", "#008080", "#c0c0c0", "#808080", "#ff0000", "#00ff00", "#ffff00", "#0000ff", "#ff00ff", "#00ffff", "#ffffff"];

function indexedColor(index) {
  if (index < 16) return palette[index];
  if (index >= 232) { const level = 8 + (index - 232) * 10; return `rgb(${level},${level},${level})`; }
  const n = index - 16;
  const levels = [0, 95, 135, 175, 215, 255];
  return `rgb(${levels[Math.floor(n / 36)]},${levels[Math.floor(n / 6) % 6]},${levels[n % 6]})`;
}

function renderAnsi(input) {
  const fragment = document.createDocumentFragment();
  let style = {};
  let cursor = 0;
  function append(text) {
    if (!text) return;
    const span = document.createElement("span");
    Object.assign(span.style, style);
    span.textContent = text;
    fragment.append(span);
  }
  for (const match of input.matchAll(/\x1b\[([\d;]*)m/g)) {
    append(input.slice(cursor, match.index));
    const codes = match[1].split(";").map(Number);
    for (let i = 0; i < codes.length; i += 1) {
      const code = codes[i];
      if (code === 0) style = {};
      else if (code === 1) style.fontWeight = "bold";
      else if (code === 3) style.fontStyle = "italic";
      else if (code === 4) style.textDecoration = "underline";
      else if (code === 38 || code === 48) {
        const property = code === 38 ? "color" : "backgroundColor";
        if (codes[i + 1] === 2) {
          style[property] = `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`;
          i += 4;
        } else if (codes[i + 1] === 5) {
          style[property] = indexedColor(codes[i + 2]);
          i += 2;
        }
      }
    }
    cursor = match.index + match[0].length;
  }
  append(input.slice(cursor));
  terminal.replaceChildren(fragment);
}

async function main() {
  if (location.protocol === "file:") throw new Error("Start `just preview` to load WASM over local HTTP in Chrome or Edge. Standalone card.html and card.svg can be opened directly.");
  const response = await fetch("card.wasm");
  if (!response.ok) throw new Error(`Could not load card.wasm (HTTP ${response.status}). Run just wasm-stage.`);
  const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), {});
  const wasm = instance.exports;
  const required = ["wasm_app_new", "wasm_app_free", "wasm_app_render", "wasm_app_render_len", "wasm_app_next_button", "wasm_app_previous_button", "wasm_app_activate", "wasm_app_tick", "wasm_app_dialog_count", "wasm_link_count", "wasm_link_url_ptr", "wasm_link_url_len", "wasm_link_label_ptr", "wasm_link_label_len"];
  if (!(wasm.memory instanceof WebAssembly.Memory) || required.some((name) => typeof wasm[name] !== "function")) {
    throw new Error("This WASM build is missing browser exports. Rebuild with just wasm-stage.");
  }
  const configResponse = await fetch("animation.json");
  if (!configResponse.ok) throw new Error("Animation settings are unavailable. Run just wasm-stage.");
  const configBytes = new Uint8Array(await configResponse.arrayBuffer());
  function configure(app) {
    const ptr = wasm.wasm_app_input(app, configBytes.length);
    new Uint8Array(wasm.memory.buffer, ptr, configBytes.length).set(configBytes);
    if (!wasm.wasm_app_configure(app)) throw new Error("Invalid animation.json. Fix the colors or timings and rebuild.");
  }
  let app = wasm.wasm_app_new();
  configure(app);
  let paused = false;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let motionPaused = reduced.matches;
  const motion = document.querySelector("#motion");
  function applyMotion() { wasm.wasm_app_pause_animation(app, Number(motionPaused)); motion.textContent = motionPaused ? "Play" : "Pause"; motion.setAttribute("aria-pressed", String(!motionPaused)); }
  applyMotion(); motion.disabled = false; motion.onclick = () => { motionPaused = !motionPaused; applyMotion(); };
  reduced.addEventListener("change", event => { if (event.matches) { motionPaused = true; applyMotion(); } });
  let selected = 0;
  let lastDialogCount = 0;
  const linkCount = wasm.wasm_link_count();
  const read = (ptr, length) => decoder.decode(new Uint8Array(wasm.memory.buffer, ptr, length));
  const readUrl = (index) => read(wasm.wasm_link_url_ptr(index), wasm.wasm_link_url_len(index));
  const context = document.createElement("canvas").getContext("2d");

  function size() {
    const base = matchMedia("(max-width: 640px)").matches ? 12 : 15;
    const fontSize = Math.max(9, Math.min(base, (stage.clientHeight - 26) / (29 * 1.2), (stage.clientWidth - 26) / (48 * 0.61)));
    terminal.style.fontSize = `${fontSize}px`;
    const css = getComputedStyle(terminal);
    context.font = `${css.fontSize} ${css.fontFamily}`;
    return {
      width: Math.max(48, Math.min(180, Math.floor((stage.clientWidth - 26) / context.measureText("M").width))),
      height: Math.max(29, Math.min(70, Math.floor((stage.clientHeight - 26) / parseFloat(css.lineHeight)))),
    };
  }

  function render() {
    const { width, height } = size();
    const ptr = wasm.wasm_app_render(app, width, height);
    renderAnsi(read(ptr, wasm.wasm_app_render_len(app)));
    lastDialogCount = wasm.wasm_app_dialog_count(app);
    status.hidden = !paused;
    status.textContent = paused ? "Paused · Restart to resume" : "";
  }

  function activate() {
    if (paused) return;
    const { width, height } = size();
    const index = wasm.wasm_app_activate(app, width, height, BigInt(Date.now()));
    if (index >= 0) window.open(readUrl(index), "_blank", "noopener,noreferrer");
    render();
  }

  function next() { wasm.wasm_app_next_button(app); selected = (selected + 1) % (linkCount + 1); }
  function previous() { wasm.wasm_app_previous_button(app); selected = (selected + linkCount) % (linkCount + 1); }
  for (let index = 0; index < linkCount; index += 1) {
    const link = document.createElement("a");
    link.textContent = read(wasm.wasm_link_label_ptr(index), wasm.wasm_link_label_len(index));
    link.href = readUrl(index);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.querySelector("#links").append(link);
  }
  const lol = document.createElement("button");
  lol.type = "button";
  lol.textContent = "lol";
  lol.addEventListener("click", () => {
    if (paused) return;
    while (selected !== linkCount) next();
    activate();
    terminal.focus({ preventScroll: true });
  });
  document.querySelector("#links").append(lol);
  terminal.addEventListener("click", () => terminal.focus({ preventScroll: true }));
  terminal.addEventListener("keydown", (event) => {
    // Leave browser shortcuts (e.g. Ctrl-L, Ctrl-Tab) available.
    if ((event.ctrlKey || event.metaKey || event.altKey) && !(event.ctrlKey && event.key === "c")) return;
    if (paused) return;
    if (["ArrowDown", "ArrowRight"].includes(event.key) || (event.key === "Tab" && !event.shiftKey)) next();
    else if (["ArrowUp", "ArrowLeft"].includes(event.key) || (event.key === "Tab" && event.shiftKey)) previous();
    else if (event.key === "Enter") activate();
    else if (event.key === " ") { motionPaused = !motionPaused; applyMotion(); }
    else if (["q", "Escape"].includes(event.key) || (event.ctrlKey && event.key === "c")) { paused = true; lol.disabled = true; }
    else return;
    event.preventDefault();
    render();
  });
  restart.disabled = false;
  restart.addEventListener("click", () => {
    wasm.wasm_app_free(app);
    app = wasm.wasm_app_new();
    configure(app);
    paused = false;
    motionPaused = reduced.matches; applyMotion();
    lol.disabled = false;
    selected = 0;
    render();
    terminal.focus({ preventScroll: true });
  });
  const observer = new ResizeObserver(render);
  observer.observe(stage);
  const timer = setInterval(() => {
    if (paused) return;
    wasm.wasm_app_tick(app, BigInt(Date.now()));
    render();
  }, 100);
  window.addEventListener("pagehide", () => { clearInterval(timer); observer.disconnect(); wasm.wasm_app_free(app); }, { once: true });
  await document.fonts.ready;
  render();
}

main().catch((error) => {
  terminal.textContent = "The interactive card could not start.";
  status.hidden = false;
  status.textContent = error.message;
});
