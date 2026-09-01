/**
 * ADMKRS Rechnungs-Agent
 *
 * Zieht Rechnungs-PDFs aus dem Gmail-Postfach, legt sie in Monatsordnern
 * in Google Drive ab und leitet offene Dienstleister-Rechnungen an Qonto
 * (Lieferantenrechnungen-Weiterleitungsadresse) weiter.
 *
 * Einrichtung: CONFIG unten ausfüllen, dann einmal setup() ausführen.
 */

const CONFIG = {
  // Ziel-Ordner in Google Drive (ID aus der Ordner-URL)
  DRIVE_FOLDER_ID: 'DEINE_DRIVE_ORDNER_ID',

  // Scan-Eingang: Ordner, in den der Dokumentenscanner/Handy-Scans ablegt.
  // Wird stündlich geleert – Dateien werden KI-benannt und in den
  // Monatsordner einsortiert ('' = aus)
  SCAN_INBOX_FOLDER_ID: '',

  // Qonto-Weiterleitungsadresse für Lieferantenrechnungen ('' = deaktiviert,
  // dann werden offene Rechnungen nur markiert + gemeldet)
  QONTO_FORWARD_ADDRESS: 'deine-inbox@inbox.qonto.com',

  // Anthropic API-Key für die KI-Klassifizierung ('' = nur Absenderlisten)
  ANTHROPIC_API_KEY: '',

  // Slack Incoming Webhook für Benachrichtigungen in #belege ('' = aus)
  SLACK_WEBHOOK_URL: '',

  // Slack-Bot für den Beleg-Kanal: Belege (PDF oder Foto) einfach in den
  // Channel werfen – der Agent holt sie stündlich ab, liest sie mit KI und
  // ordnet sie von selbst der passenden Buchung zu. Eigene Slack-App nötig –
  // Bot-Token (xoxb-…) mit den Scopes channels:history, groups:history,
  // files:read, chat:write; den Bot in den Channel einladen. '' = aus.
  SLACK_BOT_TOKEN: '',
  SLACK_CHANNEL_ID: '',

  // GetMyInvoices-API-Key (GMI → Profilmenü oben rechts → API Zugriff → "+")
  // für den täglichen Beleg-Check über alle Konten inkl. AMEX ('' = aus)
  GMI_API_KEY: '',

  // Qonto Business API: Login = Organisations-Slug (kein Geheimnis),
  // Secret = "Geheimer Schlüssel" aus Qonto → Einstellungen → Integrationen & Partner → API-Schlüssel
  QONTO_API_LOGIN: 'deine-firma-1234',
  QONTO_API_SECRET: '',

  // Lexware Office (lexoffice) Public API – zieht die eigenen AUSGANGSRECHNUNGEN
  // nach Drive in den getrennten Baum Ausgangsrechnungen/<Jahr>/<YYYY-MM>/.
  // Key: Lexware Office → Erweiterungen → Public API → Schlüssel erstellen ('' = aus)
  LEXOFFICE_API_KEY: '',

  // GoCardless Bank Account Data (kostenlos, PSD2) – bindet Konten fast aller
  // europäischen Banken ein (Sparkasse, Volksbank, DKB, N26, Finom, Holvi …),
  // falls du kein Qonto nutzt oder zusätzliche Konten hast. Einrichtung:
  // 1. Kostenlosen Account auf bankaccountdata.gocardless.com anlegen,
  //    unter Developers → User secrets ein Secret erstellen, beide Werte hier rein.
  // 2. Im Editor gocardlessBankSuchen('sparkasse') ausführen → Institution-ID im Log.
  // 3. gocardlessVerbinden('INSTITUTION_ID') ausführen → Link im Log/Slack öffnen
  //    und einmal bei der Bank anmelden (Zugriff gilt bis zu 180 Tage).
  // Danach laufen die verbundenen Konten automatisch im Beleg-Check + Monatsreport mit.
  GOCARDLESS_SECRET_ID: '',
  GOCARDLESS_SECRET_KEY: '',

  // BelegCheck-Spreadsheet der Buchhalterin – der Monatsreport ergänzt dort
  // automatisch die zwei Tabs (Qonto + Amex) für den Vormonat
  BELEGCHECK_SHEET_ID: 'DEINE_SPREADSHEET_ID',

  // DATEV Unternehmen online – Upload-Mail-Zieladressen (senden darf nur der
  // bestätigte Absender deiner Domain). Getrennte Ablage: Bank vs. Kreditkarte.
  DATEV_MAIL_BANK: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx@uploadmail.datev.de',        // Belegtyp Rechnungseingang
  DATEV_MAIL_KREDITKARTE: 'yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy@uploadmail.datev.de', // Belegtyp Kreditkarte

  // Dauerbelege: wiederkehrende Abbuchungen mit Dauerrechnung/Vertrag
  // (Leasing, Miete, Versicherungen, Sozialabgaben, Gehälter). Brauchen
  // keinen monatlichen Beleg und werden im Report automatisch abgehakt.
  // Match: Muster kommt in Gegenpartei ODER Verwendungszweck vor (case-insensitiv).
  DAUERBELEG_MUSTER: [
    'leasing',                    // Kfz-/Geräte-Leasing (Dauerrechnung liegt vor)
    'max mustermann',             // Büro-Miete (Name des Vermieters)
    'lebensversicherung',         // Altersvorsorge/Direktversicherung
    'künstlersozialkasse',        // KSK-Abgabe
    'krankenkasse',               // Beitragsnachweise kommen aus der Lohnabrechnung
    ' bkk',
    'deutsche rentenversicherung',// Sozialversicherung/Minijob
    'knappschaft',
    'finanzamt',                  // Steuerzahlungen (Bescheide liegen vor)
    'stadtwerke',                 // Strom-/Gas-Abschläge (Jahresrechnung folgt)
    'datev eg',                   // DATEV-Rechnungen liegen automatisch in DUO
    'gehalt',                     // Gehälter (Lohnabrechnungen macht der Steuerberater)
    'american express europe',    // AMEX-Kartenausgleich – Belege sind die
                                  // Einzeltransaktionen im Amex-Tab
    'rundfunk ard',               // Rundfunkbeitrag
  ],

  // AMEX-Karteninhaber: letzte 5 Ziffern der Kartennummer → wer wird bei
  // fehlendem Beleg per Slack erinnert (slack = Member-ID, '' = keine Erwähnung)
  AMEX_KARTEN: {
    '12345': { name: 'Max',  slack: 'U0XXXXXXXXX' },
    '67890': { name: 'Lisa', slack: 'U0YYYYYYYYY' },
  },

  // Fallback-Standardkonto pro Anbieter: Läuft ein Anbieter IMMER über dasselbe
  // Konto (z. B. Amazon Business → AMEX), wird der Beleg auch OHNE bestätigte
  // Buchung so getaggt und in AMEX/QONTO einsortiert. Der Schlüssel muss im
  // Anbieter-Teil des Dateinamens vorkommen (case-insensitiv); der Wert ist das
  // Konto-Suffix (AMEX-<Name> oder Qonto-<Kontoname>). Das BelegCheck-Sheet
  // bleibt die zahlungs-genaue Quelle – der Tag ist reine Organisation.
  KONTO_FALLBACK: {
    // 'amazon': 'AMEX-Max', 'anthropic': 'AMEX-Max', 'adobe': 'AMEX-Max',
    // 'personio': 'Qonto-Hauptkonto', 'ionos': 'Qonto-Hauptkonto',
  },

  // Belegpflicht nach Händler – ÜBERSCHREIBT den Karteninhaber. Wer sammelt die
  // Rechnung dieses Anbieters, egal auf welcher Karte/Konto sie läuft?
  // (Match: Muster kommt im Transaktions-Label vor, case-insensitiv.)
  BELEG_ZUSTAENDIG: [
    { muster: ['facebook', 'meta ', 'meta,', 'fbads', 'meta platforms'],
      name: 'Max', slack: 'U0XXXXXXXXX' },   // Meta / Meta Ads
    { muster: ['linkedin'], name: 'Max', slack: 'U0XXXXXXXXX' },
  ],

  // Dienstleister: Rechnungen dieser Absender-Domains gelten immer als
  // OFFEN und gehen zusätzlich an Qonto.
  DIENSTLEISTER_DOMAINS: [
    'deine-steuerkanzlei.de',
    'deine-agentur.de',
    'freelancer-beispiel.de',
  ],

  // Bekannte Abo-/Plattform-Anbieter: immer nur Beleg ablegen, nie Qonto.
  BELEG_DOMAINS: [
    'stripe.com', 'openai.com', 'anthropic.com', 'google.com',
    'facebookmail.com', 'meta.com', 'amazonaws.com', 'amazon.de',
    'canva.com', 'figma.com', 'slack.com', 'notion.so',
    'qonto.com', 'qonto.eu', 'getmyinvoices.com', 'americanexpress.com',
  ],

  // Stichwörter, an denen eine Rechnungs-Mail erkannt wird
  KEYWORDS: ['rechnung', 'invoice', 'receipt', 'beleg', 'faktura', 'gutschrift'],

  // Wie viele Tage rückwirkend gesucht wird
  SEARCH_DAYS: 14,

  // Ab wann Belege gefordert werden: alles davor liegt bereits bei der
  // Steuerkanzlei und ist erledigt – ältere Abbuchungen werden nie angemahnt.
  BELEGPFLICHT_AB: '2026-07-01',

  LABEL_DONE: 'Rechnungen/abgelegt',
  LABEL_REVIEW: 'Rechnungen/pruefen',
};

// ---------------------------------------------------------------------------
// Einmalig ausführen: legt Labels an und richtet den stündlichen Trigger ein
// ---------------------------------------------------------------------------
function setup() {
  getOrCreateLabel(CONFIG.LABEL_DONE);
  getOrCreateLabel(CONFIG.LABEL_REVIEW);
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'processInvoices') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processInvoices').timeBased().everyHours(1).create();
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'processDriveUploads') ScriptApp.deleteTrigger(t);
  });
  if (CONFIG.ANTHROPIC_API_KEY) {
    ScriptApp.newTrigger('processDriveUploads').timeBased().everyHours(1).create();
  }
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'checkMissingReceipts') ScriptApp.deleteTrigger(t);
  });
  if (CONFIG.QONTO_API_SECRET || CONFIG.GOCARDLESS_SECRET_ID) {
    ScriptApp.newTrigger('checkMissingReceipts').timeBased().everyDays(1).atHour(9).create();
  }
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'belegSheetsAktualisieren') ScriptApp.deleteTrigger(t);
  });
  if (CONFIG.BELEGCHECK_SHEET_ID && (CONFIG.QONTO_API_SECRET || CONFIG.GOCARDLESS_SECRET_ID)) {
    ScriptApp.newTrigger('belegSheetsAktualisieren').timeBased().everyDays(1).atHour(8).create();
  }
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'pullGmiDocuments') ScriptApp.deleteTrigger(t);
  });
  if (CONFIG.GMI_API_KEY) {
    ScriptApp.newTrigger('pullGmiDocuments').timeBased().everyHours(1).create();
  }
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'pullLexofficeInvoices') ScriptApp.deleteTrigger(t);
  });
  if (CONFIG.LEXOFFICE_API_KEY) {
    ScriptApp.newTrigger('pullLexofficeInvoices').timeBased().everyHours(1).create();
  }
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'monthlyBelegReport') ScriptApp.deleteTrigger(t);
  });
  if (CONFIG.QONTO_API_SECRET || CONFIG.GOCARDLESS_SECRET_ID) {
    ScriptApp.newTrigger('monthlyBelegReport').timeBased().onMonthDay(1).atHour(7).create();
  }
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'slackWatch') ScriptApp.deleteTrigger(t);
  });
  if (CONFIG.SLACK_BOT_TOKEN && CONFIG.SLACK_CHANNEL_ID) {
    ScriptApp.newTrigger('slackWatch').timeBased().everyMinutes(5).create();
  }
  seedHashes();
  processInvoices();
}

