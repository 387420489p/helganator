/* Helganator – tervező motor (a diet_planner.py JS-portja).
 * Elv: a recept TÁROLT makrója az igazság; csak a hozzáadott elemek
 * (köret rizs+olaj, fehérje-/kalóriakorrekció) deltáját számoljuk.
 */
(function (global) {
  "use strict";

  const CARB_TAGS = ["rizs", "tészta", "krumpli", "burgonya", "tortilla",
    "pita", "bulgur", "quinoa", "kuszkusz", "köles", "spagetti", "édesburgonya"];

  // Édesség/desszert/snack jelek: ezek NEM főételek, és nem kapnak köretet (rizs+olaj).
  const DESSERT_TAGS = new Set(["édesség", "desszert", "édes", "gyümölcs", "puding",
    "zabkása", "zab", "chia", "süti", "snack", "palacsinta"]);

  const UNIT_G = { g: 1, dkg: 10, kg: 1000, ml: 1, dl: 100, l: 1000,
    ek: 15, tk: 5, kk: 5, csipet: 0.5, gerezd: 5, fej: 100,
    marék: 25, csokor: 30, szelet: 20, "szál": 15, adag: 100 };

  // Bevásárlólista: ezek darabban maradnak, minden más grammra megy.
  const SHOP_COUNTABLE = new Set(["tojás", "főtt tojás", "lágytojás", "finn crisp",
    "korpovit keksz", "gullón csokis digestive keksz", "gullón cukormentes",
    "light virsli", "melvit lapkenyér", "wasa fibre", "tk tortilla",
    "teljes kiőrlésű tortilla", "tk pita", "olívabogyó", "abonett"]);
  const SHOP_ALIAS = { "teljes kiőrlésű kenyér": "tk kenyér",
    "közepes paradicsom": "paradicsom", "finn crisp original": "finn crisp",
    "egész csirkecomb": "csirkecomb" };

  const r1 = (x) => Math.round(x * 10) / 10;

  class Planner {
    constructor(data) {
      this.recipes = data.recipes;
      this.templates = data.templates;
      this.ingredients = data.ingredients;
      this.cfg = data.config;
      this.byId = new Map(this.recipes.map((r) => [r.id, r]));
      this.byName = new Map(this.recipes.map((r) => [r.name.toLowerCase(), r]));
    }

    norm(name) {
      let n = name.toLowerCase();
      if (n === "tk") n = "tk kenyér";
      if (n.includes("csirkemell") && !n.includes("sonka")) n = "csirkemell";
      return n;
    }

    macrosOf(ings) {
      const t = { kcal: 0, p: 0, f: 0, c: 0 };
      for (const ing of ings) {
        const idat = this.ingredients[this.norm(ing.n)];
        if (!idat) continue;
        let g;
        if (ing.u === "db") g = ing.a * (idat.unit_weight || 50);
        else if (["ek", "tk", "kk", "dl"].includes(ing.u) && idat.unit_weight)
          g = ing.a * idat.unit_weight;
        else g = ing.a * (UNIT_G[ing.u] || 1);
        const f = g / 100;
        t.kcal += idat.kcal * f; t.p += idat.p * f;
        t.f += idat.f * f; t.c += idat.c * f;
      }
      return t;
    }

    add(a, b) { return { kcal: a.kcal + b.kcal, p: a.p + b.p, f: a.f + b.f, c: a.c + b.c }; }
    round(m) { return { kcal: r1(m.kcal), p: r1(m.p), f: r1(m.f), c: r1(m.c) }; }

    // Édes/desszert/snack étel-e (nem főétel, nem kap köretet).
    isSweet(recipe) {
      if (recipe.flavor === "sweet") return true;
      return (recipe.tags || []).some((t) => DESSERT_TAGS.has(t.toLowerCase()));
    }

    needsSide(recipe) {
      if (this.isSweet(recipe)) return false;   // édeshez sosem rizs+olaj
      const hay = ((recipe.tags || []).join(" ") + " " + recipe.name + " " +
        (recipe.ing || []).map((i) => i.n).join(" ")).toLowerCase();
      return !CARB_TAGS.some((c) => hay.includes(c));
    }

    mealRecipe(recipe, addSide) {
      let ings = JSON.parse(JSON.stringify(recipe.ing || []));
      let macros = Object.assign({}, recipe.macros);
      if (addSide && this.needsSide(recipe)) {
        const side = [{ n: "rizs (jázmin, basmati, barna)", a: 55, u: "g" }, { n: "olívaolaj", a: 10, u: "g" }];
        ings = ings.concat(side);
        macros = this.add(macros, this.macrosOf(side));
      }
      return { name: recipe.name, id: recipe.id, ing: ings, macros: this.round(macros), prep: recipe.prep || "" };
    }

    generateDay(template, forcedId) {
      const plan = [];
      let chosenMain = null;
      for (const mt of template.meals) {
        const slot = mt.name || mt.type;
        const item = { type: slot };
        const isKollyMain = mt.name === "3. étkezés" || mt.name === "4. étkezés";
        let ref = null;
        if (mt.options && mt.options.length) {
          if (mt.name === "4. étkezés" && chosenMain) ref = chosenMain;
          else if (forcedId && isKollyMain) ref = this.byId.get(forcedId);
          else ref = this.byId.get(mt.options[(Math.random() * mt.options.length) | 0]);
          if (mt.name === "3. étkezés") chosenMain = ref;
          item.recipe = this.mealRecipe(ref, isKollyMain);
        } else if (mt.dish_name) {
          ref = this.byName.get(mt.dish_name.toLowerCase());
          if (ref) item.recipe = this.mealRecipe(ref, false);
          else item.note = mt.dish_name;
        } else {
          item.note = mt.note || "Nincs adat";
        }
        plan.push(item);
      }
      let total = { kcal: 0, p: 0, f: 0, c: 0 };
      for (const m of plan) if (m.recipe) total = this.add(total, m.recipe.macros);
      return { day: template.day, source: template.source, plan, macros: this.round(total) };
    }

    recalcTotal(day) {
      let t = { kcal: 0, p: 0, f: 0, c: 0 };
      for (const m of day.plan) if (m.recipe) t = this.add(t, m.recipe.macros);
      day.macros = this.round(t);
    }

    addCorrection(day, name, ing) {
      day.plan.push({ type: "KORREKCIÓ",
        recipe: { name, ing, macros: this.round(this.macrosOf(ing)) } });
    }

    scaleFood(day, targetKcal) {
      let foodKcal = 0;
      for (const m of day.plan)
        if (m.recipe && m.type !== "KORREKCIÓ") foodKcal += m.recipe.macros.kcal;
      if (foodKcal <= 0) return;
      const ratio = targetKcal / foodKcal;
      for (const m of day.plan) {
        if (!m.recipe || m.type === "KORREKCIÓ") continue;
        for (const ing of m.recipe.ing)
          if (ing.u === "g" || ing.u === "ml") ing.a = r1(ing.a * ratio);
        const mm = m.recipe.macros;
        m.recipe.macros = { kcal: r1(mm.kcal * ratio), p: r1(mm.p * ratio),
          f: r1(mm.f * ratio), c: r1(mm.c * ratio) };
      }
      this.recalcTotal(day);
    }

    // Beállítható kalória-cél / fehérje-minimum. A sáv mindig cél ±50.
    setConfig(over) {
      const t = over.kcal_target || this.cfg.kcal_target;
      this.cfg = Object.assign({}, this.cfg, over, {
        kcal_target: t,
        kcal_min: t - 50,
        kcal_max: t + 50,
        protein_min: over.protein_min || this.cfg.protein_min,
      });
    }

    // A hozzávalók g/ml mennyiségét EGÉSZ grammra kerekíti, és a makrót a tényleges
    // (kerekített) tömeghez igazítja -> nincs tizedes adag, és a kcal hitelesen ingadozik.
    roundAmounts(day) {
      for (const m of day.plan) {
        if (!m.recipe) continue;
        let oldG = 0, newG = 0;
        for (const ing of m.recipe.ing)
          if (ing.u === "g" || ing.u === "ml") oldG += ing.a;
        for (const ing of m.recipe.ing)
          if (ing.u === "g" || ing.u === "ml") {
            ing.a = Math.max(1, Math.round(ing.a)); newG += ing.a;
          }
        if (oldG > 0) {
          const k = newG / oldG, mm = m.recipe.macros;
          m.recipe.macros = { kcal: r1(mm.kcal * k), p: r1(mm.p * k),
            f: r1(mm.f * k), c: r1(mm.c * k) };
        }
      }
      this.recalcTotal(day);
    }

    // A napot a sávon belüli, kissé VÉLETLEN cél köré méretezzük (hogy ne legyen
    // minden nap pontosan ugyanannyi), a fehérjeport együtt megoldva, majd a
    // mennyiségeket egész grammra kerekítjük.
    correctDay(day) {
      const T0 = this.cfg.kcal_target, MIN = this.cfg.kcal_min,
        MAX = this.cfg.kcal_max, PMIN = this.cfg.protein_min;
      // napi cél kis véletlen eltolással (a sávon belül marad a kerekítés után is)
      const T = T0 + Math.round((Math.random() * 2 - 1) * 38);
      const pw = this.ingredients["fehérjepor"];
      const pk = pw.kcal / 100, pp = pw.p / 100;
      const fk = day.macros.kcal, fp = day.macros.p;
      const SMIN = 0.25, SMAX = 2.5;
      const PBUF = PMIN + 2;   // puffer: a kerekítés után is >= minimum maradjon
      const finalKcal = (s) => {
        const powder = Math.max(0, (PBUF - s * fp) / pp);
        return [s * fk + pk * powder, powder];
      };
      let s;
      if (finalKcal(SMIN)[0] >= T) s = SMIN;
      else if (finalKcal(SMAX)[0] <= T) s = SMAX;
      else {
        let lo = SMIN, hi = SMAX;
        for (let i = 0; i < 44; i++) {
          const mid = (lo + hi) / 2;
          if (finalKcal(mid)[0] <= T) lo = mid; else hi = mid;
        }
        s = lo;
      }
      // fehérjepor felfelé kerekítve, hogy a kerekítés után is >= minimum maradjon
      const powderG = Math.ceil(finalKcal(s)[1]);

      if (Math.abs(s - 1) > 0.001) this.scaleFood(day, s * fk);
      if (powderG > 0) {
        this.addCorrection(day, "Extra fehérje (shake)",
          [{ n: "fehérjepor", a: powderG, u: "g" }]);
        this.recalcTotal(day);
      }
      this.roundAmounts(day);

      // záró fehérje-biztosíték (ha a kerekítés mégis 90 alá vitte)
      if (day.macros.p < PMIN) {
        const add = Math.ceil((PMIN - day.macros.p) / pp);
        const corr = day.plan.find((m) => m.type === "KORREKCIÓ" && /fehérje/i.test(m.recipe.name));
        if (corr) { corr.recipe.ing[0].a += add; corr.recipe.macros = this.round(this.macrosOf(corr.recipe.ing)); }
        else this.addCorrection(day, "Extra fehérje (shake)", [{ n: "fehérjepor", a: add, u: "g" }]);
        this.recalcTotal(day);
      }

      // biztonsági korlátok (ritka szélső esetek): a sávba húzás
      if (day.macros.kcal > MAX) {
        const powderKcal = day.plan.filter((m) => m.type === "KORREKCIÓ")
          .reduce((a, m) => a + m.recipe.macros.kcal, 0);
        this.scaleFood(day, MAX - powderKcal);
        this.roundAmounts(day);
      } else if (day.macros.kcal < MIN) {
        const amt = Math.round((MIN - day.macros.kcal) / this.ingredients["olívaolaj"].kcal * 100);
        this.addCorrection(day, "Kalória korrekció (olaj)",
          [{ n: "olívaolaj", a: Math.max(1, amt), u: "g" }]);
        this.recalcTotal(day);
      }
      return day;
    }

    kollyIndices() {
      const out = [];
      this.templates.forEach((t, i) => { if (t.source.includes("Kolly")) out.push(i); });
      return out;
    }

    findHost(recipe) {
      const rid = recipe.id, rname = recipe.name.toLowerCase();
      for (let i = 0; i < this.templates.length; i++) {
        const t = this.templates[i];
        if (t.source.includes("Gyerünk") &&
          t.meals.some((m) => (m.dish_name || "").toLowerCase() === rname))
          return [i, null];
      }
      for (let i = 0; i < this.templates.length; i++) {
        const t = this.templates[i];
        if (t.source.includes("Kolly") &&
          t.meals.some((m) => (m.options || []).includes(rid)))
          return [i, rid];
      }
      return null;
    }

    planWeek(requestedNames) {
      const week = [], used = new Set();
      const pick = (arr) => arr[(Math.random() * arr.length) | 0];

      for (const name of requestedNames || []) {
        const r = this.byName.get(name.toLowerCase());
        if (!r) continue;
        const host = this.findHost(r);
        let idx, forced;
        if (host && !used.has(host[0])) { idx = host[0]; forced = host[1]; }
        else {
          let free = this.kollyIndices().filter((i) => !used.has(i));
          if (!free.length) free = this.kollyIndices();
          idx = pick(free); forced = r.id;
        }
        week.push(this.correctDay(this.generateDay(this.templates[idx], forced)));
        used.add(idx);
        if (week.length >= 7) break;
      }
      while (week.length < 7) {
        let free = [];
        for (let i = 0; i < this.templates.length; i++) if (!used.has(i)) free.push(i);
        if (!free.length) free = this.kollyIndices();
        const idx = pick(free);
        week.push(this.correctDay(this.generateDay(this.templates[idx])));
        used.add(idx);
      }
      return week.slice(0, 7);
    }

    grams(ing) {
      const idat = this.ingredients[this.norm(ing.n)] || {};
      if (ing.u === "db") return ing.a * (idat.unit_weight || 50);
      if (["ek", "tk", "kk", "dl"].includes(ing.u) && idat.unit_weight)
        return ing.a * idat.unit_weight;
      return ing.a * (UNIT_G[ing.u] || 1);
    }

    // Összevont bevásárlólista: súlyok grammban, darabos tételek db-ben,
    // variáns nevek (kenyér stb.) egy tételbe vonva.
    shoppingList(week) {
      const grams = new Map(), pieces = new Map();
      for (const day of week)
        for (const m of day.plan) {
          if (!m.recipe) continue;
          for (const ing of m.recipe.ing) {
            let n = this.norm(ing.n); n = SHOP_ALIAS[n] || n;
            grams.set(n, (grams.get(n) || 0) + this.grams(ing));
            if (ing.u === "db") pieces.set(n, (pieces.get(n) || 0) + ing.a);
          }
        }
      const names = [...new Set([...grams.keys(), ...pieces.keys()])]
        .sort((a, b) => a.localeCompare(b, "hu"));
      return names.map((n) => {
        const uw = (this.ingredients[n] || {}).unit_weight;
        if (SHOP_COUNTABLE.has(n)) {
          const amt = uw ? Math.round(grams.get(n) / uw) : Math.round(pieces.get(n) || 0);
          return { item: n, amount: Math.max(amt, 1), unit: "db" };
        }
        return { item: n, amount: r1(grams.get(n) || 0), unit: "g" };
      });
    }

    // Heti terv szöveges (.txt) formában – mentéshez/megosztáshoz.
    toText(week) {
      let out = "HETI ÉTREND\n" + "=".repeat(60) + "\n\n";
      week.forEach((day, i) => {
        out += `${i + 1}. NAP\n` + "-".repeat(50) + "\n";
        for (const m of day.plan) {
          if (m.recipe) {
            const mc = m.recipe.macros;
            out += `[${m.type.toUpperCase()}] ${m.recipe.name} (${Math.round(mc.kcal)} kcal)\n`;
            out += `   P ${mc.p}g | F ${mc.f}g | C ${mc.c}g\n`;
            out += "   Hozzávalók: " + m.recipe.ing.map((i) => `${i.a}${i.u} ${i.n}`).join(", ") + "\n";
          } else out += `[${m.type.toUpperCase()}] ${m.note || "Nincs adat"}\n`;
        }
        const dm = day.macros;
        out += `\nNAPI ÖSSZESEN: ${Math.round(dm.kcal)} kcal | Fehérje ${Math.round(dm.p)} g | ` +
          `Zsír ${Math.round(dm.f)} g | Szénhidrát ${Math.round(dm.c)} g\n` + "~".repeat(60) + "\n\n";
      });
      out += "\nHETI BEVÁSÁRLÓLISTA\n" + "=".repeat(60) + "\n";
      for (const { item, amount, unit } of this.shoppingList(week)) out += `- ${item}: ${amount} ${unit}\n`;
      return out;
    }

    // "Mit főzzek?" – mely receptek készíthetők a megadott alapanyagokból.
    cookable(haveNames) {
      const have = haveNames.map((s) => s.trim().toLowerCase()).filter(Boolean);
      const hasIng = (n) => {
        const nn = this.norm(n);
        return have.some((h) => nn.includes(h) || h.includes(nn));
      };
      // alap fűszerek, amiket "mindenki otthon tart" – nem számítanak hiányként
      const PANTRY = ["só", "bors", "fűszer", "olaj", "víz", "ecet", "paprika",
        "fokhagyma", "édesítő", "sütőpor", "aroma", "fahéj"];
      const isPantry = (n) => PANTRY.some((p) => n.toLowerCase().includes(p));
      const res = [];
      for (const r of this.recipes) {
        const ings = r.ing || [];
        if (!ings.length) continue;
        const missing = ings.filter((i) => !hasIng(i.n) && !isPantry(i.n)).map((i) => i.n);
        const core = ings.filter((i) => !isPantry(i.n)).length || 1;
        res.push({ recipe: r, missing, matchRatio: 1 - missing.length / core });
      }
      return res.filter((x) => x.matchRatio > 0)
        .sort((a, b) => b.matchRatio - a.matchRatio || a.missing.length - b.missing.length);
    }
  }

  global.Planner = Planner;
})(typeof window !== "undefined" ? window : globalThis);
