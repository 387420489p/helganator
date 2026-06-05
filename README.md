# Helganator – telefonos webapp (PWA)

Heti étrendtervező böngészőben, telefonra telepíthető. Offline is működik.

## Funkciók
- **Tervező:** kereshető étellista, ételek kipipálása, „Heti terv készítése" → 7 napos terv napkártyákban, makrókkal. Minden nap 1450–1650 kcal és ≥90 g fehérje.
- **Lista:** a heti tervhez tartozó **összevont** bevásárlólista (súlyok grammban, darabos tételek db-ben, a variáns nevek egy tételbe vonva), boltban kipipálható tételekkel.
- **Mentett:** heti menü mentése névvel/dátummal, korábbi hetek visszatöltése vagy törlése – semmi nem vész el (a böngésző tárolójában marad).
- **Mit főzzek:** beírod az otthoni alapanyagokat, kilistázza mit lehet főzni (és mi hiányzik).
- **Recept-részlet:** bármely ételre koppintva makrók + hozzávalók + **elkészítési leírás**.
- **Megosztás:** a heti terv `.txt`-ként megosztható vagy letölthető.

A heti terv, a bevásárlólista pipái és a mentett hetek a telefonon maradnak
(localStorage), így újranyitásnál sem vesznek el.

## Helyi futtatás (gépen kipróbálni)
```bash
cd webapp
python3 -m http.server 8137
# böngészőben: http://localhost:8137
```

## Telepítés telefonra (PWA)
A PWA-hoz HTTPS (vagy localhost) kell. Két egyszerű ingyenes út:

**A) GitHub Pages**
1. Töltsd fel a `webapp/` tartalmát egy GitHub repo-ba.
2. Settings → Pages → forrás: a repo `main` ága, mappa `/`.
3. A kapott `https://…github.io/…` linket nyisd meg a telefon böngészőjében.
4. Android/Chrome: menü (⋮) → „Alkalmazás telepítése" / „Hozzáadás a kezdőképernyőhöz".

**B) Netlify (drag & drop)**
1. netlify.com → „Add new site" → húzd be a `webapp/` mappát.
2. A kapott linket nyisd meg telefonon, és telepítsd ugyanígy.

Telepítés után az ikonról teljes képernyőn indul, és internet nélkül is megy.

## Adat frissítése
Ha az adatbázis (`../database/`) változik:
```bash
python3 ../src/build_prep.py --write   # elkészítési leírások (ha forrás változott)
python3 ../src/build_webdata.py        # újragyártja a webapp/data.json-t
```
A service worker verzióját (`sw.js` `CACHE = "helganator-vN"`) emeld eggyel,
hogy a telefon az új adatot töltse.

## Fájlok
```
index.html              # felület váza
app.css                 # stílus (mobil-first)
app.js                  # UI logika
planner.js              # tervező motor (a diet_planner.py JS-portja)
data.json               # receptek + sablonok + alapanyagok (generált)
manifest.webmanifest    # PWA manifeszt
sw.js                   # service worker (offline cache)
icons/                  # app-ikonok (192/512/maskable)
```