// ---------------------------------------------------------------------------
// Täglicher Beleg-Check (9 Uhr): prüft alle Qonto-Konten inkl. der AMEX-Karten
// auf Abbuchungen der letzten 35 Tage ohne Beleg (Qonto-Anhang, Drive-PDF oder
// Dauerbeleg). Zuständige werden per Slack-Erwähnung erinnert (Karteninhaber,
// bei bestimmten Händlern per BELEG_ZUSTAENDIG überschrieben, z. B. Meta/LinkedIn
// → Max) – frühestens 3 Tage nach der Abbuchung, max. 2×, mind. 3 Tage Abstand.
// ---------------------------------------------------------------------------
function checkMissingReceipts() {
  if ((!CONFIG.QONTO_API_SECRET && !CONFIG.GOCARDLESS_SECRET_ID) || !CONFIG.SLACK_WEBHOOK_URL) return;
  try {
    const now = new Date();
    const floorStr = CONFIG.BELEGPFLICHT_AB || '2026-07-01';
    // API-Fenster mit 2 Tagen Puffer – AMEX-Autorisierung (emitted_at) liegt
    // bis zu 2 Tage vor der Wertstellung; entschieden wird unten nach dem
    // angezeigten Berlin-Datum, daher rutschen keine Alt-Positionen rein
    const from = new Date(Math.max(now.getTime() - 35 * 86400000,
      new Date(floorStr).getTime() - 2 * 86400000));
    // Zuerst die AMEX-Verbindung prüfen – ohne sie veralten alle AMEX-Daten still
    try { pruefeAmexVerbindung_(); } catch (e) { /* nie blockieren */ }
    // Dann alle Belege in die Konto-Unterordner AMEX/QONTO einsortieren + taggen
    try { sortiereBelege_(); } catch (e) { console.warn('Sortieren fehlgeschlagen: ' + e); }
    const driveMap = driveDocMap_(new Date(now.getFullYear(), now.getMonth(), 1));
    const props = PropertiesService.getScriptProperties();
    const reminders = JSON.parse(props.getProperty('belegReminders') || '{}');
    const missing = [], mentions = [], offen = [];

    alleBankKonten_().forEach(acc => {
      if (acc.status === 'closed') return;
      const txs = kontoTransaktionen_(acc, from.toISOString(), now.toISOString());
      txs.forEach(t => {
        const betrag = (t.side === 'debit' ? -1 : 1) * (t.amount || 0);
        if (betrag >= 0 || t.operation_type === 'qonto_fee') return;
        if (istDauerbeleg_(t)) return;
        const datum = new Date(t.settled_at || t.emitted_at);
        // Stichtag nach angezeigtem (Berliner) Datum – wie im BelegCheck-Sheet
        if (Utilities.formatDate(datum, 'Europe/Berlin', 'yyyy-MM-dd') < floorStr) return;
        const key = t.transaction_id || t.id;
        if (t.attachment_ids && t.attachment_ids.length > 0) { delete reminders[key]; return; }
        if (driveHasDoc_(driveMap, Math.abs(betrag), datum.getTime(), t.label, kontoTag_(acc))) {
          delete reminders[key];
          return;
        }
        offen.push({ betrag: Math.abs(betrag), datum: datum, label: t.label, key: key, acc: acc });
      });
    });

    // Sammelbelege: EIN Beleg deckt mehrere Abbuchungen desselben Anbieters
    // (z. B. eine ÖPNV-Sammelrechnung über zwei Einzelfahrten).
    // Offene Posten nach Anbieter-Token gruppieren und gegen unverbrauchte
    // Drive-Einträge mit passender Betrags-SUMME matchen.
    const gruppen = {};
    offen.forEach(o => {
      const tok = vendorToken_(o.label);
      if (tok) (gruppen[tok] = gruppen[tok] || []).push(o);
    });
    Object.keys(gruppen).forEach(tok => {
      const g = gruppen[tok];
      if (g.length < 2) return;
      const sum = g.reduce((s, o) => s + o.betrag, 0);
      const hit = driveMap.filter(e => !e.used && e.cur === 'EUR' &&
        Math.abs(e.amount - sum) < 0.005 && vendorMatch_(e.vendor, tok) &&
        g.every(o => Math.abs(e.time - o.datum.getTime()) < 35 * 86400000))[0];
      if (hit) {
        hit.used = true;
        g.forEach(o => { o.gedeckt = true; delete reminders[o.key]; });
      }
    });

    offen.filter(o => !o.gedeckt).forEach(o => {
      const eintrag = Utilities.formatDate(o.datum, 'Europe/Berlin', 'dd.MM.') + ' ' +
        (o.label || '?') + ' – ' + o.betrag.toFixed(2) + ' €';
      // Zuständig: erst Händler-Regel (überschreibt Karteninhaber), dann AMEX-Inhaber
      let person = belegZustaendig_(o.label);
      let quelle;
      if (o.acc.is_external_account) {
        const suffix = String(o.acc.account_number || '').slice(-5);
        const inhaber = (CONFIG.AMEX_KARTEN || {})[suffix];
        quelle = inhaber ? inhaber.name : 'AMEX …' + suffix;
        if (!person) person = inhaber;
      } else {
        quelle = o.acc.name || 'Qonto';
      }
      missing.push(eintrag + ' (' + quelle +
        (person && person.name !== quelle ? ' → ' + person.name : '') + ')');
      const r = reminders[o.key] || { n: 0, last: 0 };
      if (person && now.getTime() - o.datum.getTime() > 3 * 86400000 &&
          r.n < 2 && now.getTime() - r.last > 3 * 86400000) {
        mentions.push((person.slack ? '<@' + person.slack + '>' : '*' + person.name + '*') +
          ' ' + eintrag + (r.n === 1 ? ' _(letzte Erinnerung)_' : ''));
        reminders[o.key] = { n: r.n + 1, last: now.getTime() };
      }
    });

    // Alte Reminder-Einträge aufräumen (>60 Tage)
    Object.keys(reminders).forEach(k => {
      if (now.getTime() - (reminders[k].last || 0) > 60 * 86400000) delete reminders[k];
    });
    props.setProperty('belegReminders', JSON.stringify(reminders));

    // Offene Posten für den Slack-Agenten zwischenspeichern: Bittet jemand im
    // Kanal um einen Eigenbeleg ("für das Essen am 10.08."), findet er so die
    // passende Buchung, ohne die Bank-APIs erneut abzufragen.
    try {
      props.setProperty('offenePosten', JSON.stringify(
        offen.filter(o => !o.gedeckt).map(o => ({
          d: Utilities.formatDate(o.datum, 'Europe/Berlin', 'yyyy-MM-dd'),
          a: Number(o.betrag.toFixed(2)),
          v: String(o.label || '').slice(0, 40),
          k: kontoTag_(o.acc),
        })).slice(0, 60)));
    } catch (e) { /* Cache ist Komfort, nie blockieren */ }

    // BelegCheck-Sheet des laufenden Monats bei jedem Check aktuell halten
    try { updateBelegSheets_(); } catch (e) {
      console.warn('Sheet-Update fehlgeschlagen: ' + e);
    }

    if (missing.length === 0) return;
    let text = ':receipt: *' + missing.length + ' Abbuchung' + (missing.length === 1 ? '' : 'en') +
      ' ohne Beleg* (Qonto + AMEX, letzte 35 Tage):\n' +
      missing.slice(0, 25).map(z => '• ' + z).join('\n') +
      (missing.length > 25 ? '\n… und ' + (missing.length - 25) + ' weitere' : '');
    if (mentions.length) {
      text += '\n\n:point_right: *Bitte Beleg nachreichen* – ' +
        (CONFIG.SLACK_BOT_TOKEN ? 'einfach hier in den Channel werfen (Foto reicht), ' : '') +
        'PDF in den <https://drive.google.com/drive/folders/' + CONFIG.DRIVE_FOLDER_ID +
        '|Rechnungs-Ordner> legen oder an belege@deine-firma.de mailen:\n' +
        mentions.map(z => '• ' + z).join('\n');
    }
    notifySlack(text);
  } catch (e) {
    console.warn('Beleg-Check fehlgeschlagen: ' + e);
    notifySlack(':warning: Beleg-Check konnte nicht laufen: ' + e);
  }
}

// ---------------------------------------------------------------------------
// GMI-Plattform-Rechnungen: holt stündlich neue Dokumente aus GetMyInvoices
// (Portal-Abrufe wie Amazon Business) und legt sie mit Naming-Convention in
// Drive ab. Dedupe: dokumentweise (Script Property) + inhaltlich über die
// geteilte Hash-Datei – kommt dieselbe Rechnung auch per Mail, entsteht kein Doppel.
// ---------------------------------------------------------------------------
function pullGmiDocuments() {
  if (!CONFIG.GMI_API_KEY) return;
  const floor = CONFIG.BELEGPFLICHT_AB || '2026-07-01';
  const props = PropertiesService.getScriptProperties();
  const done = new Set(JSON.parse(props.getProperty('gmiDocsDone') || '[]'));
  const seen = loadSeenHashes();
  const startTime = Date.now();
  const MAX_RUNTIME_MS = 240 * 1000;
  const headers = { 'X-API-KEY': CONFIG.GMI_API_KEY, Accept: 'application/json' };
  const abgelegt = [];
  try {
    // startDateFilter filtert nach RECHNUNGSDATUM – nachgereichte Belege
    // (gescannte Bons, Google-Ads-Monatsrechnungen zum Monatsultimo) tragen
    // aber oft ein Datum aus dem Vormonat, obwohl sie erst jetzt in GMI
    // ankommen. Darum 35 Tage vor den Stichtag greifen (Fenster des
    // Beleg-Abgleichs); was GMI schon VOR dem Stichtag geholt hatte,
    // blockt weiterhin das createdAt-Gate unten.
    const gmiStart = Utilities.formatDate(
      new Date(new Date(floor).getTime() - 35 * 86400000),
      'Europe/Berlin', 'yyyy-MM-dd');
    let offset = 0, guard = 0;
    while (guard++ < 20) {
      if (Date.now() - startTime > MAX_RUNTIME_MS) break;
      const resp = UrlFetchApp.fetch('https://api.getmyinvoices.com/accounts/v3/documents' +
        '?limit=100&offset=' + offset + '&startDateFilter=' + gmiStart,
        { headers: headers, muteHttpExceptions: true });
      if (resp.getResponseCode() !== 200) break;
      const data = JSON.parse(resp.getContentText());
      const records = data.records || [];
      if (!records.length) break;
      for (const d of records) {
        if (Date.now() - startTime > MAX_RUNTIME_MS) break;
        const uid = String(d.documentUid);
        if (done.has(uid)) continue;
        // Nur Dokumente, die GMI seit dem Stichtag geholt hat
        if ((d.createdAt || '') < floor) { done.add(uid); continue; }
        try {
          const fileResp = UrlFetchApp.fetch(
            'https://api.getmyinvoices.com/accounts/v3/documents/' + uid + '/file',
            { headers: headers, muteHttpExceptions: true });
          if (fileResp.getResponseCode() !== 200) { continue; }
          const blob = fileResp.getBlob();
          const hash = md5hex(blob.getBytes());
          done.add(uid);
          if (seen.has(hash)) continue; // kam schon per Mail o.Ä.

          // Benennung aus GMI-Metadaten (documentDate ist gelegentlich OCR-Müll
          // → Plausibilitätscheck, sonst Abrufdatum)
          const ymd = (/^\d{4}-\d{2}-\d{2}$/.test(d.documentDate || '') &&
                       d.documentDate >= '2020-01-01' && d.documentDate <= '2030-12-31')
            ? d.documentDate : d.createdAt;
          const vendor = sanitize(d.companyName || 'GMI-Plattform');
          const nummer = d.documentNumber ? '_' + sanitize(d.documentNumber) : '';
          const betrag = d.grossAmount > 0 ? '_' + d.grossAmount + (d.currency || 'EUR') : '';

          const root = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
          const yIt = root.getFoldersByName(ymd.slice(0, 4));
          const yearFolder = yIt.hasNext() ? yIt.next() : root.createFolder(ymd.slice(0, 4));
          const mIt = yearFolder.getFoldersByName(ymd.slice(0, 7));
          const monthFolder = mIt.hasNext() ? mIt.next() : yearFolder.createFolder(ymd.slice(0, 7));
          const base = ymd + '_' + vendor + nummer + betrag;
          // Ohne Anbieternamen (z. B. in GMI hochgeladene Bons) keinen
          // Convention-Namen vergeben – der Rohname lässt die KI-Benennung im
          // nächsten processDriveUploads greifen statt "GMI-Plattform"-Kryptik
          const hatVendor = !!d.companyName;
          const rohBase = hatVendor ? base : 'GMI-Upload-' + uid;
          let name = (hatVendor ? base : rohBase) + '.pdf';
          let n = 2;
          while (monthFolder.getFilesByName(name).hasNext()) name = rohBase + '_' + (n++) + '.pdf';
          const gmiFile = monthFolder.createFile(blob.copyBlob().setName(name));
          if (hatVendor) gmiFile.setDescription('rechnungs-agent:benannt');
          // Hash erst nach erfolgreicher Ablage merken (sonst Hash-Vergiftung bei Crash)
          seen.add(hash);
          abgelegt.push(name);
        } catch (e) {
          console.warn('GMI-Dokument ' + uid + ' fehlgeschlagen: ' + e);
        }
      }
      offset += records.length;
      if (records.length < 100 || offset >= (data.totalCount || 0)) break;
    }
  } finally {
    props.setProperty('gmiDocsDone', JSON.stringify(Array.from(done).slice(-3000)));
    storeSeenHashes(seen);
  }
  if (abgelegt.length) {
    notifySlack(':package: *' + abgelegt.length + ' Plattform-Beleg' +
      (abgelegt.length === 1 ? '' : 'e') + ' aus GetMyInvoices abgelegt:*\n' +
      abgelegt.slice(0, 10).map(nm => '• ' + nm).join('\n') +
      (abgelegt.length > 10 ? '\n… und ' + (abgelegt.length - 10) + ' weitere' : ''));
  }
}

// ---------------------------------------------------------------------------
// Ausgangsrechnungen aus Lexware Office (lexoffice Public API): zieht stündlich
// alle festgeschriebenen Rechnungen und Gutschriften (keine Entwürfe) ab dem
// Stichtag und legt sie als PDF in Ausgangsrechnungen/<Jahr>/<YYYY-MM>/ ab.
// Getrennt vom Eingangs-Baum (<Jahr>/<YYYY-MM>/). Dedupe über Voucher-IDs.
// ---------------------------------------------------------------------------
function pullLexofficeInvoices() {
  if (!CONFIG.LEXOFFICE_API_KEY) return;
  const floor = CONFIG.BELEGPFLICHT_AB || '2026-07-01';
  const props = PropertiesService.getScriptProperties();
  const done = new Set(JSON.parse(props.getProperty('lexofficeDone') || '[]'));
  const headers = {
    Authorization: 'Bearer ' + CONFIG.LEXOFFICE_API_KEY,
    Accept: 'application/json',
  };
  const startTime = Date.now();
  const MAX_RUNTIME_MS = 240 * 1000;
  const abgelegt = [];
  try {
    let page = 0;
    aussen:
    while (page < 20) {
      if (Date.now() - startTime > MAX_RUNTIME_MS) break;
      const resp = UrlFetchApp.fetch(
        'https://api.lexoffice.io/v1/voucherlist?voucherType=invoice,creditnote' +
        '&voucherStatus=any&size=100&sort=voucherDate,DESC&page=' + page,
        { headers: headers, muteHttpExceptions: true });
      if (resp.getResponseCode() !== 200) {
        console.warn('lexoffice voucherlist HTTP ' + resp.getResponseCode() + ': ' +
          resp.getContentText().slice(0, 200));
        break;
      }
      const data = JSON.parse(resp.getContentText());
      const items = data.content || [];
      if (!items.length) break;
      for (const v of items) {
        if (Date.now() - startTime > MAX_RUNTIME_MS) break aussen;
        const datum = String(v.voucherDate || '').slice(0, 10);
        // Liste ist absteigend sortiert – vor dem Stichtag können wir abbrechen
        if (datum && datum < floor) break aussen;
        if (v.voucherStatus === 'draft') continue;
        if (done.has(v.id)) continue;
        try {
          // PDF: erst Dokument rendern lassen (liefert fileId), dann Datei laden
          const docResp = UrlFetchApp.fetch(
            'https://api.lexoffice.io/v1/' +
            (v.voucherType === 'creditnote' ? 'credit-notes' : 'invoices') +
            '/' + v.id + '/document',
            { headers: headers, muteHttpExceptions: true });
          if (docResp.getResponseCode() !== 200) { continue; }
          const fileId = JSON.parse(docResp.getContentText()).documentFileId;
          const pdfResp = UrlFetchApp.fetch('https://api.lexoffice.io/v1/files/' + fileId,
            { headers: { Authorization: headers.Authorization, Accept: 'application/pdf' },
              muteHttpExceptions: true });
          if (pdfResp.getResponseCode() !== 200) { continue; }

          const kunde = sanitize(v.contactName || 'Kunde');
          const nummer = v.voucherNumber ? '_' + sanitize(v.voucherNumber) : '';
          const betrag = v.totalAmount ? '_' + v.totalAmount + (v.currency || 'EUR') : '';
          const gutschrift = v.voucherType === 'creditnote' ? '_Gutschrift' : '';

          const root = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
          const aIt = root.getFoldersByName('Ausgangsrechnungen');
          const ausgang = aIt.hasNext() ? aIt.next() : root.createFolder('Ausgangsrechnungen');
          const yIt = ausgang.getFoldersByName(datum.slice(0, 4));
          const yearFolder = yIt.hasNext() ? yIt.next() : ausgang.createFolder(datum.slice(0, 4));
          const mIt = yearFolder.getFoldersByName(datum.slice(0, 7));
          const monthFolder = mIt.hasNext() ? mIt.next() : yearFolder.createFolder(datum.slice(0, 7));

          const base = datum + '_' + kunde + nummer + betrag + gutschrift;
          let name = base + '.pdf';
          let n = 2;
          while (monthFolder.getFilesByName(name).hasNext()) name = base + '_' + (n++) + '.pdf';
          monthFolder.createFile(pdfResp.getBlob().setName(name))
            .setDescription('rechnungs-agent:ausgang');
          done.add(v.id);
          abgelegt.push(name);
          Utilities.sleep(600); // Rate-Limit der lexoffice-API (2 Anfragen/Sek.)
        } catch (e) {
          console.warn('lexoffice Beleg ' + v.id + ' fehlgeschlagen: ' + e);
        }
      }
      if (data.last === true || items.length < 100) break;
      page++;
    }
  } finally {
    props.setProperty('lexofficeDone', JSON.stringify(Array.from(done).slice(-3000)));
  }
  if (abgelegt.length) {
    notifySlack(':outbox_tray: *' + abgelegt.length + ' Ausgangsrechnung' +
      (abgelegt.length === 1 ? '' : 'en') + ' aus Lexware Office abgelegt:*\n' +
      abgelegt.slice(0, 10).map(nm => '• ' + nm).join('\n') +
      (abgelegt.length > 10 ? '\n… und ' + (abgelegt.length - 10) + ' weitere' : ''));
  }
}

// ---------------------------------------------------------------------------
// GoCardless Bank Account Data (ehem. Nordigen): kostenlose PSD2-Anbindung für
// Konten fast aller europäischen Banken – als Alternative oder Ergänzung zu
// Qonto. Transaktionen werden ins Qonto-Format normalisiert, damit Beleg-Check
// und Monatsreport unverändert funktionieren. Free-Tier-Limit: 4 Abrufe pro
// Konto und Tag – täglicher Check (1×) + Monatsreport (1×) passen locker.
// ---------------------------------------------------------------------------
const GC_BASE = 'https://bankaccountdata.gocardless.com/api/v2';

