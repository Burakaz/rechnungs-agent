# Rechnungs-Agent

Ein vollautomatisches Beleg-System für kleine Firmen und Freelancer — komplett auf Google-Apps-Script-Basis. Es läuft serverlos in deinem Google-Konto (kein eigener Rechner, kein Hosting), scannt dein Gmail-Postfach nach Rechnungen, lässt eine KI die Metadaten auslesen, legt jedes PDF sauber benannt in Google Drive ab, leitet offene Rechnungen zur Zahlungsfreigabe an Qonto weiter, mahnt fehlende Belege per Slack an und baut am Monatsende den fertigen BelegCheck-Report für die Buchhaltung. Ziel: Am Monatsende liegen alle Belege vollständig, geprüft und einheitlich benannt bereit — ohne dass jemand Rechnungen zusammensucht.

## Was es kann

Fünf Automatiken, jede mit eigenem Trigger. Jede aktiviert sich nur, wenn ihr API-Key in der CONFIG gesetzt ist — du kannst also klein anfangen (nur Gmail → Drive) und später ausbauen.

| # | Automatik | Trigger | Was passiert |
|---|-----------|---------|--------------|
| 1 | `processInvoices` | stündlich | Scannt Gmail nach Rechnungs-Mails (Stichwörter + PDF-Anhang). Claude Haiku liest das PDF und extrahiert Anbieter, Rechnungsnummer, Betrag, Währung, Datum und Typ (offen vs. bereits bezahlt). Ablage in Drive unter `<Jahr>/<YYYY-MM>/`. Offene Rechnungen bekannter Dienstleister gehen zusätzlich an die Qonto-Lieferantenrechnungs-Inbox — zur **Freigabe**, nie zur automatischen Zahlung. |
| 2 | `checkMissingReceipts` | täglich 9 Uhr | Holt alle Qonto-Konten **inklusive der per Konto-Aggregation verbundenen AMEX-Karten** und prüft jede Abbuchung der letzten 35 Tage: Beleg vorhanden? (Qonto-Anhang, passendes Drive-PDF oder Dauerbeleg). Fehlende Belege → Slack-Sammelmeldung; bei AMEX-Karten wird der Karteninhaber per @-Mention erinnert. |
| 3 | `monthlyBelegReport` | 1. des Monats, 7 Uhr | Erzeugt im BelegCheck-Spreadsheet der Buchhalterin zwei Tabs für den Vormonat — einen für die Qonto-Konten, einen für AMEX — mit vorbefüllten BELEG-Checkboxen. Existierende Tabs werden nie überschrieben. |
| 4 | `pullGmiDocuments` | stündlich (optional) | Holt Plattform-Rechnungen über die GetMyInvoices-API — Portale wie Amazon Business oder Webflow, deren Rechnungen **nie per Mail kommen** — und legt sie mit derselben Naming-Convention in Drive ab. |
| 5 | `pullLexofficeInvoices` | stündlich (optional) | Zieht deine eigenen **Ausgangsrechnungen** und Gutschriften (keine Entwürfe) aus Lexware Office (lexoffice Public API) in den getrennten Drive-Baum `Ausgangsrechnungen/<Jahr>/<YYYY-MM>/`. |

Dazu kommt `backfillNames()` — eine einmalig ausführbare KI-Nachbenennung für Bestands-PDFs, die schon in deinem Drive-Ordner liegen. Fertige Dateien bekommen einen Marker in der Dateibeschreibung, du kannst die Funktion also beliebig oft wiederholen, bis alles durch ist.

### Die Naming-Convention

Jedes PDF wird nach diesem Muster benannt:

```
YYYY-MM-DD_Anbieter_Rechnungsnummer_BetragWÄHRUNG[_Konto].pdf

Beispiel:           2026-07-05_Notion_INV-2026-1234_25.50EUR.pdf
Nach dem Abgleich:  2026-07-06_Musicbed_sub-1579529_99.99USD_AMEX-Max.pdf
```

