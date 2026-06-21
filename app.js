/* Helganator PWA – felület. */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  // recept-bélyegkép (lusta betöltés, hibánál emoji-helyőrző)
  const thumbPlaceholder = () => el("div", "dish-thumb noimg", "🍽");
  function thumb(r) {
    if (!r || !r.img) return thumbPlaceholder();
    const im = el("img", "dish-thumb");
    im.src = r.img; im.alt = ""; im.loading = "lazy"; im.decoding = "async";
    im.addEventListener("error", () => im.replaceWith(thumbPlaceholder()));
    return im;
  }

  let planner, allRecipes = [], selected = new Set(), currentWeek = null, shopDone = new Set(), saved = [];
  let settings = { target: 1550, protein: 90 };
  const TARGET_OPTS = [1400, 1550, 1700, 1850, 2000];
  const PROTEIN_OPTS = [90, 110, 130];

  // recept-böngésző kategóriaszűrői (minden recept elérhető, nem csak a főételek)
  const mt = (r) => r.meal_type || [];
  const FILTERS = [
    { key: "main", label: "Főételek", test: (r) => planner.isMainDish(r) },
    { key: "reggeli", label: "Reggeli", test: (r) => mt(r).includes("reggeli") },
    { key: "sweet", label: "Édes / desszert", test: (r) => r.flavor === "sweet" },
    { key: "leves", label: "Leves", test: (r) => (r.tags || []).includes("leves") },
    { key: "snack", label: "Snack / nasi", test: (r) => mt(r).includes("snack") },
    { key: "all", label: "Mind", test: () => true },
  ];
  let currentFilter = "main";
  const currentList = () => {
    const f = FILTERS.find((x) => x.key === currentFilter) || FILTERS[0];
    return allRecipes.filter(f.test);
  };

  // ---- betöltés ----
  fetch("data.json").then((r) => r.json()).then((data) => {
    planner = new Planner(data);
    allRecipes = planner.recipes
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "hu"));
    restore();
    applySettings();
    renderCatFilter();
    renderDishList("");
    if (currentWeek) renderWeek(currentWeek);
    renderShop();
  }).catch((e) => { $("#dish-list").innerHTML = "<li class='empty'>Nem sikerült betölteni az adatokat.</li>"; console.error(e); });

  function renderCatFilter() {
    const box = $("#cat-filter");
    if (!box) return;
    box.innerHTML = "";
    for (const f of FILTERS) {
      const n = allRecipes.filter(f.test).length;
      const b = el("button", "cat-btn" + (f.key === currentFilter ? " active" : ""));
      b.innerHTML = `${f.label} <span class="cat-count">${n}</span>`;
      b.addEventListener("click", () => {
        currentFilter = f.key;
        renderCatFilter();
        renderDishList($("#search").value);
      });
      box.appendChild(b);
    }
  }

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
    const items = currentList().filter((r) => !ql || r.name.toLowerCase().includes(ql));
    const cnt = $("#dish-count");
    if (cnt) cnt.textContent = items.length
      ? `${items.length} recept${ql ? " a keresésre" : ""}`
      : "";
    if (!items.length) { list.appendChild(el("li", "empty", "Nincs találat.")); return; }
    for (const r of items) {
      const li = el("li", "dish-item" + (selected.has(r.name) ? " sel" : ""));
      li.appendChild(thumb(r));
      li.appendChild(el("div", "check", selected.has(r.name) ? "✓" : ""));
      const main = el("div", "dish-main");
      main.appendChild(el("div", "dish-name", r.name));
      main.appendChild(el("div", "dish-meta", `${Math.round(r.macros.kcal)} kcal · ${Math.round(r.macros.p)} g fehérje`));
      li.appendChild(main);
      const info = el("button", "dish-info info", "i");
      info.title = "Részletek, makrók, hozzávalók";
      info.setAttribute("aria-label", "Részletek megnyitása");
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
      right.innerHTML = `<b>${Math.round(day.macros.kcal)}</b> kcal<br>` +
        `<span class="day-macros-sub">F ${Math.round(day.macros.p)} · Zs ${Math.round(day.macros.f)} · Sz ${Math.round(day.macros.c)} g</span>`;
      head.append(left, right);
      head.addEventListener("click", () => card.classList.toggle("open"));
      card.appendChild(head);

      const meals = el("div", "day-meals");
      for (let mealIdx = 0; mealIdx < day.plan.length; mealIdx++) {
        const m = day.plan[mealIdx];
        const row = el("div", "meal" + (m.type === "KORREKCIÓ" ? " corr" : ""));
        const l = el("div", "meal-left");
        l.appendChild(el("div", "meal-type", m.type));
        l.appendChild(el("div", "meal-name", m.recipe ? m.recipe.name : (m.note || "—")));
        row.appendChild(l);
        if (m.recipe) {
          row.appendChild(el("div", "meal-kcal", `${Math.round(m.recipe.macros.kcal)} kcal`));
          const actions = el("div", "meal-actions");
          const viewBtn = el("button", "meal-btn", "👁");
          viewBtn.title = "Megtekintés";
          viewBtn.addEventListener("click", (e) => { e.stopPropagation(); showMeal(m.recipe); });
          const swapBtn = el("button", "meal-btn", "🔄");
          swapBtn.title = "Csere";
          swapBtn.addEventListener("click", (e) => { e.stopPropagation(); showSwapDialog(i, mealIdx, day); });
          actions.append(viewBtn, swapBtn);
          row.appendChild(actions);
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
      li.appendChild(thumb(recipe));
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
  // strukturált {n,a,u} hozzávalók, vagy ha üres, a nyers szöveges lista (ing_raw)
  const ingsOf = (r) => (r.ing && r.ing.length) ? r.ing : (r.ing_raw || []);
  const metaOf = (r) => ({ servings: r.servings, wholeBatch: !!r.ing_whole, img: r.img, stock: !!r.img_stock });
  function showRecipe(r) { renderModal(r.name, r.macros, ingsOf(r), r.prep, metaOf(r)); }
  function showMeal(recipe) {
    // az étkezés saját (skálázott) hozzávalói; prep/servings a mesterreceptből
    const master = planner.byId.get(recipe.id) || recipe;
    const prep = recipe.prep || master.prep || "";
    renderModal(recipe.name, recipe.macros, ingsOf(recipe), prep, metaOf(master));
  }

  function showSwapDialog(dayIdx, mealIdx, day) {
    const m = day.plan[mealIdx];
    if (!m.recipe) return;

    // Milyen meal_type-ú ételek kerülhetnek ide?
    const allowed = planner.recipes.filter((r) =>
      (r.meal_type || []).some((t) => (m.type || "").toLowerCase().replace("ó", "o") === t)
    ).sort((a, b) => a.name.localeCompare(b.name, "hu"));

    const modal = el("div", "modal hidden");
    const card = el("div", "modal-card");
    const close = el("button", "modal-close", "✕");
    close.addEventListener("click", () => modal.remove());
    card.appendChild(close);

    const title = el("h2", null, `Csere: ${m.type}`);
    card.appendChild(title);

    const list = el("ul", "swap-list");
    for (const r of allowed) {
      const li = el("li", "swap-item");
      li.appendChild(thumb(r));
      const main = el("div", "swap-main");
      main.appendChild(el("div", "dish-name", r.name));
      main.appendChild(el("div", "dish-meta", `${Math.round((r.macros || {}).kcal || 0)} kcal`));
      li.appendChild(main);
      li.addEventListener("click", () => {
        day.plan[mealIdx].recipe = planner.mealRecipe(r, false);
        currentWeek[dayIdx] = day;
        persist();
        renderWeek(currentWeek);
        renderShop();
        modal.remove();
        toast(`${m.type} lecserélve: ${r.name}`);
      });
      list.appendChild(li);
    }
    card.appendChild(list);
    modal.appendChild(card);
    modal.classList.remove("hidden");
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  }
  function renderModal(name, macros, ings, prep, meta = {}, multiplier = 1) {
    const body = $("#modal-body");
    body.className = "modal-body";
    body.innerHTML = "";
    if (meta.img) {
      const hero = el("img", "recipe-hero");
      hero.src = meta.img; hero.alt = name; hero.loading = "lazy"; hero.decoding = "async";
      const stockCap = meta.stock ? el("p", "hero-stock", "📷 illusztráció – nem a recept saját fotója") : null;
      hero.addEventListener("error", () => { hero.remove(); if (stockCap) stockCap.remove(); });
      body.appendChild(hero);
      if (stockCap) body.appendChild(stockCap);
    }
    body.appendChild(el("h2", null, name));

    // Adagszorzó
    const multRow = el("div", "mult-row");
    const multLabel = el("label", null, "Hány adagot főzök?");
    const multInput = el("input", "mult-input");
    multInput.type = "number";
    multInput.min = "0.5";
    multInput.step = "0.5";
    multInput.value = multiplier;
    multRow.appendChild(multLabel);
    multRow.appendChild(multInput);
    body.appendChild(multRow);

    // Makrók (szorzóval)
    const scaledMacros = multiplier !== 1 ? {
      kcal: macros.kcal * multiplier,
      p: macros.p * multiplier,
      f: macros.f * multiplier,
      c: macros.c * multiplier
    } : macros;

    const mr = el("div", "macro-row");
    const pill = (lab, val) => { const p = el("div", "macro-pill"); p.innerHTML = `<b>${val}</b>${lab}`; return p; };
    mr.append(pill("kcal", Math.round(scaledMacros.kcal)), pill("g fehérje", Math.round(scaledMacros.p)),
      pill("g zsír", Math.round(scaledMacros.f)), pill("g szénh.", Math.round(scaledMacros.c)));
    body.appendChild(mr);
    // A makrók MINDIG egy adagra vonatkoznak – egyértelműen jelezzük.
    const noteText = multiplier !== 1
      ? `▲ A fenti kalória és makrók ${multiplier}x ${multiplier === 1 ? "1 adag" : multiplier + " adag"}-ra szólnak`
      : "▲ A fenti kalória és makrók 1 adagra szólnak";
    body.appendChild(el("p", "macro-note", noteText));
    body.appendChild(macroBar(scaledMacros));

    // Szorzó onChange
    multInput.addEventListener("input", () => {
      const newMult = parseFloat(multInput.value) || 1;
      if (newMult > 0 && newMult !== multiplier) {
        renderModal(name, macros, ings, prep, meta, newMult);
      }
    });

    const sv = meta.servings;
    let ingHead = "Hozzávalók";
    if (meta.wholeBatch && sv) ingHead = `Hozzávalók – a TELJES recepthez (${sv} adag)`;
    else if (sv && sv > 1) ingHead = "Hozzávalók – 1 adagra";
    const headRow = el("div", "sec-head");
    headRow.appendChild(el("h3", "sec-title", ingHead));
    const copyBtn = el("button", "copy-btn", "⧉ Másol");
    copyBtn.addEventListener("click", () => {
      const text = ings.map((x) => typeof x === "string" ? x : `${cap(x.n)} – ${x.a} ${x.u}`).join("\n");
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast("Hozzávalók másolva ✓")).catch(() => {});
    });
    headRow.appendChild(copyBtn);
    body.appendChild(headRow);
    if (sv && sv > 1) {
      const note = meta.wholeBatch
        ? `Ez a recept ${sv} adagból áll. Az alábbi mennyiségek a TELJES receptre vonatkoznak – a fenti makró 1 adagra szól (oszd el ${sv} felé).`
        : `Ez a recept ${sv} adagból áll. Az alábbi mennyiségek és a fenti makrók 1 adagra vannak megadva.`;
      body.appendChild(el("p", "ing-note", note));
    }
    const ul = el("ul", "ing-list");
    for (const ing of ings) {
      const li = el("li");
      if (typeof ing === "string") {
        // nyers szöveges hozzávaló (ing_raw): a mennyiség a szövegben van
        li.appendChild(el("span", null, cap(ing)));
      } else {
        li.appendChild(el("span", null, cap(ing.n)));
        const scaledAmount = (ing.a * multiplier).toFixed(1).replace(/\.0$/, "");
        li.appendChild(el("span", "ing-amt", `${scaledAmount} ${ing.u}`));
      }
      ul.appendChild(li);
    }
    body.appendChild(ul);

    if (prep && prep.trim()) {
      const prepHead = el("div", "prep-head");
      prepHead.appendChild(el("h3", "sec-title", "Elkészítés"));

      let cleanPrep = prep;
      const isAiGen = prep.startsWith("[AI generált]");
      if (isAiGen) {
        const badge = el("span", "ai-badge", "🤖 AI");
        badge.title = "Mesterséges intelligenciával generált leírás";
        prepHead.appendChild(badge);
        cleanPrep = prep.replace(/^\[AI generált\]:\s*/, "");
      }
      body.appendChild(prepHead);
      body.appendChild(el("p", "prep-text", cleanPrep));
    }
    $("#modal").classList.remove("hidden");
    const card = $(".modal-card"); if (card) card.scrollTop = 0;   // mindig a tetejéről nyíljon
  }
  // makró-arány sáv (fehérje / zsír / szénhidrát kalória-megoszlása)
  function macroBar(m) {
    const pk = 4 * (m.p || 0), fk = 9 * (m.f || 0), ck = 4 * (m.c || 0);
    const tot = pk + fk + ck || 1;
    const wrap = el("div", "macrobar-wrap");
    const bar = el("div", "macrobar");
    const seg = (cls, v) => { const s = el("div", "mb-" + cls); s.style.width = (v / tot * 100) + "%"; return s; };
    bar.append(seg("p", pk), seg("f", fk), seg("c", ck));
    wrap.appendChild(bar);
    const leg = el("div", "macrobar-leg");
    const it = (cls, lab, v) => { const d = el("div", "mb-leg-item"); d.innerHTML = `<i class="mb-dot mb-${cls}"></i>${lab} ${Math.round(v / tot * 100)}%`; return d; };
    leg.append(it("p", "Fehérje", pk), it("f", "Zsír", fk), it("c", "Szénh.", ck));
    wrap.appendChild(leg);
    return wrap;
  }
  function closeModal() { $("#modal").classList.add("hidden"); }
  $("#modal-close").addEventListener("click", closeModal);
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

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

    // újrahasznosítható csúszka + beíró mező (szinkronban), élő jegyzettel
    const makeSlider = (label, key, min, max, step, noteFn) => {
      const g = el("div", "set-group");
      g.appendChild(el("div", "set-label", label));
      const row = el("div", "slider-row");
      const num = document.createElement("input");
      num.type = "number"; num.className = "set-num";
      num.min = min; num.max = max; num.step = step; num.value = settings[key];
      const sl = document.createElement("input");
      sl.type = "range"; sl.className = "set-slider";
      sl.min = min; sl.max = max; sl.step = step; sl.value = settings[key];
      const note = el("div", "set-note", "");
      const clamp = (v) => Math.max(min, Math.min(max, Math.round(v / step) * step)) || min;
      const refreshNote = () => { if (noteFn) note.textContent = noteFn(settings[key]); };
      const set = (v, both) => {
        settings[key] = clamp(v);
        sl.value = settings[key];
        if (both) num.value = settings[key];
        refreshNote(); persist(); applySettings();
      };
      sl.addEventListener("input", () => { num.value = sl.value; settings[key] = clamp(+sl.value); refreshNote(); });
      sl.addEventListener("change", () => set(+sl.value, true));
      num.addEventListener("change", () => set(+num.value, true));
      row.append(sl, num);
      g.append(row);
      refreshNote();
      if (noteFn) g.append(note);
      body.appendChild(g);
    };
    makeSlider("Napi kalória-cél (kcal)", "target", 1200, 3000, 10,
      (v) => `Egy nap ${v - 50}–${v + 50} kcal között lesz.`);
    makeSlider("Fehérje minimum / nap (g)", "protein", 60, 300, 5,
      (v) => `Legalább ${v} g fehérje naponta (több lehet). Bulkinghoz pl. 200–250 g.`);

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