function gcToken_() {
  const resp = UrlFetchApp.fetch(GC_BASE + '/token/new/', {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ secret_id: CONFIG.GOCARDLESS_SECRET_ID,
                              secret_key: CONFIG.GOCARDLESS_SECRET_KEY }),
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() !== 200) throw new Error('GoCardless-Token: ' + resp.getContentText().slice(0, 200));
  return JSON.parse(resp.getContentText()).access;
}

function gcFetch_(path, token) {
  const resp = UrlFetchApp.fetch(GC_BASE + path, {
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() !== 200) throw new Error('GoCardless ' + path + ': HTTP ' + resp.getResponseCode());
  return JSON.parse(resp.getContentText());
}

// Schritt 1 der Einrichtung: Institutionen (Banken) suchen, IDs stehen im Log
function gocardlessBankSuchen(suchbegriff) {
  if (!CONFIG.GOCARDLESS_SECRET_ID) { console.error('Erst GOCARDLESS_SECRET_ID/KEY in CONFIG eintragen.'); return; }
  if (!suchbegriff) { console.error("Aufruf: gocardlessBankSuchen('sparkasse')"); return; }
  const token = gcToken_();
  const alle = gcFetch_('/institutions/?country=de', token);
  const treffer = alle.filter(i => i.name.toLowerCase().indexOf(String(suchbegriff).toLowerCase()) !== -1);
  treffer.slice(0, 15).forEach(i => console.log(i.id + '  →  ' + i.name));
  console.log(treffer.length + ' Treffer. Weiter mit gocardlessVerbinden(\'INSTITUTION_ID\')');
}

// Schritt 2: Bank verbinden – erzeugt den Anmelde-Link (im Log und in Slack)
function gocardlessVerbinden(institutionId) {
  if (!institutionId) { console.error("Aufruf: gocardlessVerbinden('SPARKASSE_XXX')"); return; }
  const token = gcToken_();
  const resp = UrlFetchApp.fetch(GC_BASE + '/requisitions/', {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({ redirect: 'https://bankaccountdata.gocardless.com/',
                              institution_id: institutionId,
                              reference: 'rechnungs-agent-' + Date.now() }),
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() >= 300) { console.error('Requisition: ' + resp.getContentText().slice(0, 300)); return; }
  const req = JSON.parse(resp.getContentText());
  const props = PropertiesService.getScriptProperties();
  const ids = JSON.parse(props.getProperty('gcRequisitions') || '[]');
  ids.push(req.id);
  props.setProperty('gcRequisitions', JSON.stringify(ids));
  console.log('Öffne diesen Link und melde dich bei deiner Bank an:\n' + req.link);
  notifySlack(':bank: GoCardless-Verbindung angelegt – bitte Bank-Login abschließen:\n' + req.link);
}

// Verbundene GoCardless-Konten, normalisiert auf das Qonto-Konto-Format.
// Kontodetails werden gecacht (Details-Abrufe zählen gegen das Tageslimit).
function gocardlessAccounts_() {
  if (!CONFIG.GOCARDLESS_SECRET_ID || !CONFIG.GOCARDLESS_SECRET_KEY) return [];
  const props = PropertiesService.getScriptProperties();
  const reqIds = JSON.parse(props.getProperty('gcRequisitions') || '[]');
  if (!reqIds.length) return [];
  const cache = JSON.parse(props.getProperty('gcAccountCache') || '{}');
  const konten = [];
  try {
    const token = gcToken_();
    reqIds.forEach(rid => {
      const req = gcFetch_('/requisitions/' + rid + '/', token);
      if (req.status !== 'LN') return; // noch nicht verknüpft
      (req.accounts || []).forEach(accId => {
        if (!cache[accId]) {
          const det = gcFetch_('/accounts/' + accId + '/details/', token).account || {};
          cache[accId] = {
            name: det.name || det.product || det.ownerName ||
                  (req.institution_id || 'Bank').split('_')[0],
            iban: det.iban || '',
          };
        }
        konten.push({ id: accId, quelle: 'gocardless', status: 'active',
          is_external_account: false,
          name: cache[accId].name, iban: cache[accId].iban });
      });
    });
    props.setProperty('gcAccountCache', JSON.stringify(cache));
  } catch (e) {
    console.warn('GoCardless-Konten: ' + e);
  }
  return konten;
}

// Transaktionen eines GoCardless-Kontos, normalisiert auf das Qonto-Format
function gocardlessTransactions_(accId, fromIso, toIso) {
  const token = gcToken_();
  const data = gcFetch_('/accounts/' + accId + '/transactions/?date_from=' +
    String(fromIso).slice(0, 10) + '&date_to=' + String(toIso).slice(0, 10), token);
  return ((data.transactions || {}).booked || []).map(t => {
    const amt = parseFloat((t.transactionAmount || {}).amount || '0');
    return {
      transaction_id: t.transactionId || t.internalTransactionId || '',
      side: amt < 0 ? 'debit' : 'credit',
      amount: Math.abs(amt),
      currency: (t.transactionAmount || {}).currency || 'EUR',
      settled_at: t.bookingDate ? t.bookingDate + 'T12:00:00Z' : null,
      emitted_at: (t.valueDate || t.bookingDate || '') + 'T12:00:00Z',
      label: t.creditorName || t.debtorName ||
             (t.remittanceInformationUnstructured || '').slice(0, 60) || 'Buchung',
      reference: t.remittanceInformationUnstructured ||
                 (t.remittanceInformationUnstructuredArray || []).join(' ') || '',
      attachment_ids: [], // GoCardless kennt keine Beleg-Anhänge
      operation_type: 'transfer',
    };
  });
}

// Alle Bankkonten (Qonto und/oder GoCardless) für Beleg-Check + Monatsreport
function alleBankKonten_() {
  let konten = [];
  if (CONFIG.QONTO_API_SECRET) {
    konten = konten.concat(qontoAccounts_().map(a => { a.quelle = 'qonto'; return a; }));
  }
  konten = konten.concat(gocardlessAccounts_());
  return konten;
}

// Transaktionen quellenunabhängig abrufen
function kontoTransaktionen_(acc, fromIso, toIso) {
  if (acc.quelle === 'gocardless') return gocardlessTransactions_(acc.id, fromIso, toIso);
  return qontoTransactions_(acc.id, fromIso, toIso,
    acc.is_external_account ? 'emitted_at' : 'settled_at');
}

// Dauerbeleg? (Leasing, Miete, Sozialabgaben, Gehälter … – siehe CONFIG)
function istDauerbeleg_(t) {
  const s = ((t.label || '') + ' ' + (t.reference || '')).toLowerCase();
  return CONFIG.DAUERBELEG_MUSTER.some(m => s.indexOf(m) !== -1);
}

// Händlerbasierte Belegpflicht: liefert die zuständige Person ({name,slack})
// für dieses Label oder null (siehe CONFIG.BELEG_ZUSTAENDIG).
function belegZustaendig_(label) {
  const s = String(label || '').toLowerCase();
  for (const rule of (CONFIG.BELEG_ZUSTAENDIG || [])) {
    if (rule.muster.some(m => s.indexOf(m) !== -1)) return { name: rule.name, slack: rule.slack };
  }
  return null;
}

// Nimmt die Hashes bereits abgelegter PDFs (letzte ~2 Monate) in die geteilte
// Hash-Datei auf. Läuft bei jedem setup() – macht das Onboarding weiterer
// Postfächer sicher, ohne dass Duplikate entstehen.
function seedHashes() {
  const seen = loadSeenHashes();
  const cutoff = Utilities.formatDate(new Date(Date.now() - 60 * 86400000), 'Europe/Berlin', 'yyyy-MM');
  const root = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  const years = root.getFolders();
  while (years.hasNext()) {
    const y = years.next();
    if (!/^20\d\d$/.test(y.getName())) continue;
    const months = y.getFolders();
    while (months.hasNext()) {
      const mth = months.next();
      if (!/^20\d\d-\d\d$/.test(mth.getName()) || mth.getName() < cutoff) continue;
      const files = mth.getFiles();
      while (files.hasNext()) {
        const f = files.next();
        if (f.getMimeType() === 'application/pdf') seen.add(md5hex(f.getBlob().getBytes()));
      }
    }
  }
  storeSeenHashes(seen);
}

// ---------------------------------------------------------------------------
// Hauptlauf (wird stündlich getriggert)
// ---------------------------------------------------------------------------
// queryOverride: optionales Gmail-Suchfenster für Nachhol-Läufe (z. B.
// 'has:attachment filename:pdf after:2026/6/10 before:2026/7/2 …').
// Bei Nachhol-Läufen wird NIE an Qonto weitergeleitet – alte offene
// Rechnungen sind in der Regel längst bezahlt.
// ignoreProcessed: true = bereits als "verarbeitet" markierte Mails erneut
// prüfen (Reparatur-Läufe, z. B. nach einem Filter-Bugfix). Hash-Dedupe
// verhindert dabei Doppelablagen.
function processInvoices(queryOverride, ignoreProcessed) {
  const labelDone = getOrCreateLabel(CONFIG.LABEL_DONE);
  const labelReview = getOrCreateLabel(CONFIG.LABEL_REVIEW);
  const processedIds = loadProcessedIds();
  const seenHashes = loadSeenHashes();
  const startTime = Date.now();
  const MAX_RUNTIME_MS = 270 * 1000; // 4,5 min – Rest übernimmt der nächste Lauf

  const query = queryOverride || ('has:attachment filename:pdf newer_than:' + CONFIG.SEARCH_DAYS +
    'd -in:sent -in:trash -in:spam');
  // Gmail liefert pro Aufruf max. 100 Threads → paginieren (Deckel 500)
  let threads = [];
  for (let start = 0; ; start += 100) {
    const batch = GmailApp.search(query, start, 100);
    threads = threads.concat(batch);
    if (batch.length < 100 || threads.length >= 500) break;
  }

  try {
  outer:
  for (const thread of threads) {
    for (const message of thread.getMessages()) {
      if (Date.now() - startTime > MAX_RUNTIME_MS) break outer;

      const msgId = message.getId();
      if (!ignoreProcessed && processedIds.has(msgId)) continue;

      // Manche Versender (z. B. flaschenpost via Mailjet) deklarieren PDFs als
      // application/octet-stream → Dateiname .pdf zählt genauso.
      const pdfs = message.getAttachments({ includeInlineImages: false })
        .filter(a => a.getContentType() === 'application/pdf' || /\.pdf$/i.test(a.getName()));
      if (pdfs.length === 0) { processedIds.add(msgId); continue; }

      const result = classifyMessage(message, pdfs[0]);

      if (result.typ === 'keine_rechnung') {
        processedIds.add(msgId);
        continue;
      }

      // 1) Immer: PDF(s) in den Monatsordner legen (inhaltsgleiche überspringen).
      // Schickt ein Anbieter Invoice + Receipt im Paar (Stripe-Muster: Miro,
      // Anthropic …), zählt nur das Receipt – die Invoice ist redundant.
      const hatReceipt = pdfs.some(p => /receipt|quittung/i.test(p.getName()));
      const savedNames = [];
      for (const pdf of pdfs) {
        if (hatReceipt && pdfs.length > 1 && /invoice|rechnung/i.test(pdf.getName()) &&
            !/receipt|quittung/i.test(pdf.getName())) continue;
        const hash = md5hex(pdf.getBytes());
        if (seenHashes.has(hash)) continue;
        savedNames.push(saveToDrive(pdf, message, result));
        // Hash erst nach erfolgreicher Ablage merken – sonst gilt die Rechnung
        // bei einem Teil-Crash dauerhaft als erledigt (Hash-Vergiftung)
        seenHashes.add(hash);
      }
      if (savedNames.length === 0) {
        // Alles Duplikate – nichts abzulegen, nichts weiterzuleiten
        processedIds.add(msgId);
        thread.addLabel(labelDone);
        continue;
      }

      // 2) Offene Rechnung: an Qonto weiterleiten
      if (result.typ === 'offen' && CONFIG.QONTO_FORWARD_ADDRESS && !queryOverride) {
        GmailApp.sendEmail(
          CONFIG.QONTO_FORWARD_ADDRESS,
          message.getSubject() || 'Rechnung',
          'Automatisch weitergeleitet vom ADMKRS Rechnungs-Agent.\n\nAbsender: ' +
            message.getFrom(),
          { attachments: pdfs, name: 'ADMKRS Rechnungs-Agent' }
        );
      }

      // 3) Labels + Benachrichtigung
      if (result.typ === 'unklar') {
        thread.addLabel(labelReview);
        notifySlack(':warning: Unklare Rechnung von *' + senderDomain(message) +
          '* – bitte prüfen (Label "' + CONFIG.LABEL_REVIEW + '").\nBetreff: ' +
          message.getSubject());
      } else {
        thread.addLabel(labelDone);
        if (result.typ === 'offen') {
          notifySlack(':moneybag: Offene Rechnung: *' + (result.anbieter || senderDomain(message)) +
            '*' + (result.betrag ? ', ' + result.betrag + ' ' + (result.waehrung || 'EUR') : '') +
            (result.faelligkeit ? ', fällig ' + result.faelligkeit : '') +
            (CONFIG.QONTO_FORWARD_ADDRESS && !queryOverride ? ' → an Qonto übergeben.' :
              (queryOverride ? ' (Nachhol-Lauf – nicht an Qonto weitergeleitet)' : ' (Qonto-Weiterleitung ist deaktiviert!)')) +
            '\nAbgelegt als: ' + savedNames.join(', '));
        }
      }

      processedIds.add(msgId);
    }
  }
  } finally {
    storeProcessedIds(processedIds);
    storeSeenHashes(seenHashes);
  }
}

// ---------------------------------------------------------------------------
// Klassifizierung: Stufe 1 Absenderlisten, Stufe 2 Claude (falls API-Key)
// Rückgabe: { typ: 'offen'|'beleg'|'unklar'|'keine_rechnung', anbieter, betrag, waehrung, rechnungsdatum, faelligkeit }
// ---------------------------------------------------------------------------
function classifyMessage(message, pdf) {
  const domain = senderDomain(message);
  const haystack = ((message.getSubject() || '') + ' ' + pdf.getName() + ' ' +
    message.getPlainBody().slice(0, 2000)).toLowerCase();
  const hasKeyword = CONFIG.KEYWORDS.some(k => haystack.indexOf(k) !== -1);

  // Stufe 1: Listen bestimmen den Typ (offen/beleg)
  let typ = null;
  if (CONFIG.DIENSTLEISTER_DOMAINS.some(d => domain.endsWith(d))) {
    typ = 'offen';
  } else if (CONFIG.BELEG_DOMAINS.some(d => domain.endsWith(d))) {
    if (!hasKeyword) return { typ: 'keine_rechnung' };
    typ = 'beleg';
  }

  // Stufe 2: Claude liest IMMER die Metadaten (Anbieter, RE-Nummer, Betrag,
  // Datum) für die saubere Benennung – und entscheidet den Typ nur dann,
  // wenn Stufe 1 den Absender nicht kannte
  let ai = null;
  if (CONFIG.ANTHROPIC_API_KEY) ai = classifyWithClaude(message, pdf);

  if (!typ) {
    if (ai) typ = ai.typ;
    else typ = hasKeyword ? 'unklar' : 'keine_rechnung';
  }
  if (typ === 'keine_rechnung') return { typ: 'keine_rechnung' };

  const meta = (ai && ai.typ !== 'keine_rechnung') ? ai : {};
  return {
    typ: typ,
    anbieter: meta.anbieter || (typ === 'offen' ? domain : null),
    rechnungsnummer: meta.rechnungsnummer || null,
    betrag: meta.betrag || null,
    waehrung: meta.waehrung || null,
    rechnungsdatum: meta.rechnungsdatum || null,
    faelligkeit: meta.faelligkeit || null,
  };
}

function classifyWithClaude(message, pdf) {
  const prompt =
    'Du bekommst eine E-Mail und ein PDF. Analysiere, ob es eine Rechnung ist.\n' +
    'E-Mail-Absender: ' + message.getFrom() + '\n' +
    'Betreff: ' + message.getSubject() + '\n' +
    'Mailtext (Anfang): ' + message.getPlainBody().slice(0, 1500) + '\n\n' +
    'Antworte NUR mit einem JSON-Objekt, ohne Markdown:\n' +
    '{"ist_rechnung": true|false,\n' +
    ' "status": "offen"|"bezahlt"|"unklar",  // "offen" = muss noch überwiesen werden (Zahlungsziel, IBAN, "zahlbar bis"); "bezahlt" = bereits per Lastschrift/Kreditkarte beglichen\n' +
    ' "anbieter": "der RECHNUNGSSTELLER/Aussteller/Lieferant — die Firma, die die Rechnung stellt und das Geld bekommt, NIEMALS der Empfänger/Kunde. Der Kunde ist fast immer ADMKRS (ADMKRS GmbH) — ADMKRS also NIE als anbieter. Kurz, ohne Rechtsform-Zusätze wie GmbH wenn möglich",\n' +
    ' "rechnungsnummer": "RE-2026-123 oder null",\n' +
    ' "betrag": "123.45", "waehrung": "EUR",\n' +
    ' "rechnungsdatum": "YYYY-MM-DD", "faelligkeit": "YYYY-MM-DD oder null"}';

  const payload = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: {
            type: 'base64', media_type: 'application/pdf',
            data: Utilities.base64Encode(pdf.getBytes()) } },
        { type: 'text', text: prompt },
      ],
    }],
  };

  try {
    const resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-api-key': CONFIG.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    if (resp.getResponseCode() !== 200) {
      console.warn('Claude-API-Fehler: ' + resp.getContentText().slice(0, 300));
      return null;
    }
    const text = JSON.parse(resp.getContentText()).content[0].text;
    const data = JSON.parse(text.replace(/```json|```/g, '').trim());
    if (!data.ist_rechnung) return { typ: 'keine_rechnung' };
    return {
      typ: data.status === 'offen' ? 'offen' : (data.status === 'bezahlt' ? 'beleg' : 'unklar'),
      anbieter: data.anbieter || null,
      rechnungsnummer: data.rechnungsnummer || null,
      betrag: data.betrag || null,
      waehrung: data.waehrung || null,
      rechnungsdatum: data.rechnungsdatum || null,
      faelligkeit: data.faelligkeit || null,
    };
  } catch (e) {
    console.warn('Claude-Klassifizierung fehlgeschlagen: ' + e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Drive-Ablage: /<Zielordner>/<YYYY-MM>/<YYYY-MM-DD>_<Anbieter>[_Betrag].pdf
// ---------------------------------------------------------------------------
function saveToDrive(pdf, message, result) {
  const date = result.rechnungsdatum
    ? new Date(result.rechnungsdatum) : message.getDate();
  const ym = Utilities.formatDate(date, 'Europe/Berlin', 'yyyy-MM');
  const ymd = Utilities.formatDate(date, 'Europe/Berlin', 'yyyy-MM-dd');

  // Struktur: <Zielordner>/<YYYY>/<YYYY-MM>/
  const root = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  const yearName = ym.slice(0, 4);
  const yIt = root.getFoldersByName(yearName);
  const yearFolder = yIt.hasNext() ? yIt.next() : root.createFolder(yearName);
  const it = yearFolder.getFoldersByName(ym);
  const monthFolder = it.hasNext() ? it.next() : yearFolder.createFolder(ym);

  // Naming-Convention: <Rechnungsdatum>_<Lieferant>_<RE-Nummer>_<Betrag><Währung>.pdf
  const vendor = sanitize(result.anbieter || senderDomain(message).replace(/\.[a-z]+$/, ''));
  const nummer = result.rechnungsnummer ? '_' + sanitize(result.rechnungsnummer) : '';
  const amount = result.betrag ? '_' + result.betrag + (result.waehrung || 'EUR') : '';
  const base = ymd + '_' + vendor + nummer + amount;
  let name = base + '.pdf';

  // Dedupe: gleicher Name im Monatsordner → Suffix
  let n = 2;
  while (monthFolder.getFilesByName(name).hasNext()) {
    name = base + '_' + (n++) + '.pdf';
  }
  monthFolder.createFile(pdf.copyBlob().setName(name)).setDescription('rechnungs-agent:benannt');
  return ym + '/' + name;
}

// ---------------------------------------------------------------------------
// Helfer
// ---------------------------------------------------------------------------
function senderDomain(message) {
  const m = message.getFrom().match(/@([\w.-]+)/);
  return m ? m[1].toLowerCase() : 'unbekannt';
}

function sanitize(s) {
  return String(s).replace(/[^\wäöüÄÖÜß.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

function getOrCreateLabel(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

function notifySlack(text) {
  if (!CONFIG.SLACK_WEBHOOK_URL) return;
  try {
    UrlFetchApp.fetch(CONFIG.SLACK_WEBHOOK_URL, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({ text: text }), muteHttpExceptions: true,
    });
  } catch (e) { console.warn('Slack-Fehler: ' + e); }
}

function md5hex(bytes) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, bytes)
    .map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
}

// Geteilte Hash-Datei im Drive-Ordner: alle Postfach-Scripts (b@, billing@, …)
// lesen und schreiben dieselbe Datei, damit dieselbe Rechnung – egal in
// welchem Postfach sie ankommt – nur einmal abgelegt wird.
const HASH_FILE_NAME = '.rechnungs-agent-hashes.json';

function hashFile_() {
  const root = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  const it = root.getFilesByName(HASH_FILE_NAME);
  return it.hasNext() ? it.next() : root.createFile(HASH_FILE_NAME, '[]', 'application/json');
}

function loadSeenHashes() {
  let arr = [];
  try { arr = JSON.parse(hashFile_().getBlob().getDataAsString() || '[]'); } catch (e) {}
  return new Set(arr);
}

function storeSeenHashes(set) {
  hashFile_().setContent(JSON.stringify(Array.from(set).slice(-5000)));
}

// ---------------------------------------------------------------------------
// Monatsreport: erzeugt am 1. des Monats im BelegCheck-Sheet zwei neue Tabs
// für den Vormonat ("<Monat> <Jahr>" = Qonto-Konten, "Amex <Monat> 'YY") mit
// vorbefüllter BELEG-Checkbox und meldet die Zusammenfassung in Slack.
// Beleg-Status: Qonto-Konten = Anhang an der Qonto-Transaktion,
// AMEX = abgelegtes PDF im Drive-Ordner (Match über Dateinamen: Betrag +
// Datum + Anbieter) oder Beleg-Zuordnung in GetMyInvoices (Betrag + Datum ±5 Tage).
// ---------------------------------------------------------------------------
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

function monthlyBelegReport() {
  const now = new Date();
  buildBelegReport(new Date(now.getFullYear(), now.getMonth() - 1, 1));
}

// Zum manuellen Testen: Report für den LAUFENDEN Monat
function belegReportAktuellerMonat() {
  const now = new Date();
  buildBelegReport(new Date(now.getFullYear(), now.getMonth(), 1));
}

// ---------------------------------------------------------------------------
// Sortiert die Drive-Belege des laufenden + Vormonats in die Konto-Unterordner
// AMEX/ bzw. QONTO/ ein und hängt den Konto-Tag an den Dateinamen. Matcht JEDE
// Abbuchung gegen ihren Drive-Beleg – auch wenn die Rechnung bereits als Anhang
// in Qonto hängt (der Beleg-Check überspringt solche Transaktionen sonst, sodass
// die Drive-Kopie ungetaggt bliebe). Idempotent: getaggte Dateien werden nicht
// erneut angefasst.
// ---------------------------------------------------------------------------
function sortiereBelege_() {
  if (!CONFIG.QONTO_API_SECRET && !CONFIG.GOCARDLESS_SECRET_ID) return;
  const now = new Date();
  const floor = new Date(CONFIG.BELEGPFLICHT_AB || '2026-07-01');
  const floorMonth = new Date(floor.getFullYear(), floor.getMonth(), 1);
  const konten = alleBankKonten_();
  [0, -1].forEach(off => {
    const ms = new Date(now.getFullYear(), now.getMonth() + off, 1);
    if (ms.getTime() < floorMonth.getTime()) return;
    // Breites Transaktionsfenster ab 20 Tage vor Monatsanfang: Zahlungen liegen
    // oft vor dem Rechnungsdatum (AMEX-Autorisierung) oder im Vormonat.
    const txFrom = new Date(ms.getTime() - 20 * 86400000);
    const txTo = new Date(Math.min(now.getTime(),
      new Date(ms.getFullYear(), ms.getMonth() + 1, 1).getTime() + 10 * 86400000));
    const driveMap = driveDocMap_(ms, true);   // nur Dateien DIESES Monatsordners (1:1-Verbrauch)
    konten.forEach(acc => {
      if (acc.status === 'closed') return;
      const txs = kontoTransaktionen_(acc, txFrom.toISOString(), txTo.toISOString());
      txs.sort((a, b) => new Date(a.settled_at || a.emitted_at) - new Date(b.settled_at || b.emitted_at));
      txs.forEach(t => {
        const betrag = (t.side === 'debit' ? -1 : 1) * (t.amount || 0);
        if (betrag >= 0) return;   // nur Abbuchungen tragen einen Eingangsbeleg
        const datum = new Date(t.settled_at || t.emitted_at);
        driveHasDoc_(driveMap, Math.abs(betrag), datum.getTime(), t.label, kontoTag_(acc));
      });
    });
  });
  // Nachlauf: eindeutige Anbieter ohne bestätigte Buchung per Fallback zuordnen
  try { fallbackKontoSortierung_(); } catch (e) { /* nie blockieren */ }
}

// Belege des laufenden Monats, die benannt aber (mangels Buchung) ungetaggt sind,
// per CONFIG.KONTO_FALLBACK (Anbieter → Standardkonto) taggen + einsortieren.
function fallbackKontoSortierung_() {
  const map = CONFIG.KONTO_FALLBACK || {};
  const keys = Object.keys(map);
  if (!keys.length) return;
  const now = new Date();
  const floor = new Date(CONFIG.BELEGPFLICHT_AB || '2026-07-01');
  if (new Date(now.getFullYear(), now.getMonth(), 1).getTime() <
      new Date(floor.getFullYear(), floor.getMonth(), 1).getTime()) return;
  const root = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  const ym = Utilities.formatDate(now, 'Europe/Berlin', 'yyyy-MM');
  const yIt = root.getFoldersByName(ym.slice(0, 4));
  if (!yIt.hasNext()) return;
  const mIt = yIt.next().getFoldersByName(ym);
  if (!mIt.hasNext()) return;
  const mo = mIt.next();
  const files = mo.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    if (f.getMimeType() !== 'application/pdf') continue;
    // nur Convention-Namen OHNE Konto-Suffix (getaggte matchen die Regex nicht)
    const m = f.getName().match(/^\d{4}-\d{2}-\d{2}_(.+?)_\d+(?:\.\d+)?[A-Za-z]{3}(?:_\d+)?\.pdf$/i);
    if (!m) continue;
    const vendor = m[1].toLowerCase();
    let tag = null;
    for (const key of keys) { if (vendor.indexOf(key.toLowerCase()) !== -1) { tag = map[key]; break; } }
    if (!tag) continue;
    try {
      f.setName(f.getName().replace(/\.pdf$/i, '_' + tag + '.pdf'));
      const subName = /^AMEX/i.test(tag) ? 'AMEX' : 'QONTO';
      const it = mo.getFoldersByName(subName);
      f.moveTo(it.hasNext() ? it.next() : mo.createFolder(subName));
    } catch (e) { /* nie blockieren */ }
  }
}

// Manuell ausführbar: Juli/aktuellen Monat sofort in AMEX/QONTO einsortieren
function belegeSortieren() {
  sortiereBelege_();
}

// Berechnet die Soll-Zeilen beider Tabs für einen Monat (ohne Sheet-Zugriff)
function berechneBelegRows_(monthStart) {
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
  // Die AMEX-Abfrage filtert nach emitted_at (Autorisierung), angezeigt wird
  // aber die Wertstellung – deshalb breiter abfragen und unten strikt nach dem
  // angezeigten (Berliner) Monat filtern, sonst rutschen Monatswechsel-
  // Buchungen in den falschen Tab
  const fromIso = new Date(monthStart.getTime() - 5 * 86400000).toISOString();
  const toIso = new Date(monthEnd.getTime() + 86400000).toISOString();
  const zielYm = Utilities.formatDate(monthStart, 'Europe/Berlin', 'yyyy-MM');
  const m = monthStart.getMonth(), y = monthStart.getFullYear();
  const qontoTabName = MONATE[m] + ' ' + y;
  const amexTabName = "Amex " + MONATE[m] + " '" + String(y).slice(2);

  // Alle Konten aus der Qonto-API – inkl. der extern aggregierten AMEX-Karten.
  // Beleg-Status: Qonto-Konten = Anhang an der Transaktion; AMEX = Match gegen
  // GMI-Belegzuordnung (Betrag + Datum ±5 Tage), sonst offen.
  const accounts = alleBankKonten_();
  const gmiMap = gmiDocMap_(monthStart, monthEnd);
  const driveMap = driveDocMap_(monthStart);
  const qontoRows = [], amexRows = [];

  accounts.forEach(acc => {
    if (acc.status === 'closed') return;
    // Externe Konten haben kein settled_at → nach emitted_at filtern
    const txs = kontoTransaktionen_(acc, fromIso, toIso);
    const kartenName = (acc.name || 'AMEX') +
      (acc.is_external_account && acc.account_number ? ' …' + String(acc.account_number).slice(-5) : '');
    txs.forEach(t => {
      const betrag = (t.side === 'debit' ? -1 : 1) * (t.amount || 0);
      const datum = t.settled_at || t.emitted_at;
      const datumStr = datum ? Utilities.formatDate(new Date(datum), 'Europe/Berlin', 'dd.MM.yyyy') : '';
      // Nur Buchungen, deren Wertstellung im Zielmonat liegt
      if (!datum || Utilities.formatDate(new Date(datum), 'Europe/Berlin', 'yyyy-MM') !== zielYm) return;
      if (acc.is_external_account) {
        const hasDoc = betrag >= 0 ||
          (t.attachment_ids && t.attachment_ids.length > 0) ||
          istDauerbeleg_(t) ||
          gmiHasDoc_(gmiMap, Math.abs(betrag), new Date(datum).getTime()) ||
          driveHasDoc_(driveMap, Math.abs(betrag), new Date(datum).getTime(), t.label, kontoTag_(acc));
        amexRows.push([0, hasDoc, datumStr, t.label || '', t.reference || '',
          betrag, t.currency || 'EUR', kartenName]);
      } else {
        const hasDoc = (t.attachment_ids && t.attachment_ids.length > 0) ||
          betrag >= 0 || t.operation_type === 'qonto_fee' ||
          istDauerbeleg_(t) ||
          driveHasDoc_(driveMap, Math.abs(betrag), new Date(datum).getTime(), t.label, kontoTag_(acc));
        qontoRows.push([0, hasDoc, datumStr,
          Utilities.formatDate(new Date(t.emitted_at || datum), 'Europe/Berlin', 'dd.MM.yyyy'),
          t.label || '', t.operation_type || '', t.reference || '',
          betrag, t.currency || 'EUR', acc.name || '',
          t.attachment_ids ? t.attachment_ids.length : 0]);
      }
    });
  });

  const sortByDate = (a, b) => a[2].split('.').reverse().join('') < b[2].split('.').reverse().join('') ? -1 : 1;
  qontoRows.sort(sortByDate); amexRows.sort(sortByDate);
  qontoRows.forEach((r, i) => r[0] = i + 1);
  amexRows.forEach((r, i) => r[0] = i + 1);

  return {
    qontoTabName: qontoTabName, amexTabName: amexTabName,
    qontoHeader: ['Index', 'BELEG', 'Wertstellung', 'Buchung', 'Gegenpartei', 'Transaktionsart',
      'Verwendungszweck', 'Betrag', 'Währung', 'Konto', 'Anhänge in Qonto'],
    amexHeader: ['Index', 'BELEG', 'Datum', 'Händler', 'Verwendungszweck', 'Betrag', 'Währung', 'Karte'],
    qontoRows: qontoRows, amexRows: amexRows,
  };
}

function buildBelegReport(monthStart) {
  if (!CONFIG.QONTO_API_SECRET) return;
  const m = monthStart.getMonth(), y = monthStart.getFullYear();
  const d = berechneBelegRows_(monthStart);
  const qontoTabName = d.qontoTabName, amexTabName = d.amexTabName;
  const qontoRows = d.qontoRows, amexRows = d.amexRows;

  const ss = SpreadsheetApp.openById(CONFIG.BELEGCHECK_SHEET_ID);
  const w1 = writeBelegTab_(ss, qontoTabName, d.qontoHeader, qontoRows);
  const w2 = writeBelegTab_(ss, amexTabName, d.amexHeader, amexRows);

  const fehltQ = qontoRows.filter(r => r[1] === false).length;
  const fehltA = amexRows.filter(r => r[1] === false).length;
  notifySlack(':bar_chart: *BelegCheck ' + MONATE[m] + ' ' + y + ' erstellt*\n' +
    '• ' + qontoTabName + ': ' + (qontoRows.length - fehltQ) + '/' + qontoRows.length +
    ' Belege da' + (w1 ? '' : ' (Tab existierte schon – NICHT überschrieben)') + '\n' +
    '• ' + amexTabName + ': ' + (amexRows.length - fehltA) + '/' + amexRows.length +
    ' Belege da' + (w2 ? '' : ' (Tab existierte schon – NICHT überschrieben)') + '\n' +
    (fehltQ + fehltA > 0 ? ':point_right: ' + (fehltQ + fehltA) + ' offene Belege – Details im Sheet.' : ':tada: Alles vollständig!'));
}

// ---------------------------------------------------------------------------
// Tägliches Sheet-Update: hält die BelegCheck-Tabs des LAUFENDEN Monats aktuell.
// Neue Transaktionen werden unten angehängt; offene BELEG-Checkboxen werden
// gesetzt, sobald der Beleg inzwischen da ist. Häkchen werden NIE entfernt —
// was die Buchhalterin (oder ein früherer Lauf) abgehakt hat, bleibt abgehakt.
// Abgleich über Datum+Betrag+Text als Multiset (mehrere gleiche Buchungen pro
// Tag, z. B. Anthropic-Kleinstbeträge, werden korrekt gezählt).
// ---------------------------------------------------------------------------
function updateBelegSheets_() {
  if (!CONFIG.BELEGCHECK_SHEET_ID || !CONFIG.QONTO_API_SECRET) return;
  const now = new Date();
  const floor = new Date(CONFIG.BELEGPFLICHT_AB || '2026-07-01');
  const floorMonth = new Date(floor.getFullYear(), floor.getMonth(), 1);
  const ss = SpreadsheetApp.openById(CONFIG.BELEGCHECK_SHEET_ID);
  // Datums-Vergleich in der Zeitzone des Spreadsheets: Sheets-Datumszellen sind
  // Mitternacht in Sheet-TZ – ein hartkodiertes 'Europe/Berlin' kippt sonst bei
  // abweichender TZ auf den Vortag und der Abgleich hängt Duplikate an
  let sheetTz = 'Europe/Berlin';
  try { const t = ss.getSpreadsheetTimeZone(); if (typeof t === 'string' && t) sheetTz = t; } catch (e) { /* Fallback bleibt */ }
  const changes = [];

  // Aktuellen UND Vormonat pflegen: nachgelieferte Buchungen (z. B. nach einer
  // erneuerten AMEX-Verbindung) landen sonst nie mehr im Vormonats-Tab
  [0, -1].forEach(off => {
  const monthStart = new Date(now.getFullYear(), now.getMonth() + off, 1);
  if (monthStart.getTime() < floorMonth.getTime()) return;

  const d = berechneBelegRows_(monthStart);

  [{ name: d.qontoTabName, header: d.qontoHeader, rows: d.qontoRows, amex: false },
   { name: d.amexTabName, header: d.amexHeader, rows: d.amexRows, amex: true }].forEach(tab => {
    const sh = ss.getSheetByName(tab.name);
    if (!sh) {
      writeBelegTab_(ss, tab.name, tab.header, tab.rows);
      changes.push(tab.name + ': neu angelegt (' + tab.rows.length + ' Zeilen)');
      return;
    }
    // Spalten am KOPFTEXT des Tabs finden statt an festen Positionen: Die
    // Buchhaltung baut die Tabs um (zusätzliche Häkchen-Spalte, umbenannte
    // erste Spalte). Solange Datum, Betrag und Gegenpartei benannt sind,
    // pflegt der Agent das Tab in DEREN Struktur weiter, statt es liegen zu
    // lassen. Fehlt eine dieser Spalten, wird das Tab in Ruhe gelassen.
    const breite = Math.max(sh.getLastColumn(), tab.header.length);
    const kopf = sh.getRange(1, 1, 1, breite).getValues()[0]
      .map(x => String(x || '').trim().toLowerCase());
    const spalte = (...namen) => {
      for (let n = 0; n < namen.length; n++) {
        const i = kopf.indexOf(namen[n]);
        if (i !== -1) return i;
      }
      return -1;
    };
    const cBeleg = spalte('beleg');
    const cDatum = spalte('datum', 'wertstellung', 'wertstellungsdatum');
    const cBetrag = spalte('betrag');
    const cName = tab.amex ? spalte('händler', 'haendler', 'merchant')
                           : spalte('gegenpartei', 'name der gegenpartei');
    if (cBeleg === -1 || cDatum === -1 || cBetrag === -1 || cName === -1) return;

    // Jede Standard-Spalte auf ihre Position in DIESEM Tab abbilden
    const mapping = tab.header.map(h => kopf.indexOf(String(h).trim().toLowerCase()));
    const zuSheetZeile = r => {
      const out = new Array(breite).fill('');
      r.forEach((val, i) => { if (mapping[i] !== -1) out[mapping[i]] = val; });
      if (mapping[0] === -1) out[0] = r[0];          // Index-Spalte umbenannt
      out[cBeleg] = r[1];
      out[cDatum] = r[2];
      out[cName] = tab.amex ? r[3] : r[4];
      out[cBetrag] = tab.amex ? r[5] : r[7];
      return out;
    };

    // Datum kann als String ODER Date-Objekt aus dem Sheet kommen
    const normDate = v => (v instanceof Date)
      ? Utilities.formatDate(v, sheetTz, 'dd.MM.yyyy') : String(v || '').trim();
    // Schlüssel aus einer SHEET-Zeile (Spalten nach Kopftext) …
    const keySheet = r => normDate(r[cDatum]) + '|' +
      Number(r[cBetrag]).toFixed(2) + '|' + String(r[cName]).trim();
    // … und aus einer frisch berechneten Zeile (immer Standard-Reihenfolge)
    const keyOf = r => normDate(r[2]) + '|' +
      Number(tab.amex ? r[5] : r[7]).toFixed(2) + '|' +
      String(tab.amex ? r[3] : r[4]).trim();

    const lastRow = sh.getLastRow();
    const existing = lastRow > 1 ? sh.getRange(2, 1, lastRow - 1, breite).getValues() : [];
    const exist = {};        // key -> [{sheetRow, checked}]
    existing.forEach((r, i) => {
      const k = keySheet(r);
      (exist[k] = exist[k] || []).push({ sheetRow: i + 2, checked: r[cBeleg] === true });
    });

    // Pass 1: neue Transaktionen finden (Multiset-Konsum)
    const budget = {};       // key -> noch nicht zugeordnete Sheet-Zeilen
    Object.keys(exist).forEach(k => budget[k] = exist[k].length);
    const toAppend = [];
    const matchedTrue = {};  // key -> Soll-"Beleg da"-Anzahl unter den GEMATCHTEN Zeilen
    tab.rows.forEach(r => {
      const k = keyOf(r);
      if (budget[k] > 0) {
        budget[k]--;
        if (r[1] === true) matchedTrue[k] = (matchedTrue[k] || 0) + 1;
      } else {
        toAppend.push(r);
      }
    });

    // Pass 2: Checkboxen nachziehen (nur unchecked -> checked, nie umgekehrt)
    let checkedNow = 0;
    Object.keys(matchedTrue).forEach(k => {
      const rowsK = exist[k] || [];
      const sheetTrue = rowsK.filter(x => x.checked).length;
      let delta = matchedTrue[k] - sheetTrue;
      rowsK.forEach(x => {
        if (delta > 0 && !x.checked) {
          sh.getRange(x.sheetRow, cBeleg + 1).setValue(true);
          delta--; checkedNow++;
        }
      });
    });

    // Pass 3: neue Zeilen anhängen (Index fortlaufend)
    if (toAppend.length) {
      toAppend.forEach((r, i) => r[0] = existing.length + i + 1);
      const startRow = lastRow + 1;
      sh.getRange(startRow, 1, toAppend.length, breite)
        .setValues(toAppend.map(zuSheetZeile));
      sh.getRange(startRow, cBeleg + 1, toAppend.length, 1).insertCheckboxes();
      // insertCheckboxes setzt frisch eingefügte Kästchen auf false → true-Werte nachziehen
      toAppend.forEach((r, i) => {
        if (r[1] === true) sh.getRange(startRow + i, cBeleg + 1).setValue(true);
      });
    }
    if (toAppend.length || checkedNow) {
      changes.push(tab.name + ': +' + toAppend.length + ' neu, ' + checkedNow + ' abgehakt');
    }
  });
  });

  if (changes.length) {
    notifySlack(':bar_chart: *BelegCheck aktualisiert*\n' + changes.map(c => '• ' + c).join('\n'));
  }
}

// Manuell ausführbar: BelegCheck-Tabs sofort auf den neuesten Stand bringen
function belegSheetsAktualisieren() {
  updateBelegSheets_();
}

// Legt den Tab NEU an; existiert er bereits, wird nichts überschrieben (return false)
function writeBelegTab_(ss, name, header, rows) {
  if (ss.getSheetByName(name)) return false;
  const sh = ss.insertSheet(name);
  sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
  if (rows.length) {
    sh.getRange(2, 1, rows.length, header.length).setValues(rows);
    sh.getRange(2, 2, rows.length, 1).insertCheckboxes();
  }
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, header.length);
  return true;
}

// --- Qonto-API-Helfer ---
function qontoFetch_(path) {
  const resp = UrlFetchApp.fetch('https://thirdparty.qonto.com' + path, {
    headers: { Authorization: CONFIG.QONTO_API_LOGIN + ':' + CONFIG.QONTO_API_SECRET },
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() !== 200) {
    throw new Error('Qonto-API ' + resp.getResponseCode() + ': ' + resp.getContentText().slice(0, 200));
  }
  return JSON.parse(resp.getContentText());
}

function qontoAccounts_() {
  // Wichtig: /v2/bank_accounts liefert (entgegen der Doku) auch die extern
  // aggregierten AMEX-Karten (is_external_account: true) – der dokumentierte
  // Weg über /v2/organization?include_external_accounts=true tut es NICHT.
  const data = qontoFetch_('/v2/bank_accounts?per_page=100');
  return data.bank_accounts || [];
}

function qontoTransactions_(accountId, fromIso, toIso, dateField) {
  const f = dateField || 'settled_at';
  const out = [];
  let page = 1;
  while (page) {
    const data = qontoFetch_('/v2/transactions?bank_account_id=' + accountId +
      '&' + f + '_from=' + encodeURIComponent(fromIso) +
      '&' + f + '_to=' + encodeURIComponent(toIso) +
      '&per_page=100&current_page=' + page);
    out.push.apply(out, data.transactions || []);
    page = data.meta && data.meta.next_page;
  }
  return out;
}

// --- GMI-Beleg-Status für AMEX: Map Betrag → [{time, hasDoc}] ---
function gmiDocMap_(fromDate, toDate) {
  const map = {};
  if (!CONFIG.GMI_API_KEY) return map;
  const fmt = d => Utilities.formatDate(d, 'Europe/Berlin', 'yyyy-MM-dd');
  let offset = 0;
  try {
    while (true) {
      const resp = UrlFetchApp.fetch('https://api.getmyinvoices.com/accounts/v3/bankTransactions' +
        '?startDateFilter=' + fmt(new Date(fromDate.getTime() - 5 * 86400000)) +
        '&endDateFilter=' + fmt(new Date(toDate.getTime() + 5 * 86400000)) +
        '&limit=200&offset=' + offset,
        { headers: { 'X-API-KEY': CONFIG.GMI_API_KEY, Accept: 'application/json' }, muteHttpExceptions: true });
      if (resp.getResponseCode() !== 200) break;
      const data = JSON.parse(resp.getContentText());
      const records = data.records || [];
      records.forEach(t => {
        const key = Math.abs(t.amount || 0).toFixed(2);
        (map[key] = map[key] || []).push({
          time: new Date(t.bookingDate).getTime(),
          hasDoc: !!(t.assignedDocuments && t.assignedDocuments.length) || !!t.ignoreComment,
        });
      });
      offset += records.length;
      if (records.length < 200 || offset >= (data.totalCount || 0)) break;
    }
  } catch (e) { console.warn('GMI-Abgleich fehlgeschlagen: ' + e); }
  return map;
}

function gmiHasDoc_(map, amountAbs, dateMs) {
  const list = map[amountAbs.toFixed(2)] || [];
  let best = null;
  list.forEach(e => {
    const d = Math.abs(e.time - dateMs);
    if (d <= 5 * 86400000 && (!best || d < best.d)) best = { d: d, hasDoc: e.hasDoc };
  });
  return best ? best.hasDoc : false;
}

// ---------------------------------------------------------------------------
// Drive-Beleg-Status für AMEX: liest die Dateinamen der Monatsordner
// (Vormonat/Monat/Folgemonat) und matcht Transaktionen gegen abgelegte PDFs.
// EUR-Belege: exakter Betrag + Datum ±10 Tage. Fremdwährung (z.B. USD):
// Anbieter muss im Dateinamen stehen + Betrag ±30% (Wechselkurs) + Datum ±10 Tage.
// Jede Datei wird höchstens einer Transaktion zugeordnet. Beim Match wird das
// Zahlungskonto als Suffix an den Dateinamen gehängt (_Qonto-<Konto> bzw.
// _AMEX-<Inhaber>); ein manuelles _Kasse-Suffix wird ebenfalls toleriert.
// ---------------------------------------------------------------------------
function driveDocMap_(monthStart, exactOnly) {
  const entries = [];
  const root = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  // Ohne exactOnly zwei Monate zurückschauen: das 35-Tage-Fenster des
  // Beleg-Checks überspannt am Monatsanfang bis zu zwei Monatsordner,
  // und Rechnungsdaten liegen oft nochmal Wochen vor der Abbuchung
  (exactOnly ? [0] : [-2, -1, 0, 1]).forEach(off => {
    const ym = Utilities.formatDate(
      new Date(monthStart.getFullYear(), monthStart.getMonth() + off, 1),
      'Europe/Berlin', 'yyyy-MM');
    const yIt = root.getFoldersByName(ym.slice(0, 4));
    if (!yIt.hasNext()) return;
    const mIt = yIt.next().getFoldersByName(ym);
    if (!mIt.hasNext()) return;
    const monthFolder = mIt.next();
    // Monatsordner-Root plus die Konto-Unterordner AMEX/QONTO scannen
    const scanFolders = [monthFolder];
    ['AMEX', 'QONTO'].forEach(sub => {
      const it = monthFolder.getFoldersByName(sub);
      if (it.hasNext()) scanFolders.push(it.next());
    });
    scanFolders.forEach(sf => {
      const files = sf.getFiles();
      while (files.hasNext()) {
        const f = files.next();
        const m = f.getName().match(/^(\d{4}-\d{2}-\d{2})_(.+)_(\d+(?:\.\d+)?)([A-Za-z]{3})(?:_\d+)?(?:_(?:Qonto|AMEX|Kasse|Bank)[A-Za-z0-9ÄÖÜäöüß-]*)?\.pdf$/i);
        if (!m) continue;
        entries.push({ time: new Date(m[1]).getTime(), vendor: m[2].toLowerCase(),
          amount: parseFloat(m[3]), cur: m[4].toUpperCase(), used: false,
          file: f, monthFolder: monthFolder, inSub: sf.getId() !== monthFolder.getId() });
      }
    });
  });
  return entries;
}

// Buchungslabel ≠ Markenname auf der Rechnung: Aliasse für den Vendor-Abgleich
const VENDOR_ALIAS = { facebook: 'meta', celonis: 'make', realtimeboard: 'miro',
  logpayfinan: 'transdev', logpay: 'transdev',
  // Anbieter mit Kurz-Namen (<4 Buchstaben) liefern als Token das generische
  // zweite Wort des Buchungslabels – hier auf den Markennamen mappen. Gleiches
  // gilt für über PayPal bezahlte Käufe: Auf der Karte steht dann der Name des
  // PayPal-Empfängerkontos statt der Händler. Beispiele:
  // gaststaetten: 'abc', vorname: 'haendler' };
  };

// Erstes aussagekräftiges Wort (≥4 Buchstaben) aus einem Buchungslabel
function vendorToken_(label) {
  return String(label || '').toLowerCase()
    .replace(/[^a-zäöü]+/g, ' ').split(' ').filter(w => w.length >= 4)[0] || '';
}

function vendorMatch_(vendor, token) {
  if (!token) return false;
  return vendor.indexOf(token) !== -1 ||
    (VENDOR_ALIAS[token] ? vendor.indexOf(VENDOR_ALIAS[token]) !== -1 : false);
}

function driveHasDoc_(entries, amountAbs, dateMs, label, kontoTag) {
  const token = vendorToken_(label);
  let best = null;
  // Zwei Durchläufe: exakte Treffer haben Vorrang vor der Trinkgeld-Toleranz –
  // sonst schnappt sich eine Nachbar-Buchung desselben Anbieters den falschen Beleg
  [false, true].some(mitTrinkgeld => {
  entries.forEach(e => {
    if (e.used) return;
    const dd = Math.abs(e.time - dateMs);
    const tokenOk = vendorMatch_(e.vendor, token);
    // Enges Fenster für reine Betrags-Treffer; mit Anbieter-Match großzügig –
    // Lastschriften laufen oft Wochen nach dem Rechnungsdatum (z. B. Fitness-Abos)
    if (dd > (tokenOk ? 35 : 10) * 86400000) return;
    let ok = false;
    if (e.cur === 'EUR') {
      ok = Math.abs(e.amount - amountAbs) < 0.005;
      // Trinkgeld-Fall (Bewirtung): die Kartenzahlung liegt bis zu 20 % über
      // dem Bon-Betrag – nur mit Anbieter-Match zulassen
      if (!ok && mitTrinkgeld && tokenOk && amountAbs > e.amount && amountAbs / e.amount <= 1.2) ok = true;
    } else if (tokenOk) {
      const ratio = amountAbs / e.amount;
      ok = ratio > 0.7 && ratio < 1.3;
    }
    if (ok && (!best || dd < best.dd)) best = { dd: dd, e: e };
  });
  return !!best;
  });
  if (best) {
    best.e.used = true;
    // Zahlungskonto in den Dateinamen taggen und die Datei in den passenden
    // Konto-Unterordner (AMEX/ bzw. QONTO/) des Monatsordners einsortieren
    if (kontoTag && best.e.file) {
      try {
        const nm = best.e.file.getName();
        if (!/_(Qonto|AMEX|Kasse|Bank)[A-Za-z0-9ÄÖÜäöüß-]*\.pdf$/i.test(nm)) {
          best.e.file.setName(nm.replace(/\.pdf$/i, '_' + kontoTag + '.pdf'));
        }
        const subName = /^AMEX/i.test(kontoTag) ? 'AMEX' : (/^Qonto/i.test(kontoTag) ? 'QONTO' : null);
        if (subName && !best.e.inSub && best.e.monthFolder) {
          const it = best.e.monthFolder.getFoldersByName(subName);
          const sub = it.hasNext() ? it.next() : best.e.monthFolder.createFolder(subName);
          best.e.file.moveTo(sub);
          best.e.inSub = true;
        }
      } catch (e) { /* Umbenennen/Verschieben darf den Abgleich nie blockieren */ }
    }
    return true;
  }
  return false;
}

// Kürzel des Zahlungskontos für Dateinamen: Qonto-<Kontoname> bzw. AMEX-<Inhaber>
function kontoTag_(acc) {
  if (acc.quelle === 'gocardless') return 'Bank-' + sanitize(acc.name || 'Konto');
  if (acc.is_external_account) {
    const suffix = String(acc.account_number || '').slice(-5);
    const inhaber = (CONFIG.AMEX_KARTEN || {})[suffix];
    return 'AMEX-' + sanitize(inhaber ? inhaber.name : suffix);
  }
  return 'Qonto-' + sanitize(acc.name || 'Konto');
}

// ---------------------------------------------------------------------------
// Manuelle Drive-Uploads (stündlich): jemand legt ein PDF von Hand in den
// Rechnungsordner (Root oder Monatsordner). Claude liest es, benennt es nach
// der Naming-Convention und setzt den Marker; Root-Uploads wandern in den
// richtigen Monatsordner. Danach werden die neuen Belege einsortiert (Konto-Tag
// + AMEX/QONTO). Bereits benannte oder markierte Dateien werden übersprungen.
// ---------------------------------------------------------------------------
function processDriveUploads() {
  // Slack-Uploads zuerst einsammeln – sie landen im Scan-Eingang und laufen
  // unten im selben Lauf durch KI-Benennung und Einsortierung
  try { pullSlackBelege(); } catch (e) { console.warn('Slack-Beleg-Pull fehlgeschlagen: ' + e); }
  if (!CONFIG.ANTHROPIC_API_KEY) return;
  const MARKER = 'rechnungs-agent:benannt';
  const startTime = Date.now();
  const MAX_RUNTIME_MS = 270 * 1000;
  const conv = /^\d{4}-\d{2}-\d{2}_.+_\d+(?:\.\d+)?[A-Za-z]{3}(?:_\d+)?(?:_(?:Qonto|AMEX|Kasse|Bank)[A-Za-z0-9ÄÖÜäöüß-]*)?\.pdf$/i;
  const root = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  const now = new Date();

  // Kandidaten-Ordner: Root + aktueller & Vormonat (dort landen Uploads)
  // Root + aktueller & Vormonat inkl. deren Konto-Unterordner (Scans landen oft
  // direkt in AMEX/ oder QONTO/ – dort bleiben sie, bekommen aber sauberen Namen)
  const folders = [{ f: root, isRoot: true, inSub: false }];
  // Scan-Eingang (Dokumentenscanner) wie den Root behandeln: Dateien werden
  // benannt und in den richtigen Monatsordner verschoben
  if (CONFIG.SCAN_INBOX_FOLDER_ID) {
    try { folders.push({ f: DriveApp.getFolderById(CONFIG.SCAN_INBOX_FOLDER_ID), isRoot: true, inSub: false }); }
    catch (e) { /* Ordner nicht erreichbar – ignorieren */ }
  }
  [0, -1].forEach(off => {
    const ym = Utilities.formatDate(new Date(now.getFullYear(), now.getMonth() + off, 1),
      'Europe/Berlin', 'yyyy-MM');
    const yIt = root.getFoldersByName(ym.slice(0, 4));
    if (!yIt.hasNext()) return;
    const mIt = yIt.next().getFoldersByName(ym);
    if (!mIt.hasNext()) return;
    const mf = mIt.next();
    folders.push({ f: mf, isRoot: false, inSub: false });
    ['AMEX', 'QONTO', 'Sonstiges'].forEach(sub => {
      const it = mf.getFoldersByName(sub);
      if (it.hasNext()) folders.push({ f: it.next(), isRoot: false, inSub: true });
    });
  });

  let neu = 0, fehler = 0;
  outer:
  for (const entry of folders) {
    const files = entry.f.getFiles();
    while (files.hasNext()) {
      if (Date.now() - startTime > MAX_RUNTIME_MS) break outer;
      const f = files.next();
      if (f.getMimeType() !== 'application/pdf') continue;
      const nm = f.getName();
      if (conv.test(nm)) {
        // Schon benannt – falls versehentlich im Root, in den Monatsordner legen
        if (entry.isRoot) verschiebeInMonat_(root, f, nm.slice(0, 7));
        continue;
      }
      if ((f.getDescription() || '').indexOf('rechnungs-agent:') !== -1) continue;
      try {
        const meta = extractFromPdf_(f.getBlob());
        if (!meta) { fehler++; continue; }
        if (!meta.ist_rechnung) { f.setDescription('rechnungs-agent:kein-beleg'); continue; }
        const ymd = /^\d{4}-\d{2}-\d{2}$/.test(meta.rechnungsdatum || '')
          ? meta.rechnungsdatum
          : Utilities.formatDate(f.getDateCreated(), 'Europe/Berlin', 'yyyy-MM-dd');
        const vendor = sanitize(meta.anbieter || 'Unbekannt');
        const nummer = meta.rechnungsnummer ? '_' + sanitize(meta.rechnungsnummer) : '';
        const amount = meta.betrag ? '_' + meta.betrag + (meta.waehrung || 'EUR') : '';
        // Liegt die Datei schon in einem Konto-Unterordner, bleibt sie dort –
        // nur der Name wird korrigiert; den Konto-Tag hängt der Abgleich an.
        const ziel = entry.inSub ? entry.f : monatsOrdner_(root, ymd.slice(0, 7));
        const name = eindeutigerName_(ziel, ymd + '_' + vendor + nummer + amount + '.pdf', f.getId());
        if (f.getName() !== name) f.setName(name);
        f.setDescription(MARKER);
        if (!entry.inSub && f.getParents().next().getId() !== ziel.getId()) f.moveTo(ziel);
        neu++;
      } catch (e) {
        console.warn('Upload-Verarbeitung fehlgeschlagen bei ' + nm + ': ' + e);
        fehler++;
      }
    }
  }

  if (neu) {
    try { sortiereBelege_(); } catch (e) { /* Sortieren darf nie blockieren */ }
    notifySlack(':inbox_tray: *' + neu + ' manuell hochgeladene' +
      (neu === 1 ? 'r Beleg' : ' Belege') + ' erkannt, benannt und einsortiert.*' +
      (fehler ? ' (' + fehler + ' konnten nicht gelesen werden)' : ''));
  }

  try { entferneByteDuplikate_(); } catch (e) { /* Duplikat-Sweep darf nie blockieren */ }
}

// Byte-identische Duplikate (gleicher MD5-Hash) im aktuellen Monat in den
// Unterordner "Duplikate" verschieben. Entsteht vor allem, wenn GMI oder ein
// Portal dieselbe PDF ein zweites Mal liefert. Behalten wird bevorzugt die
// Datei mit Konto-Tag, dann Nicht-GMI-Namen, sonst die älteste.
function entferneByteDuplikate_() {
  const root = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  const ym = Utilities.formatDate(new Date(), 'Europe/Berlin', 'yyyy-MM');
  const yIt = root.getFoldersByName(ym.slice(0, 4));
  if (!yIt.hasNext()) return;
  const mIt = yIt.next().getFoldersByName(ym);
  if (!mIt.hasNext()) return;
  const mo = mIt.next();
  const scan = [mo];
  ['AMEX', 'QONTO', 'Sonstiges'].forEach(n => {
    const it = mo.getFoldersByName(n);
    if (it.hasNext()) scan.push(it.next());
  });
  const all = [];
  scan.forEach(folder => {
    const it = folder.getFiles();
    while (it.hasNext()) {
      const f = it.next();
      if (f.getMimeType() !== 'application/pdf') continue;
      all.push({ f, name: f.getName(), size: f.getSize(), created: f.getDateCreated().getTime() });
    }
  });
  // Nur Größen-Kollisionen hashen – hält den stündlichen Lauf billig
  const bySize = {};
  all.forEach(e => { (bySize[e.size] = bySize[e.size] || []).push(e); });
  let dupF = null;
  const moved = [];
  Object.keys(bySize).forEach(s => {
    const g = bySize[s];
    if (g.length < 2) return;
    const byHash = {};
    g.forEach(e => { const h = md5hex(e.f.getBlob().getBytes()); (byHash[h] = byHash[h] || []).push(e); });
    Object.keys(byHash).forEach(h => {
      const dup = byHash[h];
      if (dup.length < 2) return;
      dup.sort((a, b) => {
        const ta = /_(AMEX|Qonto|Bank|Kasse)/i.test(a.name) ? 0 : 1, tb = /_(AMEX|Qonto|Bank|Kasse)/i.test(b.name) ? 0 : 1;
        if (ta !== tb) return ta - tb;
        const ga = /GMI-Plattform/i.test(a.name) ? 1 : 0, gb = /GMI-Plattform/i.test(b.name) ? 1 : 0;
        if (ga !== gb) return ga - gb;
        return a.created - b.created;
      });
      for (let i = 1; i < dup.length; i++) {
        try {
          if (!dupF) {
            const dIt = mo.getFoldersByName('Duplikate');
            dupF = dIt.hasNext() ? dIt.next() : mo.createFolder('Duplikate');
          }
          dup[i].f.moveTo(dupF);
          moved.push(dup[i].name);
        } catch (e) { console.warn('Duplikat-Verschieben fehlgeschlagen: ' + dup[i].name + ' – ' + e); }
      }
    });
  });
  if (moved.length) {
    notifySlack(':wastebasket: *' + moved.length + ' Byte-identische' +
      (moved.length === 1 ? 's Duplikat' : ' Duplikate') + '* in den Duplikate-Ordner verschoben:\n• ' +
      moved.join('\n• '));
  }
}

// Monatsordner <Jahr>/<YYYY-MM> holen oder anlegen
function monatsOrdner_(root, ym) {
  const yIt = root.getFoldersByName(ym.slice(0, 4));
  const y = yIt.hasNext() ? yIt.next() : root.createFolder(ym.slice(0, 4));
  const mIt = y.getFoldersByName(ym);
  return mIt.hasNext() ? mIt.next() : y.createFolder(ym);
}

// Datei in den Monatsordner ihres Datums verschieben (best effort)
function verschiebeInMonat_(root, f, ym) {
  try {
    const ziel = monatsOrdner_(root, ym);
    if (f.getParents().next().getId() !== ziel.getId()) f.moveTo(ziel);
  } catch (e) { /* darf nichts blockieren */ }
}

// Eindeutigen Dateinamen im Zielordner finden (hängt _2, _3 … an bei Kollision)
function eindeutigerName_(folder, name, selfId) {
  const base = name.replace(/\.pdf$/i, '');
  let candidate = name, n = 2;
  for (;;) {
    const it = folder.getFilesByName(candidate);
    let clash = false;
    while (it.hasNext()) { if (it.next().getId() !== selfId) { clash = true; break; } }
    if (!clash) return candidate;
    candidate = base + '_' + (n++) + '.pdf';
  }
}

// ---------------------------------------------------------------------------
// Einmalige Nachbenennung: liest Bestands-PDFs (ab Juni 2026) mit Claude aus
// und benennt sie nach der Naming-Convention um. Mehrfach ausführbar – fertige
// Dateien tragen einen Marker in der Dateibeschreibung und werden übersprungen.
// ---------------------------------------------------------------------------
function backfillNames() {
  if (!CONFIG.ANTHROPIC_API_KEY) return;
  const MARKER = 'rechnungs-agent:benannt';
  const startTime = Date.now();
  const MAX_RUNTIME_MS = 270 * 1000;
  let umbenannt = 0, uebersprungen = 0, fehler = 0, offenRest = 0;
  const root = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  const years = root.getFolders();
  while (years.hasNext()) {
    const y = years.next();
    if (!/^20\d\d$/.test(y.getName())) continue;
    const months = y.getFolders();
    while (months.hasNext()) {
      const folder = months.next();
      if (!/^20\d\d-\d\d$/.test(folder.getName()) || folder.getName() < '2026-06') continue;
      const files = folder.getFiles();
      while (files.hasNext()) {
        const f = files.next();
        if (f.getMimeType() !== 'application/pdf') continue;
        if ((f.getDescription() || '').indexOf('rechnungs-agent:') !== -1) { uebersprungen++; continue; }
        if (Date.now() - startTime > MAX_RUNTIME_MS) { offenRest++; continue; }
        try {
          const meta = extractFromPdf_(f.getBlob());
          if (!meta) { fehler++; continue; }
          if (!meta.ist_rechnung) { f.setDescription('rechnungs-agent:kein-beleg'); uebersprungen++; continue; }
          const ymd = /^\d{4}-\d{2}-\d{2}$/.test(meta.rechnungsdatum || '')
            ? meta.rechnungsdatum
            : Utilities.formatDate(f.getDateCreated(), 'Europe/Berlin', 'yyyy-MM-dd');
          const vendor = sanitize(meta.anbieter || 'Unbekannt');
          const nummer = meta.rechnungsnummer ? '_' + sanitize(meta.rechnungsnummer) : '';
          const amount = meta.betrag ? '_' + meta.betrag + (meta.waehrung || 'EUR') : '';
          const base = ymd + '_' + vendor + nummer + amount;
          let name = base + '.pdf';
          let n = 2, clash = true;
          while (clash) {
            clash = false;
            const it = folder.getFilesByName(name);
            while (it.hasNext()) {
              if (it.next().getId() !== f.getId()) { clash = true; break; }
            }
            if (clash) name = base + '_' + (n++) + '.pdf';
          }
          if (f.getName() !== name) f.setName(name);
          f.setDescription(MARKER);
          umbenannt++;
        } catch (e) {
          console.warn('Backfill-Fehler bei ' + f.getName() + ': ' + e);
          fehler++;
        }
      }
    }
  }
  notifySlack(':abc: *Backfill Dateinamen:* ' + umbenannt + ' umbenannt, ' +
    uebersprungen + ' übersprungen, ' + fehler + ' Fehler' +
    (offenRest ? ', ' + offenRest + ' noch offen – backfillNames() erneut ausführen.' : ' – fertig!'));
}

// Claude-Extraktion nur aus dem PDF (ohne Mail-Kontext) – für den Backfill
function extractFromPdf_(blob) {
  const prompt =
    'Du bekommst ein PDF. Als Beleg (ist_rechnung=true) zählen: Rechnungen, ' +
    'Zahlungsbelege/Receipts, Quittungen, Abo-Abrechnungen und Bescheide mit Zahlbetrag. ' +
    'ist_rechnung=false NUR bei reinen Anschreiben, Verträgen, AGB, Mahnungen ohne Betrag o.Ä. ' +
    'Antworte NUR mit einem JSON-Objekt, ohne Markdown:\n' +
    '{"ist_rechnung": true|false,\n' +
    ' "anbieter": "der RECHNUNGSSTELLER/Aussteller/Lieferant — die Firma, die die Rechnung stellt und das Geld bekommt, NIEMALS der Empfänger/Kunde. Der Kunde ist fast immer ADMKRS (ADMKRS GmbH) — ADMKRS also NIE als anbieter. Kurz, ohne Rechtsform-Zusätze wie GmbH wenn möglich",\n' +
    ' "rechnungsnummer": "RE-2026-123 oder null",\n' +
    ' "betrag": "123.45",\n' +
    ' "waehrung": "EUR",\n' +
    ' "rechnungsdatum": "YYYY-MM-DD oder null"}\n' +
    'betrag = der tatsächlich zu zahlende Endbetrag (Brutto-Summe) mit Punkt als ' +
    'Dezimaltrenner. NIEMALS Gegenstandswert, Streitwert, Kontostand oder Zwischensummen verwenden.\n' +
    'WICHTIG zum Datum: Die Belege sind DEUTSCH. Ein Datum wie 01.07.2026 oder 01/07/2026 ' +
    'bedeutet 1. Juli 2026 (Tag.Monat.Jahr) – NIEMALS als Monat/Tag lesen. Gib es als 2026-07-01 zurück. ' +
    'Bei Kassenbons/Bewirtungsbelegen ist das Belegdatum das Datum des Restaurantbesuchs bzw. Einkaufs.';
  const payload = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: {
            type: 'base64', media_type: 'application/pdf',
            data: Utilities.base64Encode(blob.getBytes()) } },
        { type: 'text', text: prompt },
      ],
    }],
  };
  const resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': CONFIG.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() !== 200) {
    console.warn('Claude-API-Fehler: ' + resp.getContentText().slice(0, 300));
    return null;
  }
  const text = JSON.parse(resp.getContentText()).content[0].text;
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}

