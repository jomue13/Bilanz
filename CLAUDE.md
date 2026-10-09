# Bilanz – Offline-App

Persönliche Tracker-App (Training, Essen, Körper, Arbeit/Lohn, Geld, Uni, Fotos …) als installierbare Web-App für das iPhone. Ausgeliefert über GitHub Pages: https://jomue13.github.io/Bilanz/

## Aufbau
- `index.html`: die komplette App (HTML, CSS, JS in einer Datei, inkl. Lebensmittel-Datenbank). Hier werden Änderungen gemacht.
- `local.js`: lokaler Speicher (IndexedDB) mit der Schnittstelle `window.claude.use('db' | 'user' | 'downloads')`. Lädt außerdem Wetter (Open-Meteo) und `sports.json`.
- `sw.js`: Service Worker, hält alle Dateien offline vor (cache-first). `VERSION` muss sich bei jeder Änderung ändern.
- `sports.json`: Spielplan und Tabellen, wird wöchentlich von einer geplanten Aufgabe aktualisiert (network-first, braucht keine neue Version).
- `fonts/`, `vendor/xlsx.full.min.js`, `vendor/zxing.min.js` (Barcode-Scanner, wird erst beim Scannen geladen), Icons, `manifest.webmanifest`.

## Änderungen ausrollen
1. Änderung in `index.html` (oder `local.js`) machen.
2. Testen, am besten mit Playwright im iPhone-Format (390×844), auch offline (`context.set_offline(True)` und neu laden).
3. `python3 tools/release.py` ausführen. Ohne neue `VERSION` in `sw.js` bekommt das iPhone die Änderung nie.
4. Committen und auf beide Zweige pushen: `git push origin HEAD:main HEAD:gh-pages`. Die Seite wird von `gh-pages` ausgeliefert.
5. Auf dem iPhone holt sich die App die neue Version beim nächsten Öffnen mit Internet und lädt sich einmal neu.

## Daten
- Alle Nutzerdaten liegen nur auf dem Gerät (IndexedDB `bilanz`, Store `docs`, Schlüssel `data/users/local/<pfad>`), nie im Repository.
- Datenformat nicht brechen: bestehende Felder weiter lesen können. Backup-Format: `{app:'bilanz', v:1, exported_at, docs:{<pfad>: daten}}`.
- Fotos sind mit Passwort verschlüsselt (PBKDF2 + AES-GCM); daran nichts ändern, was alte Fotos unlesbar macht.

## Daten für den Nutzer vorbereiten
Claude kommt nicht an die Daten auf dem iPhone. Neue Pläne o. Ä. als Ergänzungsdatei schicken, die der Nutzer unter Einstellungen → Backup einspielen übernimmt, ohne dass andere Daten ersetzt werden:
`{"app":"bilanz","v":1,"kind":"ergaenzung","title":"…","plans":[{"name":"…","loc":"gym|zuhause","ex":[{"name":"…","sets":3,"rest":90}]}],"weekVars":{"4":[{"p":"Planname","alt":"Ersatzplan","add":[{"name":"…","sets":3}]}]},"weekVarNotes":{"4":"…"}}`
Übungsnamen genau so schreiben wie in den bestehenden Plänen, sonst fehlt der Verlauf.
Rezepte gehen genauso: `"recipes":[{"name":"…","por":4,"items":["500 g Rinderhack","250 g Reis","2 Paprika"],"steps":["…"]}]`. Die Zutaten werden mit der Lebensmittel-Datenbank abgeglichen, Mengen in g, ml, EL, TL oder Stück.

## Wichtig
- Das Repository ist öffentlich. Keine persönlichen Daten in Code, Texte oder Beispiele schreiben (Name, Wohnort, Arbeitgeber, Studiengang, Prüfungen, Finanzen, Gesundheit). Persönliche Einstellungen kommen aus den Daten auf dem Gerät.
- Oberfläche und Texte auf Deutsch.
