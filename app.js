/* Helganator PWA – felület. */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  let planner, mains, selected = new Set(), currentWeek = null, shopDone = new Set(), saved = [];
  let settings = { target: 1550, protein: 90 };
  const TARGET_OPTS = [1400, 1550, 1700, 1850, 2000];
  const PROTEIN_OPTS = [90, 110, 130];

  // ---- betöltés ----
  fetch("data.json").then((r) => r.json()).then((data) => {
    planner = new Planner(data);
    mains = planner.recipes
      .filter((r) => (r.meal_type || []).some((t) => t === "ebed" || t === "vacsora")
        && !planner.isSweet(r))   // desszert/snack ne legyen választható főétel
      .sort((a, b) => a.name.localeCompare(b.name, "hu"));
    restore();
    applySettings();
    renderDishList("");
    if (currentWeek) renderWeek(currentWeek);
    renderShop();
  }).catch((e) => { $("#dish-list").innerHTML = "<li class='empty'>Nem sikerült betölteni az adatokat.</li>"; console.error(e); });

  function applySettings() {
    planner.setConfig({ kcal_target: settings.target, protein_min: settings.protein });
    const min = settings.target - 50, max = settings.target + 50;
    $("#subtitle").textContent =
      `napi ${min}–${max} kcal · min. ${settings.protein} g fehérje`;
  }

  // ---- állapot mentés/visszaállítás ----
  function persist() {
    try {
      localStorage.setItem("hg_week", JSON.stringify(currentWeek));
      localStorage.setItem("hg_shopdone", JSON.stringify([...shopDone]));
      localStorage.setItem("hg_saved", JSON.stringify(saved));
      localStorage.setItem("hg_settings", JSON.stringify(settings));
    } catch (e) {}
  }
  function restore() {
    try {
      const w = localStorage.getItem("hg_week");
      if (w) currentWeek = JSON.parse(w);
      const s = localStorage.getItem("hg_shopdone");
      if (s) shopDone = new Set(JSON.parse(s));
      const sv = localStorage.getItem("hg_saved");
      if (sv) saved = JSON.parse(sv);
      const st = localStorage.getItem("hg_settings");
      if (st) settings = Object.assign(settings, JSON.parse(st));
    } catch (e) {}
  }

  // ---- ételválasztó ----
  function renderDishList(q) {
    const list = $("#dish-list");
    list.innerHTML = "";
    const ql = q.toLowerCase();
    const items = mains.filter((r) => !ql || r.name.toLowerCase().includes(ql));
    if (!items.length) { list.appendChild(el("li", "empty", "Nincs találat.")); return; }
    for (const r of items) {
      const li = el("li", "dish-item" + (selected.has(r.name) ? " sel" : ""));
      li.appendChild(el("div", "check", selected.has(r.name) ? "✓" : ""));
      const main = el("div", "dish-main");
      main.appendChild(el("div", "dish-name", r.name));
      main.appendChild(el("div", "dish-meta", `${Math.round(r.macros.kcal)} kcal · ${Math.round(r.macros.p)} g fehérje`));
      li.appendChild(main);
      const info = el("button", "dish-info", "ⓘ");
      info.addEventListener("click", (ev) => { ev.stopPropagation(); showRecipe(r); });
      li.appendChild(info);
      li.addEventListener("click", () => { toggleSelect(r.name); });
      list.appendChild(li);
    }
  }

  function toggleSelect(name) {
    if (selected.has(name)) selected.delete(name); else selected.add(name);
    renderChips(); renderDishList($("#search").value);
  }
  function renderChips() {
    const box = $("#chips"); box.innerHTML = "";
    for (const name of selected) {
      const chip = el("div", "chip"); chip.appendChild(el("span", null, name));
      const x = el("button", null, "✕");
      x.addEventListener("click", () => toggleSelect(name));
      chip.appendChild(x); box.appendChild(chip);
    }
  }

  $("#search").addEventListener("input", (e) => renderDishList(e.target.value));
  $("#btn-clear").addEventListener("click", () => {
    selected.clear(); renderChips(); renderDishList($("#search").value);
    $("#week").classList.add("hidden"); $("#picker").classList.remove("hidden");
  });

  $("#btn-generate").addEventListener("click", () => {
    currentWeek = planner.planWeek([...selected]);
    shopDone = new Set();
    persist();
    renderWeek(currentWeek);
    renderShop();
    toast("Heti terv elkészült ✓");
  });

  // ---- heti terv nézet ----
  function renderWeek(week) {
    const box = $("#week");
    box.innerHTML = "";
    box.classList.remove("hidden");
    $("#picker").classList.add("hidden");

    const actions = el("div", "week-actions");
    const back = el("button", "btn ghost small", "‹ Vissza");
    back.addEventListener("click", () => { box.classList.add("hidden"); $("#picker").classList.remove("hidden"); });
    const regen = el("button", "btn ghost small", "Újragenerálás");
    regen.addEventListener("click", () => $("#btn-generate").click());
    const save = el("button", "btn primary small", "💾 Mentés");
    save.addEventListener("click", () => saveWeek());
    const share = el("button", "btn primary small", "⤴ Megosztás");
    share.addEventListener("click", () => shareWeek());
    actions.append(back, regen, save, share);
    box.appendChild(actions);

    week.forEach((day, i) => {
      const card = el("div", "day-card" + (i === 0 ? " open" : ""));
      const head = el("div", "day-head");
      const left = el("div");
      left.appendChild(el("div", "day-title", `${i + 1}. nap`));
      const right = el("div", "day-macros");
      right.innerHTML = `<b>${Math.round(day.macros.kcal)}</b> kcal<br>${Math.round(day.macros.p)} g fehérje`;
      head.append(left, right);
      head.addEventListener("click", () => card.classList.toggle("open"));
      card.appendChild(head);

      const meals = el("div", "day-meals");
      for (const m of day.plan) {
        const row = el("div", "meal" + (m.type === "KORREKCIÓ" ? " corr" : ""));
        const l = el("div");
        l.appendChild(el("div", "meal-type", m.type));
        l.appendChild(el("div", "meal-name", m.recipe ? m.recipe.name : (m.note || "—")));
        row.appendChild(l);
        if (m.recipe) {
          row.appendChild(el("div", "meal-kcal", `${Math.round(m.recipe.macros.kcal)} kcal`));
          row.addEventListener("click", () => showMeal(m.recipe));
        }
        meals.appendChild(row);
      }
      card.appendChild(meals);
      box.appendChild(card);
    });
  }

  // ---- bevásárlólista ----
  function renderShop() {
    const list = $("#shop-list"), empty = $("#shop-empty");
    list.innerHTML = "";
    if (!currentWeek) { empty.style.display = ""; return; }
    empty.style.display = "none";
    for (const { item, amount, unit } of planner.shoppingList(currentWeek)) {
      const li = el("li", "shop-item" + (shopDone.has(item) ? " done" : ""));
      li.appendChild(el("div", "shop-check", shopDone.has(item) ? "✓" : ""));
      li.appendChild(el("div", "shop-name", cap(item)));
      li.appendChild(el("div", "shop-amt", `${amount} ${unit}`));
      li.addEventListener("click", () => {
        if (shopDone.has(item)) shopDone.delete(item); else shopDone.add(item);
        persist(); renderShop();
      });
      list.appendChild(li);
    }
  }

  // ---- mit főzzek ----
  $("#btn-cook").addEventListener("click", () => {
    const have = ($("#pantry").value || "").split(",").map((s) => s.trim()).filter(Boolean);
    const list = $("#cook-list"); list.innerHTML = "";
    if (!have.length) { list.appendChild(el("li", "empty", "Adj meg legalább egy alapanyagot.")); return; }
    const res = planner.cookable(have).slice(0, 40);
    if (!res.length) { list.appendChild(el("li", "empty", "Ebből semmi nem jött ki – próbálj több alapanyagot.")); return; }
    for (const { recipe, missing, matchRatio } of res) {
      const li = el("li", "dish-item" + (missing.length === 0 ? " sel" : ""));
      li.appendChild(el("div", "check", missing.length === 0 ? "✓" : Math.round(matchRatio * 100) + "%"));
      const main = el("div", "dish-main");
      main.appendChild(el("div", "dish-name", recipe.name));
      const meta = el("div", "dish-meta");
      meta.textContent = missing.length === 0
        ? "minden megvan hozzá!"
        : "hiányzik: " + missing.slice(0, 4).join(", ") + (missing.length > 4 ? "…" : "");
      main.appendChild(meta);
      li.appendChild(main);
      li.addEventListener("click", () => showRecipe(recipe));
      list.appendChild(li);
    }
  });

  // ---- recept modal ----
  function showRecipe(r) { renderModal(r.name, r.macros, r.ing, r.prep); }
  function showMeal(recipe) {
    const prep = recipe.prep || (planner.byId.get(recipe.id) || {}).prep || "";
    renderModal(recipe.name, recipe.macros, recipe.ing, prep);
  }
  function renderModal(name, macros, ings, prep) {
    const body = $("#modal-body");
    body.className = "modal-body";
    body.innerHTML = "";
    body.appendChild(el("h2", null, name));
    const mr = el("div", "macro-row");
    const pill = (lab, val) => { const p = el("div", "macro-pill"); p.innerHTML = `<b>${val}</b>${lab}`; return p; };
    mr.append(pill("kcal", Math.round(macros.kcal)), pill("g fehérje", Math.round(macros.p)),
      pill("g zsír", Math.round(macros.f)), pill("g szénh.", Math.round(macros.c)));
    body.appendChild(mr);

    body.appendChild(el("h3", "sec-title", "Hozzávalók"));
    const ul = el("ul", "ing-list");
    for (const ing of ings) {
      const li = el("li");
      li.appendChild(el("span", null, cap(ing.n)));
      li.appendChild(el("span", "ing-amt", `${ing.a} ${ing.u}`));
      ul.appendChild(li);
    }
    body.appendChild(ul);

    if (prep && prep.trim()) {
      body.appendChild(el("h3", "sec-title", "Elkészítés"));
      body.appendChild(el("p", "prep-text", prep));
    }
    $("#modal").classList.remove("hidden");
  }
  $("#modal-close").addEventListener("click", () => $("#modal").classList.add("hidden"));
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") $("#modal").classList.add("hidden"); });

  // ---- mentés / megosztás ----
  async function shareWeek() {
    if (!currentWeek) return;
    const text = planner.toText(currentWeek);
    const fname = "helganator_etrend.txt";
    try {
      if (navigator.canShare && navigator.canShare({ files: [new File([text], fname, { type: "text/plain" })] })) {
        await navigator.share({ files: [new File([text], fname, { type: "text/plain" })], title: "Heti étrend" });
        return;
      }
      if (navigator.share) { await navigator.share({ title: "Heti étrend", text }); return; }
    } catch (e) { /* megszakítva v. nem támogatott -> letöltés */ }
    const blob = new Blob([text], { type: "text/plain" });
    const a = el("a"); a.href = URL.createObjectURL(blob); a.download = fname;
    document.body.appendChild(a); a.click(); a.remove();
    toast("Letöltve ✓");
  }

  // ---- mentett hetek ----
  function saveWeek() {
    if (!currentWeek) return;
    const def = "Heti menü – " + new Date().toLocaleDateString("hu-HU");
    const name = (prompt("Add meg a mentés nevét:", def) || "").trim();
    if (!name) return;
    saved.unshift({
      id: Date.now(), name,
      date: new Date().toLocaleDateString("hu-HU"),
      week: currentWeek, shopDone: [...shopDone],
    });
    persist();
    renderSaved();
    toast("Elmentve ✓");
  }

  function loadSaved(id) {
    const entry = saved.find((s) => s.id === id);
    if (!entry) return;
    currentWeek = entry.week;
    shopDone = new Set(entry.shopDone || []);
    persist();
    renderWeek(currentWeek);
    renderShop();
    switchView("plan");
    toast("Betöltve: " + entry.name);
  }

  function deleteSaved(id) {
    saved = saved.filter((s) => s.id !== id);
    persist();
    renderSaved();
  }

  function renderSaved() {
    const list = $("#saved-list"), empty = $("#saved-empty");
    list.innerHTML = "";
    if (!saved.length) { empty.style.display = ""; return; }
    empty.style.display = "none";
    for (const s of saved) {
      const li = el("li", "dish-item");
      const main = el("div", "dish-main");
      main.appendChild(el("div", "dish-name", s.name));
      const days = (s.week || []).length;
      main.appendChild(el("div", "dish-meta", `${s.date} · ${days} nap`));
      li.appendChild(main);
      const open = el("button", "btn primary small", "Megnyit");
      open.addEventListener("click", (e) => { e.stopPropagation(); loadSaved(s.id); });
      li.appendChild(open);
      const del = el("button", "dish-info", "🗑");
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm(`Törlöd ezt: „${s.name}"?`)) deleteSaved(s.id);
      });
      li.appendChild(del);
      list.appendChild(li);
    }
  }

  // ---- alsó nav ----
  function switchView(view) {
    $$(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    $$(".view").forEach((v) => v.classList.remove("active"));
    $("#view-" + view).classList.add("active");
    if (view === "shop") renderShop();
    if (view === "saved") renderSaved();
  }
  $$(".nav-btn").forEach((btn) => btn.addEventListener("click", () => switchView(btn.dataset.view)));

  // a Helganator név/ikon visszavisz a kezdőképernyőre (Tervező + ételválasztó)
  function goHome() {
    $("#week").classList.add("hidden");
    $("#picker").classList.remove("hidden");
    switchView("plan");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  $("#brand").addEventListener("click", goHome);
  $("#brand").addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") goHome();
  });

  // ---- beállítások ----
  $("#btn-settings").addEventListener("click", renderSettings);
  function renderSettings() {
    const body = $("#modal-body");
    body.className = "modal-body";
    body.innerHTML = "";
    body.appendChild(el("h2", null, "⚙️ Beállítások"));

    const group = (label, opts, cur, suffix, onPick) => {
      const g = el("div", "set-group");
      g.appendChild(el("div", "set-label", label));
      const row = el("div", "set-opts");
      for (const v of opts) {
        const b = el("button", "set-opt" + (v === cur ? " on" : ""), v + suffix);
        b.addEventListener("click", () => onPick(v));
        row.appendChild(b);
      }
      g.appendChild(row);
      body.appendChild(g);
    };
    // kalória-cél: csúszka + beíró mező (szinkronban)
    const cg = el("div", "set-group");
    cg.appendChild(el("div", "set-label", "Napi kalória-cél"));
    const sliderRow = el("div", "slider-row");
    const numInput = document.createElement("input");
    numInput.type = "number"; numInput.className = "set-num";
    numInput.min = "1200"; numInput.max = "2800"; numInput.step = "10";
    numInput.value = settings.target;
    const slider = document.createElement("input");
    slider.type = "range"; slider.className = "set-slider";
    slider.min = "1200"; slider.max = "2800"; slider.step = "10";
    slider.value = settings.target;
    const clamp = (v) => Math.max(1200, Math.min(2800, Math.round(v / 10) * 10)) || 1500;
    const bandNote = el("div", "set-note", "");
    const updateNote = () => {
      bandNote.textContent = `Egy nap ${settings.target - 50}–${settings.target + 50} kcal között lesz.`;
    };
    const setTarget = (v, syncBoth) => {
      settings.target = clamp(v);
      slider.value = settings.target;
      if (syncBoth) numInput.value = settings.target;
      updateNote(); persist(); applySettings();
    };
    slider.addEventListener("input", () => {
      numInput.value = slider.value; settings.target = clamp(+slider.value); updateNote();
    });
    slider.addEventListener("change", () => setTarget(+slider.value, true));
    numInput.addEventListener("change", () => setTarget(+numInput.value, true));
    sliderRow.append(slider, numInput);
    cg.appendChild(sliderRow);
    updateNote();
    cg.appendChild(bandNote);
    body.appendChild(cg);

    group("Fehérje minimum / nap", PROTEIN_OPTS, settings.protein, " g", (v) => {
      settings.protein = v; persist(); applySettings(); renderSettings();
    });
    const note = el("p", "set-note",
      "A beállítás a következő heti tervre érvényes – az adagok arányosan " +
      "igazodnak a célhoz, a fehérje a minimum fölött marad.");
    body.appendChild(note);
    if (currentWeek) {
      const btn = el("button", "btn primary", "Új terv ezzel a beállítással");
      btn.style.marginTop = "14px"; btn.style.width = "100%";
      btn.addEventListener("click", () => { $("#modal").classList.add("hidden"); $("#btn-generate").click(); });
      body.appendChild(btn);
    }
    $("#modal").classList.remove("hidden");
  }

  // ---- toast ----
  let toastT;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.add("hidden"), 1800);
  }

  // ---- service worker ----
  if ("serviceWorker" in navigator)
    navigator.serviceWorker.register("sw.js").catch(() => {});
})();