function loadProcessedIds() {
  const raw = PropertiesService.getScriptProperties().getProperty('processed');
  return new Set(raw ? JSON.parse(raw) : []);
}

function storeProcessedIds(set) {
  // Nur die letzten 3000 IDs behalten (ältere Mails fallen aus dem Suchfenster)
  const arr = Array.from(set).slice(-3000);
  PropertiesService.getScriptProperties().setProperty('processed', JSON.stringify(arr));
}


// ---------------------------------------------------------------------------
// Eigenbelege (Ersatzbelege): erstellt ein formales Eigenbeleg-PDF für
// Zahlungen ohne erhältlichen Originalbeleg und legt es benannt + getaggt im
// Monatsordner ab. Unterschrift: einmal eine Bilddatei "Unterschrift.png"
// (weißer Hintergrund) in den Rechnungs-Root legen – sie wird ab dann in jeden
// Eigenbeleg eingebettet; fehlt sie, bleibt eine Linie zum Unterschreiben.
// Aufruf im Editor, z. B.:
//   erstelleEigenbeleg('2026-07-11', 52.50, 'Muster GmbH, München',
//     'Eintrittsticket Messe', 'Kartenzahlung Qonto Hauptkonto', 'Qonto-Hauptkonto')
// ---------------------------------------------------------------------------
function erstelleEigenbeleg(datumYmd, betragEur, empfaenger, zweck, zahlungsart, kontoTag, grund) {
  const root = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  grund = grund || 'Vom Zahlungsempfänger wurde kein Beleg ausgestellt bzw. der Beleg ist nicht mehr vorhanden';
  const aussteller = CONFIG.EIGENBELEG_AUSSTELLER || 'Max Mustermann, Geschäftsführer';
  const firma = CONFIG.EIGENBELEG_FIRMA || 'ADMKRS GmbH';

  let sigHtml = '<div style="height:60px"></div>';
  const sigIt = root.getFilesByName('Unterschrift.png');
  if (sigIt.hasNext()) {
    const sb = sigIt.next().getBlob();
    sigHtml = '<img src="data:' + sb.getContentType() + ';base64,' +
      Utilities.base64Encode(sb.getBytes()) + '" style="height:60px" />';
  }

  const dd = datumYmd.slice(8, 10) + '.' + datumYmd.slice(5, 7) + '.' + datumYmd.slice(0, 4);
  const heute = Utilities.formatDate(new Date(), 'Europe/Berlin', 'dd.MM.yyyy');
  const betragStr = betragEur.toFixed(2).replace('.', ',') + ' EUR';
  const zeile = (k, v) =>
    '<tr><td style="padding:6px 14px 6px 0;color:#666;white-space:nowrap;vertical-align:top">' + k +
    '</td><td style="padding:6px 0;font-weight:bold">' + v + '</td></tr>';
  const html =
    '<html><body style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#111;margin:40px 48px">' +
    '<table width="100%" style="border-bottom:2px solid #111;padding-bottom:8px"><tr>' +
    '<td style="font-size:20px;font-weight:bold;letter-spacing:1px">EIGENBELEG</td>' +
    '<td align="right" style="font-size:12px;color:#666">' + firma + '</td></tr></table>' +
    '<p style="color:#666;margin:10px 0 24px">Ersatzbeleg für eine betriebliche Ausgabe ohne Originalbeleg</p>' +
    '<table style="font-size:12px">' +
    zeile('Zahlungsempfänger', empfaenger) +
    zeile('Datum der Zahlung', dd) +
    zeile('Betrag (brutto)', betragStr) +
    zeile('Zahlungsart', zahlungsart || '–') +
    zeile('Zweck der Ausgabe', zweck) +
    zeile('Grund des Eigenbelegs', grund) +
    '</table>' +
    '<p style="color:#999;font-size:10px;margin-top:24px">Der Betrag wurde wie angegeben verausgabt. ' +
    'Dieser Eigenbeleg wurde erstellt, da kein Originalbeleg vorliegt.</p>' +
    '<p style="margin-top:36px">München, den ' + heute + '</p>' +
    sigHtml +
    '<table style="margin-top:4px"><tr><td style="border-top:1px solid #111;padding-top:4px;min-width:260px">' +
    aussteller + ', ' + firma + '</td></tr></table>' +
    '</body></html>';

  const pdf = Utilities.newBlob(html, 'text/html', 'eigenbeleg.html').getAs('application/pdf');
  const mo = monatsOrdner_(root, datumYmd.slice(0, 7));
  const base = datumYmd + '_Eigenbeleg-' + sanitize(empfaenger).slice(0, 40) + '_' +
    betragEur.toFixed(2) + 'EUR' + (kontoTag ? '_' + kontoTag : '');
  let name = base + '.pdf';
  let n = 2;
  while (mo.getFilesByName(name).hasNext()) name = base + '_' + (n++) + '.pdf';
  const file = mo.createFile(pdf).setName(name);
  file.setDescription('rechnungs-agent:benannt');
  if (kontoTag) {
    const subName = /^AMEX/i.test(kontoTag) ? 'AMEX' : (/^Qonto/i.test(kontoTag) ? 'QONTO' : null);
    if (subName) {
      const it = mo.getFoldersByName(subName);
      file.moveTo(it.hasNext() ? it.next() : mo.createFolder(subName));
    }
  }
  notifySlack(':lower_left_fountain_pen: *Eigenbeleg erstellt:* ' + name);
  return name;
}

