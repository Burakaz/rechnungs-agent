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

  // Qonto-Weiterleitungsadresse für Lieferantenrechnungen ('' = deaktiviert,
  // dann werden offene Rechnungen nur markiert + gemeldet)
  QONTO_FORWARD_ADDRESS: 'deine-inbox@inbox.qonto.com',

  // Anthropic API-Key für die KI-Klassifizierung ('' = nur Absenderlisten)
  ANTHROPIC_API_KEY: '',

  // Slack Incoming Webhook für Benachrichtigungen in #belege ('' = aus)
  SLACK_WEBHOOK_URL: '',

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
    if (t.getHandlerFunction() === 'checkMissingReceipts') ScriptApp.deleteTrigger(t);
  });
  if (CONFIG.QONTO_API_SECRET || CONFIG.GOCARDLESS_SECRET_ID) {
    ScriptApp.newTrigger('checkMissingReceipts').timeBased().everyDays(1).atHour(9).create();
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
    const driveMap = driveDocMap_(new Date(now.getFullYear(), now.getMonth(), 1));
    const props = PropertiesService.getScriptProperties();
    const reminders = JSON.parse(props.getProperty('belegReminders') || '{}');
    const missing = [], mentions = [];

    alleBankKonten_().forEach(acc => {
      if (acc.status === 'closed') return;
      const txs = kontoTransaktionen_(acc, from.toISOString(), now.toISOString());
      txs.forEach(t => {
        const betrag = (t.side === 'debit' ? -1 : 1) * (t.amount || 0);
        if (betrag >= 0 || t.operation_type === 'qonto_fee') return;
        if (t.attachment_ids && t.attachment_ids.length > 0) return;
        if (istDauerbeleg_(t)) return;
        const datum = new Date(t.settled_at || t.emitted_at);
        // Stichtag nach angezeigtem (Berliner) Datum – wie im BelegCheck-Sheet
        if (Utilities.formatDate(datum, 'Europe/Berlin', 'yyyy-MM-dd') < floorStr) return;
        const key = t.transaction_id || t.id;
        if (driveHasDoc_(driveMap, Math.abs(betrag), datum.getTime(), t.label, kontoTag_(acc))) {
          delete reminders[key];
          return;
        }
        const eintrag = Utilities.formatDate(datum, 'Europe/Berlin', 'dd.MM.') + ' ' +
          (t.label || '?') + ' – ' + Math.abs(betrag).toFixed(2) + ' €';
        // Zuständig: erst Händler-Regel (überschreibt Karteninhaber), dann AMEX-Inhaber
        let person = belegZustaendig_(t.label);
        let quelle;
        if (acc.is_external_account) {
          const suffix = String(acc.account_number || '').slice(-5);
          const inhaber = (CONFIG.AMEX_KARTEN || {})[suffix];
          quelle = inhaber ? inhaber.name : 'AMEX …' + suffix;
          if (!person) person = inhaber;
        } else {
          quelle = acc.name || 'Qonto';
        }
        missing.push(eintrag + ' (' + quelle +
          (person && person.name !== quelle ? ' → ' + person.name : '') + ')');
        const r = reminders[key] || { n: 0, last: 0 };
        if (person && now.getTime() - datum.getTime() > 3 * 86400000 &&
            r.n < 2 && now.getTime() - r.last > 3 * 86400000) {
          mentions.push((person.slack ? '<@' + person.slack + '>' : '*' + person.name + '*') +
            ' ' + eintrag + (r.n === 1 ? ' _(letzte Erinnerung)_' : ''));
          reminders[key] = { n: r.n + 1, last: now.getTime() };
        }
      });
    });

    // Alte Reminder-Einträge aufräumen (>60 Tage)
    Object.keys(reminders).forEach(k => {
      if (now.getTime() - (reminders[k].last || 0) > 60 * 86400000) delete reminders[k];
    });
    props.setProperty('belegReminders', JSON.stringify(reminders));

    if (missing.length === 0) return;
    let text = ':receipt: *' + missing.length + ' Abbuchung' + (missing.length === 1 ? '' : 'en') +
      ' ohne Beleg* (Qonto + AMEX, letzte 35 Tage):\n' +
      missing.slice(0, 25).map(z => '• ' + z).join('\n') +
      (missing.length > 25 ? '\n… und ' + (missing.length - 25) + ' weitere' : '');
    if (mentions.length) {
      text += '\n\n:point_right: *Bitte Beleg nachreichen* – PDF in den ' +
        '<https://drive.google.com/drive/folders/' + CONFIG.DRIVE_FOLDER_ID +
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
    let offset = 0, guard = 0;
    while (guard++ < 20) {
      if (Date.now() - startTime > MAX_RUNTIME_MS) break;
      const resp = UrlFetchApp.fetch('https://api.getmyinvoices.com/accounts/v3/documents' +
        '?limit=100&offset=' + offset + '&startDateFilter=' + floor,
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
          seen.add(hash);

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
          let name = base + '.pdf';
          let n = 2;
          while (monthFolder.getFilesByName(name).hasNext()) name = base + '_' + (n++) + '.pdf';
          monthFolder.createFile(blob.copyBlob().setName(name))
            .setDescription('rechnungs-agent:benannt');
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
function processInvoices(queryOverride) {
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
      if (processedIds.has(msgId)) continue;

      const pdfs = message.getAttachments({ includeInlineImages: false })
        .filter(a => a.getContentType() === 'application/pdf');
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
        seenHashes.add(hash);
        savedNames.push(saveToDrive(pdf, message, result));
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
    ' "anbieter": "Firmenname (kurz, ohne Rechtsform-Zusätze wie GmbH wenn möglich)",\n' +
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

function buildBelegReport(monthStart) {
  if (!CONFIG.QONTO_API_SECRET) return;
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
  const fromIso = monthStart.toISOString();
  const toIso = monthEnd.toISOString();
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

  const ss = SpreadsheetApp.openById(CONFIG.BELEGCHECK_SHEET_ID);
  const w1 = writeBelegTab_(ss, qontoTabName,
    ['Index', 'BELEG', 'Wertstellung', 'Buchung', 'Gegenpartei', 'Transaktionsart',
     'Verwendungszweck', 'Betrag', 'Währung', 'Konto', 'Anhänge in Qonto'], qontoRows);
  const w2 = writeBelegTab_(ss, amexTabName,
    ['Index', 'BELEG', 'Datum', 'Händler', 'Verwendungszweck', 'Betrag', 'Währung', 'Karte'], amexRows);

  const fehltQ = qontoRows.filter(r => r[1] === false).length;
  const fehltA = amexRows.filter(r => r[1] === false).length;
  notifySlack(':bar_chart: *BelegCheck ' + MONATE[m] + ' ' + y + ' erstellt*\n' +
    '• ' + qontoTabName + ': ' + (qontoRows.length - fehltQ) + '/' + qontoRows.length +
    ' Belege da' + (w1 ? '' : ' (Tab existierte schon – NICHT überschrieben)') + '\n' +
    '• ' + amexTabName + ': ' + (amexRows.length - fehltA) + '/' + amexRows.length +
    ' Belege da' + (w2 ? '' : ' (Tab existierte schon – NICHT überschrieben)') + '\n' +
    (fehltQ + fehltA > 0 ? ':point_right: ' + (fehltQ + fehltA) + ' offene Belege – Details im Sheet.' : ':tada: Alles vollständig!'));
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
function driveDocMap_(monthStart) {
  const entries = [];
  const root = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  [-1, 0, 1].forEach(off => {
    const ym = Utilities.formatDate(
      new Date(monthStart.getFullYear(), monthStart.getMonth() + off, 1),
      'Europe/Berlin', 'yyyy-MM');
    const yIt = root.getFoldersByName(ym.slice(0, 4));
    if (!yIt.hasNext()) return;
    const mIt = yIt.next().getFoldersByName(ym);
    if (!mIt.hasNext()) return;
    const files = mIt.next().getFiles();
    while (files.hasNext()) {
      const f = files.next();
      const m = f.getName().match(/^(\d{4}-\d{2}-\d{2})_(.+)_(\d+(?:\.\d+)?)([A-Za-z]{3})(?:_\d+)?(?:_(?:Qonto|AMEX|Kasse|Bank)[A-Za-z0-9ÄÖÜäöüß-]*)?\.pdf$/i);
      if (!m) continue;
      entries.push({ time: new Date(m[1]).getTime(), vendor: m[2].toLowerCase(),
        amount: parseFloat(m[3]), cur: m[4].toUpperCase(), used: false, file: f });
    }
  });
  return entries;
}

function driveHasDoc_(entries, amountAbs, dateMs, label, kontoTag) {
  const token = String(label || '').toLowerCase()
    .replace(/[^a-zäöü]+/g, ' ').split(' ').filter(w => w.length >= 4)[0] || '';
  const alias = { facebook: 'meta', celonis: 'make' }; // Celonis Inc. = make.com
  let best = null;
  entries.forEach(e => {
    if (e.used) return;
    const dd = Math.abs(e.time - dateMs);
    if (dd > 10 * 86400000) return;
    let ok = false;
    if (e.cur === 'EUR') {
      ok = Math.abs(e.amount - amountAbs) < 0.005;
    } else if (token) {
      const ratio = amountAbs / e.amount;
      ok = (e.vendor.indexOf(token) !== -1 ||
            (alias[token] && e.vendor.indexOf(alias[token]) !== -1)) &&
           ratio > 0.7 && ratio < 1.3;
    }
    if (ok && (!best || dd < best.dd)) best = { dd: dd, e: e };
  });
  if (best) {
    best.e.used = true;
    // Zahlungskonto in den Dateinamen taggen (einmalig, best effort)
    if (kontoTag && best.e.file) {
      try {
        const nm = best.e.file.getName();
        if (!/_(Qonto|AMEX|Kasse|Bank)[A-Za-z0-9ÄÖÜäöüß-]*\.pdf$/i.test(nm)) {
          best.e.file.setName(nm.replace(/\.pdf$/i, '_' + kontoTag + '.pdf'));
        }
      } catch (e) { /* Umbenennen darf den Abgleich nie blockieren */ }
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
    ' "anbieter": "Firmenname (kurz, ohne Rechtsform-Zusätze wie GmbH wenn möglich)",\n' +
    ' "rechnungsnummer": "RE-2026-123 oder null",\n' +
    ' "betrag": "123.45",\n' +
    ' "waehrung": "EUR",\n' +
    ' "rechnungsdatum": "YYYY-MM-DD oder null"}\n' +
    'betrag = der tatsächlich zu zahlende Endbetrag (Brutto-Summe) mit Punkt als ' +
    'Dezimaltrenner. NIEMALS Gegenstandswert, Streitwert, Kontostand oder Zwischensummen verwenden.';
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