Das ist nicht nur Kosmetik — es ist die Grundlage für den **Beleg-Abgleich**, das Herzstück des Systems: Weil Betrag und Währung im Dateinamen stehen, kann der Agent jede Banktransaktion gegen die abgelegten PDFs matchen. EUR-Belege matchen bei exaktem Betrag ±10 Tage; Fremdwährungsbelege (USD-Rechnung vs. EUR-Abbuchung) matchen über den Anbieter-Namen im Dateinamen plus ein Wechselkurs-Band von 0,7–1,3. Jede Datei wird nur einmal „verbraucht" (1:1-Matching), damit ein Beleg nicht zwei Abbuchungen abdeckt.

**Der Konto-Tag entsteht erst beim Abgleich:** Sobald der tägliche Beleg-Check ein PDF einer Abbuchung zuordnet, hängt der Agent das Zahlungskonto automatisch als Suffix an den Dateinamen — `_Qonto-<Kontoname>` bei Qonto-Konten, `_AMEX-<Inhaber>` bei Kreditkarten (der Name kommt aus dem `AMEX_KARTEN`-Mapping), `_Bank-<Kontoname>` bei GoCardless-Konten. Früher geht das nicht: Beim Ablegen weiß noch niemand, von welchem Konto die Rechnung später abgebucht wird. Für Barbelege kannst du manuell `_Kasse` anhängen — der Abgleich toleriert das Suffix. Das volle Format ist also `Datum_Anbieter_Nummer_Betrag[_Konto].pdf`.

### Erinnerungs-Logik

Die Slack-Erinnerungen sind bewusst zurückhaltend: frühestens 3 Tage nach der Abbuchung, maximal 2 Erinnerungen pro Transaktion, mindestens 3 Tage Abstand — und sie verstummen automatisch, sobald der Beleg da ist. Über `BELEG_ZUSTAENDIG` kannst du händlerbasierte Zuständigkeit definieren, die den Karteninhaber überschreibt: Die Meta-Ads-Rechnung sammelt immer der Marketing-Verantwortliche ein, egal auf wessen Karte sie gelaufen ist.

## Voraussetzungen