// ---------------------------------------------------------------------------
// Qonto↔AMEX-Verbindung überwachen: Die extern aggregierten AMEX-Konten
// verlieren nach Ablauf der Bank-Freigabe still die Verbindung – dann kommen
// keine neuen Buchungen mehr an und BelegCheck/Abgleich veralten unbemerkt.
// Signal: updated_at der externen Konten bleibt stehen bzw. die Konten
// verschwinden aus der API. Läuft im täglichen Beleg-Check.
// ---------------------------------------------------------------------------
function pruefeAmexVerbindung_() {
  if (!CONFIG.QONTO_API_SECRET || !CONFIG.SLACK_WEBHOOK_URL) return;
  const staleTage = CONFIG.AMEX_STALE_TAGE || 3;
  const now = Date.now();
  let ext = [];
  try {
    ext = (qontoFetch_('/v2/bank_accounts').bank_accounts || [])
      .filter(a => a.is_external_account && a.status !== 'closed');
  } catch (e) { return; } // API-Ausfall ist kein Verbindungsurteil
  let neuester = 0;
  ext.forEach(a => { const t = new Date(a.updated_at || 0).getTime(); if (t > neuester) neuester = t; });
  const tot = !ext.length || (now - neuester > staleTage * 86400000);
  const props = PropertiesService.getScriptProperties();
  const warOk = props.getProperty('amexVerbindungOk') !== 'false';
  if (tot) {
    const seit = ext.length ? Math.round((now - neuester) / 86400000) + ' Tagen' : 'unbekannt';
    notifySlack(':rotating_light: *AMEX-Verbindung bei Qonto unterbrochen!* ' +
      (ext.length ? 'Die AMEX-Konten wurden seit ' + seit + ' nicht mehr synchronisiert.'
                  : 'Die AMEX-Konten fehlen komplett in der Qonto-API.') +
      '\nBitte in Qonto die Verbindung erneuern: *Konten → American Express → Verbindung erneuern* ' +
      '(Freigabe in der Amex-App bestätigen). Solange fehlen AMEX-Umsätze im BelegCheck und im Beleg-Abgleich.');
    props.setProperty('amexVerbindungOk', 'false');
  } else if (!warOk) {
    notifySlack(':white_check_mark: *AMEX-Verbindung bei Qonto ist wieder aktiv* – die Umsätze laufen wieder ein, der BelegCheck zieht beim nächsten Lauf nach.');
    props.setProperty('amexVerbindungOk', 'true');
  }
}

