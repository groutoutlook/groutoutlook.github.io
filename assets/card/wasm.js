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
  const required = ["wasm_app_new", "wasm_app_free", "wasm_app_render", "wasm_app_render_len", "wasm_app_activate", "wasm_app_tick", "wasm_link_count", "wasm_link_url_ptr", "wasm_link_url_len", "wasm_link_label_ptr", "wasm_link_label_len", "wasm_card_minimum_height", "wasm_app_pointer", "wasm_app_animation_paused", "wasm_app_scroll", "wasm_app_focus_field", "wasm_app_move_focus", "wasm_app_copy_result", "wasm_app_select_button", "wasm_app_output_ptr", "wasm_app_pause_animation", "wasm_app_input", "wasm_app_configure"];
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
  let motionPaused = false;
  const motion = document.querySelector("#motion");
  function applyMotion() { wasm.wasm_app_pause_animation(app, Number(motionPaused)); motion.textContent = motionPaused ? "Play" : "Pause"; motion.setAttribute("aria-pressed", String(!motionPaused)); }
  applyMotion(); motion.disabled = false; motion.onclick = () => { motionPaused = !motionPaused; applyMotion(); };
  reduced.addEventListener("change", event => { if (event.matches) { motionPaused = true; applyMotion(); } });
  const linkCount = wasm.wasm_link_count();
  const read = (ptr, length) => decoder.decode(new Uint8Array(wasm.memory.buffer, ptr, length));
  const readUrl = (index) => read(wasm.wasm_link_url_ptr(index), wasm.wasm_link_url_len(index));
  const context = document.createElement("canvas").getContext("2d");

  let grid;
  function size() {
    const css = getComputedStyle(terminal);
    const availableWidth = stage.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
    const availableHeight = stage.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom);
    const base = matchMedia("(max-width: 640px)").matches ? 10 : 14;
    // Measure real cells. Never force a minimum column count wider than the viewport.
    let fontSize = base, cellWidth, lineHeight, width, visibleRows, minimumRows;
    for (; fontSize >= 8; fontSize -= 0.25) {
      context.font = `${fontSize}px ${css.fontFamily}`;
      cellWidth = context.measureText("M").width;
      lineHeight = fontSize * 1.25;
      width = Math.max(1, Math.min(180, Math.floor(availableWidth / cellWidth)));
      visibleRows = Math.max(1, Math.floor(availableHeight / lineHeight));
      minimumRows = wasm.wasm_card_minimum_height(width);
      if (visibleRows >= minimumRows || fontSize === 8) break;
    }
    terminal.style.fontSize = `${fontSize}px`;
    terminal.style.lineHeight = `${lineHeight}px`;
    // Short landscape windows scroll vertically instead of clipping card details.
    const height = Math.min(120, Math.max(minimumRows, visibleRows));
    grid = {width, height, cellWidth, lineHeight};
    return grid;
  }

  function render() {
    const { width, height } = size();
    const ptr = wasm.wasm_app_render(app, width, height);
    renderAnsi(read(ptr, wasm.wasm_app_render_len(app)));
    motionPaused = Boolean(wasm.wasm_app_animation_paused(app));
    motion.textContent = motionPaused ? "Play" : "Pause";
    motion.setAttribute("aria-pressed", String(!motionPaused));
    status.hidden = !paused;
    status.textContent = paused ? "Paused · Restart to resume" : "";
  }

  function activate() {
    if (paused) return;
    const { width, height } = size();
    const index = wasm.wasm_app_activate(app, width, height, BigInt(Date.now()));
    handleAction(index);
    render();
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    // LAN HTTP does not expose navigator.clipboard; retain a user-gesture fallback.
    const input = document.createElement("textarea");
    input.value = text;
    input.style.cssText = "position:fixed;left:-9999px;top:0;font-size:16px";
    document.body.append(input); input.select();
    let copied;
    try { copied = document.execCommand("copy"); } finally { input.remove(); terminal.focus({preventScroll:true}); }
    if (!copied) throw new Error("Clipboard unavailable");
  }

  function handleAction(index) {
    if (index >= 0) window.open(readUrl(index), "_blank", "noopener,noreferrer");
    if (index === -2) {
      const target = app, value = read(wasm.wasm_app_output_ptr(app), wasm.wasm_app_render_len(app));
      copyText(value).then(() => { if (app === target) { wasm.wasm_app_copy_result(app, 1); render(); } })
        .catch(() => { if (app === target) { wasm.wasm_app_copy_result(app, 0); render(); } });
    }
  }
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
    wasm.wasm_app_select_button(app, linkCount);
    activate();
    terminal.focus({ preventScroll: true });
  });
  document.querySelector("#links").append(lol);
  let pointerStart;
  terminal.addEventListener("pointerdown", event => { pointerStart = {x:event.clientX, y:event.clientY}; });
  terminal.addEventListener("pointercancel", () => { pointerStart = null; });
  terminal.addEventListener("pointerup", event => {
    const start = pointerStart; pointerStart = null;
    if (paused || !start || event.button !== 0 || Math.hypot(event.clientX-start.x, event.clientY-start.y) > 8) return;
    terminal.focus({ preventScroll: true });
    const rect = terminal.getBoundingClientRect(), css = getComputedStyle(terminal);
    const x = Math.floor((event.clientX - rect.left - parseFloat(css.paddingLeft)) / grid.cellWidth);
    const y = Math.floor((event.clientY - rect.top - parseFloat(css.paddingTop)) / grid.lineHeight);
    if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return;
    const index = wasm.wasm_app_pointer(app, grid.width, grid.height, x, y, BigInt(Date.now()));
    handleAction(index);
    render();
  });
  terminal.addEventListener("keydown", (event) => {
    // Leave browser shortcuts (e.g. Ctrl-L, Ctrl-Tab) available.
    if ((event.ctrlKey || event.metaKey || event.altKey) && !(event.ctrlKey && event.key === "c")) return;
    if (paused) return;
    if (event.key === "Tab") wasm.wasm_app_move_focus(app, Number(event.shiftKey));
    else if (["ArrowDown", "ArrowRight"].includes(event.key)) wasm.wasm_app_move_focus(app, 0);
    else if (["ArrowUp", "ArrowLeft"].includes(event.key)) wasm.wasm_app_move_focus(app, 1);
    else if (event.key === "Enter") activate();
    else if (event.key === " ") { motionPaused = !motionPaused; applyMotion(); }
    else if (event.key === "PageDown") wasm.wasm_app_scroll(app, 8);
    else if (event.key === "PageUp") wasm.wasm_app_scroll(app, -8);
    else if (event.key === "Home") wasm.wasm_app_focus_field(app, 0);
    else if (event.key === "End") wasm.wasm_app_focus_field(app, 4);
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
    motionPaused = false; applyMotion();
    lol.disabled = false;
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
  const focusApp = document.querySelector("#focus-app");
  focusApp.disabled = false;
  focusApp.addEventListener("click", () => terminal.focus({ preventScroll: true }));
}

main().catch((error) => {
  terminal.textContent = "The interactive card could not start.";
  status.hidden = false;
  status.textContent = error.message;
});