- **Google-Konto bzw. Google Workspace** — Gmail, Drive und Apps Script (script.google.com). Mehr braucht die Kernfunktion nicht.
- **Anthropic-API-Key** (empfohlen) — für die KI-Klassifizierung und saubere Benennung. Ohne Key arbeitet der Agent nur mit deinen Absenderlisten.
- **Qonto-Geschäftskonto oder ein beliebiges Bankkonto via GoCardless** (optional) — für den täglichen Beleg-Check und den Monatsreport. AMEX-Firmenkarten lassen sich in Qonto per Konto-Aggregation anbinden; praktisch jede andere Bank bindet der eingebaute GoCardless-Adapter direkt an (siehe [Welche Banken funktionieren?](#welche-banken-funktionieren)).
- **Slack** (optional, empfohlen) — für Benachrichtigungen und Erinnerungen. Ohne Slack-Webhook läuft der tägliche Beleg-Check nicht.
- **GetMyInvoices** (optional) — für Portale, die keine Rechnungs-Mails verschicken.
- **Lexware Office** (optional) — für die Ausgangsrechnungs-Ablage.

Kein Server, kein Cronjob, kein Deployment — alles läuft in Google-Triggern.

## Schnellstart

1. **Drive-Ordner anlegen.** Erstelle in Google Drive den Ziel-Ordner für deine Belege und kopiere die Ordner-ID aus der URL (`drive.google.com/drive/folders/<ID>`).
2. **Apps-Script-Projekt anlegen.** Gehe auf [script.google.com](https://script.google.com), erstelle ein neues Projekt und füge `Code.gs` ein. Aktiviere unter Projekteinstellungen „Manifestdatei anzeigen" und ersetze den Inhalt von `appsscript.json` durch die Datei aus diesem Repo.
3. **CONFIG ausfüllen.** Mindestens `DRIVE_FOLDER_ID` — alles andere nach Bedarf. Jede Automatik aktiviert sich nur, wenn ihr Key gesetzt ist; leere Felder (`''`) schalten die jeweilige Funktion einfach ab.
4. **`setup()` ausführen.** Wähle im Editor die Funktion `setup` und klicke „Ausführen". Google fragt einmalig nach den OAuth-Berechtigungen (Gmail, Drive, externe Anfragen) — bestätigen. Danach stehen alle Trigger, die Gmail-Labels sind angelegt, die Hash-Datei ist initialisiert und der erste Lauf startet sofort.
5. **Qonto anbinden** (optional). API-Schlüssel erzeugen (Qonto → Einstellungen → Integrationen & Partner → API-Schlüssel) und deine AMEX-Karten per Konto-Aggregation verbinden (Qonto → Konten → externes Konto verbinden).
6. **Slack anbinden** (optional). Slack-App mit Incoming Webhook erstellen, Webhook-URL in die CONFIG, und die Slack-Member-IDs deiner Kollegen in `AMEX_KARTEN` bzw. `BELEG_ZUSTAENDIG` eintragen (Member-ID: Slack-Profil → „…" → „Mitglieder-ID kopieren").
7. **Optionale Quellen anbinden.** GetMyInvoices-Key, Lexware-Office-Key und/oder DATEV-Upload-Adressen in die CONFIG — jeweils `setup()` erneut ausführen, damit die zugehörigen Trigger angelegt werden.
8. **Weitere Postfächer** (optional). Installiere dieselbe Datei in zusätzlichen Postfächern (z. B. `billing@`) — über die geteilte Hash-Datei im Drive-Ordner entstehen keine Duplikate. Details im Abschnitt [Mehrpostfach-Betrieb](#mehrpostfach-betrieb).

## Mit Claude Code einrichten

Am schnellsten geht die Einrichtung mit [Claude Code](https://claude.com/claude-code) — kopiere diesen Prompt und Claude führt dich durch alles:

```text
Richte mir den „Rechnungs-Agent" ein: https://github.com/Burakaz/rechnungs-agent

Lies zuerst das README des Repos komplett. Führe mich dann Schritt für Schritt
durch die Einrichtung — immer nur ein Schritt, warte jeweils auf mein Okay:

1. Google-Drive-Ordner für Belege anlegen (oder nimm meinen bestehenden) und
   die Ordner-ID ermitteln.
2. Auf script.google.com ein neues Apps-Script-Projekt anlegen und Code.gs +
   appsscript.json aus dem Repo einfügen.
3. Die CONFIG gemeinsam ausfüllen — erkläre mir zu jedem Feld, wo ich den Wert
   herbekomme. Wichtig: API-Keys und Secrets trage ICH selbst ein.
4. setup() ausführen und die Google-Freigaben bestätigen.
5. Qonto: API-Schlüssel anlegen, meine Kreditkarten und Fremdbank-Konten per
   Konto-Aggregation verbinden, dann per Testlauf prüfen, dass alle Konten
   gefunden werden (externe Konten kommen über GET /v2/bank_accounts!).
6. Optional einrichten, je nachdem was ich nutze: Slack-Webhook, GetMyInvoices,
   lexoffice-Ausgangsrechnungen, DATEV Upload-Mail.

Zum Schluss: Testlauf machen und mir zeigen, dass die erste Rechnung sauber
benannt in Google Drive liegt.
```

## CONFIG-Referenz

Alle Einstellungen stehen oben in `Code.gs` im `CONFIG`-Objekt.

| Feld | Pflicht? | Was es steuert | Wo bekommst du den Wert? |
|------|----------|----------------|--------------------------|
| `DRIVE_FOLDER_ID` | **Pflicht** | Ziel-Ordner für alle Belege | Ordner in Drive öffnen, ID aus der URL kopieren (`…/folders/<ID>`) |
| `ANTHROPIC_API_KEY` | Empfohlen | KI-Klassifizierung (offen/bezahlt) und Extraktion von Anbieter, Nummer, Betrag, Datum für die Benennung. `''` = nur Absenderlisten, unbekannte Absender landen im Prüf-Label | [console.anthropic.com](https://console.anthropic.com) → API Keys |
| `QONTO_API_LOGIN` | Pflicht für Beleg-Check + Report via Qonto | Login der Qonto Business API = dein Organisations-Slug (kein Geheimnis) | Steht in Qonto bei den API-Einstellungen neben dem Schlüssel |
| `QONTO_API_SECRET` | Pflicht für Beleg-Check + Report via Qonto | Geheimer Schlüssel der Qonto-API. `''` = Beleg-Check und Monatsreport aus | Qonto → Einstellungen → Integrationen & Partner → API-Schlüssel |
| `QONTO_FORWARD_ADDRESS` | Optional | Weiterleitungsadresse für offene Lieferantenrechnungen (`…@inbox.qonto.com`). `''` = offene Rechnungen werden nur markiert + gemeldet | Qonto → Lieferantenrechnungen → Weiterleitungsadresse |
| `GOCARDLESS_SECRET_ID` | Optional | Bindet beliebige Bankkonten per GoCardless Bank Account Data in Beleg-Check + Monatsreport ein — ohne Qonto oder zusätzlich dazu. `''` = aus | [bankaccountdata.gocardless.com](https://bankaccountdata.gocardless.com) → Developers → User secrets |
| `GOCARDLESS_SECRET_KEY` | Optional | Gehört zur Secret-ID oben — beide Werte kommen aus demselben User Secret | Wie oben |
| `SLACK_WEBHOOK_URL` | Empfohlen (Pflicht für Beleg-Check) | Alle Benachrichtigungen und Erinnerungen. `''` = keine Meldungen, und der tägliche Beleg-Check läuft nicht | [api.slack.com/apps](https://api.slack.com/apps) → App erstellen → Incoming Webhooks aktivieren → Webhook für deinen Belege-Channel |
| `GMI_API_KEY` | Optional | Stündlicher Abruf von Plattform-Rechnungen + GMI-Belegzuordnung als zweite Quelle im Monatsreport. `''` = aus | GetMyInvoices → Profilmenü oben rechts → API Zugriff → „+" |
| `LEXOFFICE_API_KEY` | Optional | Stündlicher Abruf deiner Ausgangsrechnungen. `''` = aus | Lexware Office → Erweiterungen → Public API → Schlüssel erstellen |
| `BELEGCHECK_SHEET_ID` | Pflicht für den Monatsreport | Das Spreadsheet, in dem die Monats-Tabs angelegt werden | Spreadsheet öffnen, ID aus der URL (zwischen `/d/` und `/edit`) |
| `DATEV_MAIL_BANK` | Optional (vorbereitet) | Upload-Mail-Adresse für Belegtyp Rechnungseingang. In der CONFIG vorbereitet für eine DATEV-Anbindung — DATEV Unternehmen online nimmt Belege per Mail an, getrennt nach Belegtyp | DATEV Unternehmen online → Belegtransfer per E-Mail (senden darf nur der bestätigte Absender deiner Domain) |
| `DATEV_MAIL_KREDITKARTE` | Optional (vorbereitet) | Upload-Mail-Adresse für Belegtyp Kreditkarte | Wie oben |
| `DAUERBELEG_MUSTER` | Optional | Liste von Mustern für wiederkehrende Abbuchungen ohne Monatsbeleg (siehe [Dauerbelege](#dauerbelege)). Match gegen Gegenpartei **oder** Verwendungszweck, case-insensitiv | Deine eigenen Kontoauszüge — trage die Begriffe ein, wie sie dort erscheinen |
| `AMEX_KARTEN` | Optional | Mapping: letzte 5 Ziffern der Kartennummer → `{ name, slack }`. Bestimmt, wer bei fehlendem AMEX-Beleg erinnert wird | Kartennummern aus deiner AMEX-Übersicht; Slack-Member-ID aus dem Slack-Profil („…" → „Mitglieder-ID kopieren") |
| `BELEG_ZUSTAENDIG` | Optional | Händlerbasierte Belegpflicht — **überschreibt** den Karteninhaber. Beispiel: Meta Ads → immer Max, egal wessen Karte | Muster = Textfragmente aus dem Transaktions-Label (z. B. `'facebook'`, `'linkedin'`) |
| `DIENSTLEISTER_DOMAINS` | Optional | Absender-Domains, deren Rechnungen immer als **offen** gelten und zusätzlich an Qonto gehen (Steuerkanzlei, Freelancer, Agenturen) | Die Mail-Domains deiner Dienstleister |
| `BELEG_DOMAINS` | Optional | Bekannte Abo-/Plattform-Anbieter: immer nur Beleg ablegen, nie an Qonto | Vorbelegt mit gängigen Anbietern — ergänze deine eigenen |
| `KEYWORDS` | Vorbelegt | Stichwörter, an denen eine Rechnungs-Mail erkannt wird | Standard: rechnung, invoice, receipt, beleg, faktura, gutschrift |
| `SEARCH_DAYS` | Vorbelegt | Wie viele Tage rückwirkend Gmail durchsucht wird (Standard: 14) | — |
| `BELEGPFLICHT_AB` | Anpassen! | Stichtag im Format `YYYY-MM-DD`: alles davor gilt als erledigt (liegt bereits bei der Steuerkanzlei) und wird nie angemahnt | Der Monatserste, ab dem der Agent zuständig ist |
| `LABEL_DONE` / `LABEL_REVIEW` | Vorbelegt | Gmail-Labels für verarbeitete bzw. unklare Rechnungen | Standard: `Rechnungen/abgelegt` und `Rechnungen/pruefen` |

## Qonto + AMEX

Die Kombination Qonto-Geschäftskonto + AMEX-Firmenkarten ist der Grund, warum der Beleg-Check alle Konten aus **einer** API bekommt: AMEX-Karten lassen sich in Qonto per Konto-Aggregation verbinden (Qonto → Konten → externes Konto verbinden). Danach tauchen die AMEX-Transaktionen in der Qonto-API auf.

> [!IMPORTANT]
> **Das wichtigste Learning des ganzen Projekts:** Der dokumentierte Weg
> `GET /v2/organization?include_external_accounts=true` liefert die externen
> AMEX-Konten **nicht** — entgegen der Qonto-Doku. Was funktioniert:
>
> ```
> GET /v2/bank_accounts?per_page=100
> ```
>
> Dieser Endpoint liefert **alle** Konten inklusive der aggregierten AMEX-Karten
> (erkennbar an `is_external_account: true`). Genau so macht es `qontoAccounts_()`
> im Code.

Drei weitere Fallen, die dich sonst Stunden kosten:

- **Kein `settled_at` bei externen Konten.** Transaktionen der aggregierten AMEX-Karten haben oft kein `settled_at` — filtere stattdessen nach `emitted_at`. Der Code wählt das Datumsfeld automatisch je nach Konto-Typ.
- **Die Zeitzonen-Falle.** AMEX bucht zur Berliner Mitternacht — das ist 22:00 UTC des **Vortags**. Wer stur nach UTC-Stichtagen filtert, verliert die Buchungen der Monatswechsel-Nacht. Die Lösung im Code: Das API-Abfragefenster bekommt 2 Tage Puffer, und die eigentliche Entscheidung (gehört die Buchung in den Monat?) fällt nach dem angezeigten lokalen Datum (`settled_at || emitted_at`, Zeitzone Europe/Berlin).
- **Auth-Format.** Die Qonto-API will den Header `Authorization: login:secret` — Login ist der Organisations-Slug, das Secret kommt aus Einstellungen → Integrationen & Partner → API-Schlüssel. Kein Bearer, kein Base64.

## Welche Banken funktionieren?

- **Qonto (nativ):** Direkt per API integriert — täglicher Beleg-Check, Monatsreport und die Weiterleitung offener Lieferantenrechnungen zur Zahlungsfreigabe.
- **Finom, N26, Sparkasse, Volksbank, DKB, Commerzbank, weitere Karten … (über Qonto):** Alles, was du in Qonto per Konto-Aggregation verbindest, sieht der Agent automatisch mit — externe Konten laufen durch dieselbe Logik wie die AMEX-Karten (`is_external_account`). Ein Qonto-Konto als Zentrale genügt also, um praktisch jede in Deutschland übliche Bank einzubinden.
- **Ohne Qonto: GoCardless (eingebaut):** Der Agent bindet über GoCardless Bank Account Data (kostenlose PSD2-Schnittstelle, 2.000+ europäische Banken — Sparkasse, Volksbank, DKB, Commerzbank, N26, Finom, Holvi …) beliebige Firmenkonten direkt ein — ganz ohne Qonto, oder zusätzlich dazu. Gematchte Belege bekommen das Suffix `_Bank-<Kontoname>`.
- **Bargeld/Kasse:** Papierbelege scannst du in den Drive-Ordner und hängst manuell `_Kasse` an den Dateinamen — der Abgleich toleriert das Suffix.

### So richtest du GoCardless ein

1. Kostenlosen Account auf [bankaccountdata.gocardless.com](https://bankaccountdata.gocardless.com) anlegen, unter Developers → User secrets ein Secret erstellen und `GOCARDLESS_SECRET_ID`/`GOCARDLESS_SECRET_KEY` in die CONFIG eintragen.
2. Im Apps-Script-Editor `gocardlessBankSuchen('sparkasse')` ausführen — die Institution-IDs stehen im Log.
3. `gocardlessVerbinden('INSTITUTION_ID')` ausführen und den Link aus dem Log/Slack öffnen — einmal bei der Bank anmelden. Der Zugriff gilt bis zu 180 Tage, danach einfach neu verbinden.

Ab dann laufen die Konten automatisch im täglichen Beleg-Check und Monatsreport mit. Zwei Dinge solltest du wissen:

- **Keine Beleg-Anhänge:** GoCardless-Konten haben keine Anhänge wie Qonto — der Beleg-Status kommt dort komplett aus dem Drive-Abgleich (Betrag + Datum im Dateinamen) und der Dauerbeleg-Liste.
- **Free-Tier-Limit:** 4 Abrufe pro Konto und Tag. Der tägliche Check (1×) und der Monatsreport (1×) passen locker rein — häufige manuelle Testläufe können das Tageslimit aber aufbrauchen.

## Dauerbelege

Nicht jede Abbuchung braucht einen Monatsbeleg. Für wiederkehrende Zahlungen mit Dauerrechnung oder Vertrag reicht das einmal hinterlegte Dokument:

Leasing, Miete, Versicherungen, Sozialabgaben, Krankenkassen, Finanzamt, Gehälter, Rundfunkbeitrag, DATEV-Gebühren — und der monatliche **AMEX-Kartenausgleich** selbst: Dessen „Belege" sind ja die Einzeltransaktionen auf der Karte, die der Agent ohnehin einzeln prüft.

Konfiguriert wird das über `DAUERBELEG_MUSTER` — eine einfache Liste von Textfragmenten, die gegen Gegenpartei **oder** Verwendungszweck der Transaktion gematcht werden (case-insensitiv). Passt ein Muster, wird die Abbuchung nie angemahnt und im Monatsreport automatisch als erledigt abgehakt.

```js
DAUERBELEG_MUSTER: [
  'leasing',                     // Kfz-Leasing (Dauerrechnung liegt vor)
  'max mustermann',              // Büro-Miete (Name des Vermieters)
  'finanzamt',                   // Steuerzahlungen (Bescheide liegen vor)
  'gehalt',                      // Lohnabrechnungen macht der Steuerberater
  'american express europe',     // AMEX-Ausgleich – Belege sind die Einzeltransaktionen
],
```

Tipp: Nimm die Begriffe exakt so auf, wie sie auf deinem Kontoauszug erscheinen — und lieber etwas spezifischer (`' bkk'` mit Leerzeichen statt `'bkk'`), damit keine falschen Treffer entstehen.

## Mehrpostfach-Betrieb

Rechnungen kommen selten nur in ein Postfach — Buchhaltung an `billing@`, Abos an die Inhaber-Adresse. Der Agent ist dafür gebaut:

1. Installiere dieselbe `Code.gs` (plus `appsscript.json`) als eigenes Apps-Script-Projekt in **jedem** Postfach.
2. Teile den Drive-Ziel-Ordner mit allen beteiligten Konten (Bearbeiter-Rechte) und trage überall dieselbe `DRIVE_FOLDER_ID` ein.
3. Führe in jedem Postfach `setup()` aus.

Der Trick dahinter: Alle Installationen lesen und schreiben **dieselbe Hash-Datei** (`.rechnungs-agent-hashes.json`) im Drive-Ordner. Jedes abgelegte PDF wird über seinen MD5-Hash registriert — kommt dieselbe Rechnung in zwei Postfächern an (CC, Weiterleitung, Newsletter an mehrere Adressen), wird sie trotzdem nur einmal abgelegt. `setup()` ruft außerdem `seedHashes()` auf und nimmt die Hashes der bereits abgelegten PDFs (letzte ~2 Monate) in die Datei auf — das Onboarding eines weiteren Postfachs erzeugt also auch rückwirkend keine Duplikate.

Zusätzlich merkt sich jede Installation ihre bereits verarbeiteten Gmail-Message-IDs lokal, damit kein Lauf dieselbe Mail zweimal anfasst.

## Stolpersteine & Learnings

Gesammelt aus mehreren Monaten Betrieb — damit du sie nicht selbst finden musst:

- **Gmail paginiert hart bei 100.** `GmailApp.search` liefert maximal 100 Threads pro Aufruf. Der Code paginiert deshalb selbst (Deckel: 500 Threads pro Lauf).
- **Apps Script bricht nach 6 Minuten ab.** Deshalb hat jeder Lauf eine eingebaute Zeitbremse bei ~4,5 Minuten. Das ist kein Problem: Einfach laufen lassen (oder manuell erneut starten) — durch die Dedupe-Mechanik ist jeder Lauf idempotent und macht dort weiter, wo der letzte aufgehört hat.
- **KI-Extraktion braucht Verbote.** Der Prompt verbietet explizit, Gegenstandswert, Streitwert oder Kontostand als Rechnungsbetrag zu nehmen — sonst wird aus einer Anwaltsrechnung über 300 € schnell ein „Beleg" über den Streitwert von 50.000 €. Außerdem zählen Receipts, Quittungen und Bescheide mit Zahlbetrag ausdrücklich als Beleg, reine Anschreiben und Verträge nicht.
- **Invoice + Receipt im Paar → nur das Receipt.** Stripe-basierte Anbieter schicken oft beide PDFs in einer Mail. Für die Ablage zählt nur das Receipt — die Invoice ist inhaltlich redundant und würde den Beleg-Abgleich mit Duplikaten verwässern. Der Code filtert das automatisch.
- **GetMyInvoices-Eigenheiten.** Die API verlangt sporadisch einen User-Agent im Format `G-{Kundennummer}`. Manche Portale lassen sich nur über die GMI-**Desktop-App** verbinden (die Credentials bleiben dann lokal auf deinem Rechner). Und: Beim Verbinden eines Portals unbedingt das Import-Startdatum setzen — der Erstimport frisst sonst das Dokumenten-Kontingent deines Tarifs für Uralt-Rechnungen.
- **lexoffice-API in drei Schritten.** Das PDF einer Ausgangsrechnung bekommst du über `voucherlist` → `/invoices/{id}/document` (liefert die `documentFileId`) → `/files/{id}` mit `Accept: application/pdf`. Rate-Limit: 2 Anfragen pro Sekunde — der Code wartet deshalb 600 ms zwischen den Abrufen.
- **Qonto + AMEX** — siehe den [eigenen Abschnitt oben](#qonto--amex): `/v2/bank_accounts` statt `/v2/organization`, `emitted_at` statt `settled_at`, und die Zeitzonen-Falle am Monatswechsel.
- **Nachhol-Läufe leiten nie an Qonto weiter.** `processInvoices()` akzeptiert einen optionalen Gmail-Query-Override für alte Zeiträume (z. B. `'has:attachment filename:pdf after:2026/6/1 before:2026/7/1'`). Dabei wird bewusst nichts an Qonto weitergeleitet — alte offene Rechnungen sind in der Regel längst bezahlt.

## Kosten

| Posten | Kosten |
|--------|--------|
| Google Apps Script | 0 € — in jedem Google-Konto enthalten |
| Anthropic API (Claude Haiku) | Wenige Euro pro Monat bei normalem Rechnungsvolumen — die PDF-Klassifizierung läuft auf dem günstigsten Modell |
| Qonto Business API | Im Qonto-Konto enthalten |
| Slack Incoming Webhook | 0 € |
| lexoffice Public API | Im Lexware-Office-Tarif enthalten |
| GetMyInvoices | Eigener Tarif je nach Portal- und Dokumentenzahl (nur falls du GMI nutzt) |

## FAQ

**Bezahlt der Agent Rechnungen automatisch?**
Nein, niemals. Offene Rechnungen werden nur an die Qonto-Lieferantenrechnungs-Inbox weitergeleitet — dort entscheidest du über die Freigabe. Der Agent bewegt kein Geld.

**Brauche ich Qonto, Slack und die KI zwingend?**
Nein. Die Kernfunktion (Gmail → Drive mit sauberer Benennung) braucht nur die `DRIVE_FOLDER_ID`. Jede weitere Automatik schaltet sich erst zu, wenn du ihren Key setzt.

**Was passiert ohne Anthropic-API-Key?**
Der Agent arbeitet dann nur mit deinen Absenderlisten (`DIENSTLEISTER_DOMAINS`, `BELEG_DOMAINS`). Mails von unbekannten Absendern mit Rechnungs-Stichwort landen im Prüf-Label — die feine Benennung mit Anbieter, Nummer und Betrag entfällt.

**Welche Daten gehen an die Anthropic-API?**
Pro Rechnungs-Mail: das PDF plus Absender, Betreff und der Anfang des Mailtexts — nur zur Klassifizierung und Metadaten-Extraktion. Ohne API-Key verlässt kein Inhalt dein Google-Konto.

**Wie sicher sind meine API-Keys?**
Sie stehen im `CONFIG`-Block deines Apps-Script-Projekts, das nur für dein Google-Konto (und von dir eingeladene Editoren) sichtbar ist. Trotzdem gilt: Keys nie committen, nie teilen — dieses Repo enthält nur Platzhalter.

**Kommt eine Rechnung doppelt an (CC, zwei Postfächer) — was passiert?**
Nichts. Jedes PDF wird über seinen MD5-Hash in der geteilten Hash-Datei registriert und nur einmal abgelegt — auch über mehrere Postfächer und Installationen hinweg.

**Ein Lauf ist mittendrin abgebrochen — ist jetzt etwas kaputt?**
Nein. Alle Läufe sind idempotent: Verarbeitete Message-IDs und Datei-Hashes werden gespeichert, der nächste Lauf (spätestens der nächste stündliche Trigger) macht einfach weiter.

**Kann ich alte Bestands-PDFs nachträglich sauber benennen?**
Ja — dafür gibt es `backfillNames()`. Einmal (oder mehrfach, bis alles durch ist) im Editor ausführen; fertige Dateien werden per Marker übersprungen.

**Wie hole ich alte Mails nach?**
`processInvoices('has:attachment filename:pdf after:2026/6/1 before:2026/7/1 -in:sent -in:trash -in:spam')` im Editor ausführen. Nachhol-Läufe legen nur ab und leiten nichts an Qonto weiter.

**Was ist mit DATEV?**
Die Upload-Mail-Adressen (`DATEV_MAIL_BANK`, `DATEV_MAIL_KREDITKARTE`) sind in der CONFIG vorbereitet — DATEV Unternehmen online nimmt Belege per Mail an, getrennt nach Belegtyp Bank und Kreditkarte. Die aktive Weiterleitung dorthin kannst du auf dieser Basis leicht ergänzen.

## Lizenz

MIT — siehe [LICENSE](LICENSE). Nutze es, bau es um, teile es.

---

Ein Projekt von ADMKRS.