// ---------------------------------------------------------------------------
// Slack-Belege: Der Beleg-Kanal ist ein Eingangskorb. PDFs oder Fotos einfach
// in den Channel (oder einen Thread) werfen – der Agent holt sie stündlich ab,
// wandelt Fotos in PDFs um, liest sie mit KI (Anbieter/Datum/Betrag), benennt
// sie nach der Naming-Convention und sortiert sie ins richtige Monats- und
// Konto-Fach. Der tägliche Abgleich ordnet sie dann von selbst der passenden
// Buchung zu – niemand muss einen Beleg manuell einer Zahlung zuordnen.
// Byte-Duplikate werden über die geteilte Hash-Datei erkannt.
// Braucht SLACK_BOT_TOKEN + SLACK_CHANNEL_ID.
// ---------------------------------------------------------------------------
function slackApi_(method, params) {
  const res = UrlFetchApp.fetch('https://slack.com/api/' + method, {
    method: 'post',
    headers: { Authorization: 'Bearer ' + CONFIG.SLACK_BOT_TOKEN },
    payload: params || {},
    muteHttpExceptions: true,
  });
  const json = JSON.parse(res.getContentText() || '{}');
  if (!json.ok) throw new Error('Slack ' + method + ': ' + (json.error || res.getResponseCode()));
  return json;
}

function slackBotReply_(threadTs, text) {
  try {
    slackApi_('chat.postMessage', { channel: CONFIG.SLACK_CHANNEL_ID, text: text, thread_ts: threadTs });
  } catch (e) { console.warn('Slack-Thread-Antwort fehlgeschlagen: ' + e); }
}

// Foto eines Belegs in ein PDF einbetten, damit KI-Benennung und Abgleich
// (beides rein PDF-basiert) es wie einen normalen Beleg behandeln
function bildZuPdf_(blob) {
  const html = '<html><body style="margin:0"><img src="data:' + blob.getContentType() +
    ';base64,' + Utilities.base64Encode(blob.getBytes()) + '" style="width:100%" /></body></html>';
  return Utilities.newBlob(html, 'text/html', 'beleg.html').getAs('application/pdf');
}

// Eigener Einstieg für den Kurz-Takt: Der Kanal wird alle paar Minuten
// abgefragt, damit Uploads und Aufgaben zeitnah bearbeitet werden statt erst
// beim stündlichen Lauf. Ohne neue Nachrichten kostet das nur zwei API-Calls.
function slackWatch() {
  pullSlackBelege();
}

// Bot-Zugang kaputt (Token rotiert/abgelaufen, Bot aus dem Channel entfernt):
// Das meldet der Agent über den unabhängigen Webhook, sonst bleibt es still –
// er könnte den Kanal dann nicht mehr lesen und niemand würde es merken.
// Höchstens einmal pro Tag, damit der stündliche Lauf nicht zumüllt.
function slackBotFehler_(e) {
  console.warn('Slack-Bot-Zugang: ' + e);
  const props = PropertiesService.getScriptProperties();
  if (Date.now() - Number(props.getProperty('slackBotFehlerWarn') || 0) < 86400000) return;
  props.setProperty('slackBotFehlerWarn', String(Date.now()));
  notifySlack(':warning: *Beleg-Upload über Slack geht gerade nicht* – Slack lehnt meinen ' +
    'Bot-Zugang ab (`' + String(e).slice(0, 120) + '`). Belege bitte solange per Mail ' +
    'schicken oder direkt in den Drive-Ordner legen; ich hole sie dort weiterhin ab.\n' +
    '_Zum Beheben: in der Slack-App unter „OAuth & Permissions" den aktuellen ' +
    '„Bot User OAuth Token" kopieren und im Skript bei SLACK_BOT_TOKEN eintragen._');
}

// Stündlich (am Anfang von processDriveUploads): neue Uploads aus dem
// Beleg-Kanal abholen und in den Scan-Eingang legen – die KI-Benennung
// und Einsortierung übernimmt derselbe Lauf direkt im Anschluss.
function pullSlackBelege() {
  if (!CONFIG.SLACK_BOT_TOKEN || !CONFIG.SLACK_CHANNEL_ID) return;
  const props = PropertiesService.getScriptProperties();
  const seen = new Set(JSON.parse(props.getProperty('slackBelegDateien') || '[]'));
  let dirty = false;

  // Eigene Bot-Identität einmalig ermitteln (eigene Nachrichten überspringen)
  let botUser = props.getProperty('slackBotUser');
  if (!botUser) {
    try {
      botUser = slackApi_('auth.test', {}).user_id || '';
      props.setProperty('slackBotUser', botUser);
    } catch (e) { slackBotFehler_(e); return; }
  }

  // Neue Nachrichten der letzten 3 Tage (reicht beim stündlichen Lauf)
  // inklusive aller Thread-Antworten
  const kandidaten = [];
  try {
    const oldest = ((Date.now() - 3 * 86400000) / 1000).toFixed(6);
    (slackApi_('conversations.history',
      { channel: CONFIG.SLACK_CHANNEL_ID, oldest: oldest, limit: '200' }).messages || []
    ).forEach(m => {
      kandidaten.push(m);
      if (m.reply_count) {
        try {
          (slackApi_('conversations.replies',
            { channel: CONFIG.SLACK_CHANNEL_ID, ts: m.ts, limit: '50' }).messages || []
          ).slice(1).forEach(r => kandidaten.push(r));
        } catch (e) { /* Thread nicht lesbar – überspringen */ }
      }
    });
  } catch (e) { slackBotFehler_(e); return; }
  // Zugang funktioniert wieder – nächste Störung darf sofort melden
  props.deleteProperty('slackBotFehlerWarn');

  const root = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  const hashes = loadSeenHashes();
  let abgelegt = 0;

  kandidaten.forEach(m => {
    if (m.bot_id || m.user === botUser) return;
    (m.files || []).forEach(file => {
      if (seen.has(file.id)) return;
      seen.add(file.id); dirty = true;
      const mime = String(file.mimetype || '');
      const istPdf = mime === 'application/pdf';
      const istBild = /^image\//.test(mime);
      if (!istPdf && !istBild) return;

      let blob;
      try {
        const res = UrlFetchApp.fetch(file.url_private_download || file.url_private, {
          headers: { Authorization: 'Bearer ' + CONFIG.SLACK_BOT_TOKEN },
          muteHttpExceptions: true,
        });
        if (res.getResponseCode() !== 200) throw new Error('HTTP ' + res.getResponseCode());
        blob = res.getBlob();
        if (/text\/html/i.test(String(blob.getContentType() || ''))) {
          throw new Error('kein Dateizugriff (fehlt der Scope files:read?)');
        }
      } catch (e) { console.warn('Slack-Download fehlgeschlagen (' + file.name + '): ' + e); return; }

      const hash = md5hex(blob.getBytes());
      if (hashes.has(hash)) {
        slackBotReply_(m.thread_ts || m.ts, ':information_source: `' + file.name +
          '` war schon einmal da – vermutlich bereits abgelegt, ich lege nichts doppelt ab.');
        return;
      }
      let pdf = blob;
      if (istBild) {
        try { pdf = bildZuPdf_(blob); } catch (e) {
          slackBotReply_(m.thread_ts || m.ts, ':warning: Konnte `' + file.name +
            '` nicht in ein PDF umwandeln – bitte als PDF oder kleineres Foto hochladen.');
          return;
        }
      }

      try {
        const inbox = CONFIG.SCAN_INBOX_FOLDER_ID
          ? DriveApp.getFolderById(CONFIG.SCAN_INBOX_FOLDER_ID) : root;
        inbox.createFile(pdf).setName(
          String(file.name || 'Slack-Beleg').replace(/\.[^.]+$/, '') + '.pdf');
        slackBotReply_(m.thread_ts || m.ts, ':mag: `' + (file.name || 'Beleg') +
          '` angekommen – ich lese, benenne und ordne ihn automatisch zu.');
        hashes.add(hash);
        abgelegt++;
      } catch (e) { console.warn('Slack-Beleg-Ablage fehlgeschlagen: ' + e); }
    });
  });

  if (dirty) props.setProperty('slackBelegDateien', JSON.stringify(Array.from(seen).slice(-500)));
  if (abgelegt) storeSeenHashes(hashes);

  // Textnachrichten im Channel beantworten (Beleg-Suchanfragen der Buchhaltung)
  try { beantworteSlackFragen_(kandidaten, botUser); } catch (e) {
    console.warn('Slack-Fragen fehlgeschlagen: ' + e);
  }
}

// ---------------------------------------------------------------------------
// Fragen im Beleg-Kanal beantworten: "Such mir bitte den Beleg für X raus."
// Die Buchhaltung sucht nach BUCHUNGSDATUM und EUR-Betrag, abgelegt sind die
// Belege aber nach RECHNUNGSDATUM und Originalwährung – genau diese Übersetzung
// übernimmt Claude anhand des Datei-Index der letzten Monate. Antwort kommt als
// Thread-Reply mit direkten Drive-Links. Reine Textnachrichten ohne Bezug zu
// Belegen bleiben unbeantwortet.
// ---------------------------------------------------------------------------
function belegIndex_(monate) {
  const root = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  const now = new Date();
  const idx = [];
  for (let off = 0; off > -(monate || 4); off--) {
    const ym = Utilities.formatDate(new Date(now.getFullYear(), now.getMonth() + off, 1),
      'Europe/Berlin', 'yyyy-MM');
    const yIt = root.getFoldersByName(ym.slice(0, 4));
    if (!yIt.hasNext()) continue;
    const mIt = yIt.next().getFoldersByName(ym);
    if (!mIt.hasNext()) continue;
    const mf = mIt.next();
    const scan = [{ f: mf, ort: ym }];
    ['AMEX', 'QONTO', 'Sonstiges'].forEach(sub => {
      const it = mf.getFoldersByName(sub);
      if (it.hasNext()) scan.push({ f: it.next(), ort: ym + '/' + sub });
    });
    scan.forEach(s => {
      const files = s.f.getFiles();
      while (files.hasNext()) {
        const f = files.next();
        if (f.getMimeType() !== 'application/pdf') continue;
        idx.push({ n: f.getName(), id: f.getId(), ort: s.ort });
      }
    });
  }
  return idx;
}

function beantworteSlackFragen_(kandidaten, botUser) {
  if (!CONFIG.ANTHROPIC_API_KEY) return;
  const props = PropertiesService.getScriptProperties();
  const done = new Set(JSON.parse(props.getProperty('slackFragenBeantwortet') || '[]'));

  const fragen = (kandidaten || []).filter(m =>
    !m.bot_id && m.user !== botUser && !(m.files || []).length &&
    String(m.text || '').trim().length >= 10 && !done.has(m.ts));
  if (!fragen.length) return;

  const idx = belegIndex_(4);
  const liste = idx.map((e, i) => '[' + i + '] ' + e.n + '  (' + e.ort + ')').join('\n');
  const fehler = JSON.parse(props.getProperty('slackFragenFehler') || '{}');
  // Offene Posten aus dem letzten Beleg-Check – Grundlage für Eigenbelege
  let offeneListe = '(keine Liste verfügbar)';
  try {
    const op = JSON.parse(props.getProperty('offenePosten') || '[]');
    if (op.length) {
      offeneListe = op.map(o => o.d + ' | ' + o.a.toFixed(2) + ' EUR | ' + o.v + ' | ' + o.k).join('\n');
    } else { offeneListe = '(aktuell keine offenen Posten)'; }
  } catch (e) { /* ohne Liste antwortet das Modell eben ohne Buchungsbezug */ }

  fragen.forEach(m => {
    let antwort = null, gescheitert = false, aktionen = null;
    try {

      const prompt =
        'Du bist der Rechnungs-Agent und liest im Slack-Kanal für Belege mit.\n' +
        'Eine Person schreibt dort:\n"""\n' + String(m.text).slice(0, 2000) + '\n"""\n\n' +
        'Deine abgelegten Belege (Dateiname und Ordner), durchnummeriert:\n' + liste + '\n\n' +
        'WICHTIG zur Namenskonvention: Dateiname = <RECHNUNGSDATUM>_<Anbieter>_' +
        '<Rechnungsnummer>_<Betrag><Währung>_<Konto>.pdf. Die Buchhaltung sucht dagegen ' +
        'nach BUCHUNGSDATUM und EUR-Betrag. Beides weicht regelmäßig ab:\n' +
        '• Das Rechnungsdatum liegt oft 1–3 Tage (bei Lastschrift auch länger) vor der Buchung, ' +
        'ein Beleg kann daher im VORMONATS-Ordner liegen.\n' +
        '• Belege in USD tragen den USD-Betrag, abgebucht wurde in EUR (z. B. 161.50USD ≈ 144 €).\n' +
        '• Trinkgeld: Der Bewirtungsbeleg kann kleiner sein als die Abbuchung.\n' +
        'Ordne jeden gesuchten Posten so gut wie möglich zu. Sei ehrlich, wenn nichts passt.\n\n' +
        'Abbuchungen, für die noch KEIN Beleg da ist (Datum | Betrag | Händler | Konto):\n' +
        offeneListe + '\n\n' +
        'Du kannst nicht nur antworten, sondern auch HANDELN: Bittet jemand um einen ' +
        'Eigenbeleg (Ersatzbeleg für eine Ausgabe ohne Originalrechnung), leg ihn an. ' +
        'Regeln dafür:\n' +
        '• Nur wenn eindeutig ist, um welche Abbuchung(en) es geht – nimm Datum, Betrag, ' +
        'Händler und Konto aus der Liste oben. Passt nichts eindeutig, frage in der Antwort nach ' +
        'statt zu raten.\n' +
        '• Der Zweck muss aus der Nachricht hervorgehen (z. B. "Bewirtung mit Kunde X", ' +
        '"Verpflegung Team beim Dreh"). Fehlt er, frag danach und lege NICHTS an.\n' +
        '• Bittet jemand pauschal um Eigenbelege für mehrere Posten, lege sie für die klar ' +
        'benannten an (höchstens 5 pro Nachricht).\n\n' +
        'Antworte NUR mit JSON, ohne Markdown:\n' +
        '{"ist_anfrage": true|false,  // false, wenn die Nachricht nichts von dir will\n' +
        ' "aktionen": [{"typ": "eigenbeleg", "datum": "YYYY-MM-DD", "betrag": 12.34, ' +
        '"empfaenger": "Händler", "zweck": "Grund der Ausgabe", "konto": "AMEX-Vorname"}],  // leer lassen, wenn nichts anzulegen ist\n' +
        ' "antwort": "Deine Slack-Antwort auf Deutsch, per du, freundlich und knapp. ' +
        'Für jeden gefundenen Beleg schreibe den Platzhalter [[NUMMER]] (die Nummer aus der Liste) ' +
        '– daraus wird automatisch ein klickbarer Link. Nenne kurz, warum der Beleg anders heißt ' +
        '(z. B. Rechnungsdatum, USD-Betrag). Nicht gefundene Posten klar benennen und sagen, ' +
        'dass der Beleg per Upload hier im Channel nachgereicht werden kann. ' +
        'Keine Anrede-Floskeln wie \\"Hallo zusammen\\", direkt zur Sache."}';

      const resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
        method: 'post',
        contentType: 'application/json',
        headers: { 'x-api-key': CONFIG.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        payload: JSON.stringify({
          model: 'claude-sonnet-5',
          max_tokens: 2000,
          messages: [{ role: 'user', content: prompt }],
        }),
        muteHttpExceptions: true,
      });
      if (resp.getResponseCode() !== 200) {
        throw new Error('HTTP ' + resp.getResponseCode() + ' ' + resp.getContentText().slice(0, 200));
      }
      // Die Antwort kann mehrere Blöcke enthalten (z. B. einen Denk-Block vor
      // dem Text) – deshalb alle Text-Blöcke einsammeln statt blind content[0]
      const roh = (JSON.parse(resp.getContentText()).content || [])
        .filter(b => b && b.type === 'text').map(b => b.text || '').join('\n');
      const json = roh.replace(/```json|```/g, '').trim();
      if (!json) throw new Error('leere Antwort');
      const data = JSON.parse(json);
      if (data.ist_anfrage) {
        if (data.antwort) antwort = String(data.antwort);
        if (Array.isArray(data.aktionen)) aktionen = data.aktionen;
      }
    } catch (e) {
      console.warn('Slack-Frage nicht beantwortbar: ' + e);
      gescheitert = true;
    }

    // Technisch gescheitert: nächster Lauf versucht es erneut, nach dem
    // dritten Fehlversuch endgültig abhaken (sonst Dauerschleife)
    if (gescheitert) {
      fehler[m.ts] = (fehler[m.ts] || 0) + 1;
      if (fehler[m.ts] >= 3) { done.add(m.ts); delete fehler[m.ts]; }
      return;
    }
    done.add(m.ts);
    delete fehler[m.ts];

    // Aufgaben ausführen. Bewusst nur Eigenbelege: Sie erzeugen ein Dokument
    // und sonst nichts – keine Zahlungen, keine Weiterleitungen, kein Löschen.
    const erledigt = [];
    (aktionen || []).slice(0, 5).forEach(a => {
      if (!a || a.typ !== 'eigenbeleg') return;
      const betrag = Number(a.betrag);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(a.datum || '')) || !(betrag > 0) ||
          !a.empfaenger || !a.zweck) return;
      try {
        const zart = /^AMEX/i.test(String(a.konto || ''))
          ? 'Kreditkarte (AMEX)' : 'Qonto-Konto (Lastschrift/Überweisung)';
        erledigt.push(erstelleEigenbeleg(a.datum, betrag, String(a.empfaenger),
          String(a.zweck), zart, String(a.konto || '')));
      } catch (e) { console.warn('Eigenbeleg aus Slack fehlgeschlagen: ' + e); }
    });
    if (erledigt.length) {
      antwort = (antwort || 'Erledigt.') + '\n\n:lower_left_fountain_pen: *Angelegt:*\n• ' +
        erledigt.join('\n• ');
    }

    if (!antwort) return;

    // Platzhalter [[n]] durch echte Drive-Links ersetzen (nur gültige Nummern)
    antwort = antwort.replace(/\[\[(\d+)\]\]/g, (treffer, nr) => {
      const e = idx[Number(nr)];
      return e ? '<https://drive.google.com/file/d/' + e.id + '/view|' + e.n + '>' : '';
    });
    slackBotReply_(m.thread_ts || m.ts, antwort);
  });

  props.setProperty('slackFragenBeantwortet', JSON.stringify(Array.from(done).slice(-200)));
  props.setProperty('slackFragenFehler', JSON.stringify(fehler));
}
