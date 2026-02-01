const fs = require('fs');
const ics = require('ics');

// Variablen aus GitHub Secrets/Environment
const usrname = process.env.DUALIS_USER;
const pass = process.env.DUALIS_PASS;
// Aktuelles Datum für die Abfrage (YYYYMMDD)
const date = new Date().toLocaleDateString('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
});

async function getDashboard() {
  try {
    const login = await fetch(`https://dualis.dhbw.de/scripts/mgrqispi.dll?usrname=${usrname}&pass=${pass}&APPNAME=CampusNet&PRGNAME=LOGINCHECK&ARGUMENTS=clino%2Cusrname%2Cpass%2Cmenuno%2Cmenu_type%2Cbrowser%2Cplatform&clino=000000000000001&menuno=000324&menu_type=classic&browser=&platform=`, {
      method: 'GET'
    });

    const refreshHeader = login.headers.get('refresh');
    if (!refreshHeader) throw new Error("Login fehlgeschlagen - Checke deine Credentials!");
    
    const urlPart = refreshHeader.match(/ARGUMENTS=(-N\d+)/)[1];
    const cookieHeader = login.headers.get('set-cookie');
    const cookieValue = cookieHeader.match(/cnsc\s*=\s*([^;]+)/)[1];

    const response = await fetch(`https://dualis.dhbw.de/scripts/mgrqispi.dll?APPNAME=CampusNet&PRGNAME=SCHEDULERPRINT&ARGUMENTS=${urlPart},-N000028,-A${date},-A,-N1`, {
      method: 'GET',
      headers: { 'Cookie': `cnsc=${cookieValue}` }
    });

    const html = await response.text();
    const scheduleArray = parse(html);
    
    createICS(scheduleArray);

    // Logout
    await fetch(`https://dualis.dhbw.de/scripts/mgrqispi.dll?APPNAME=CampusNet&PRGNAME=LOGOUT&ARGUMENTS=${urlPart},-N001`, {
      method: 'GET',
      headers: { 'Cookie': `cnsc=${cookieValue}` }
    });
  } catch (error) {
    console.error("Fehler:", error);
    process.exit(1);
  }
}

function parse(html) {
  const results = [];
  let currentDate = "";
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  const dateRegex = /class="tbhead"[^>]*>([^<]+)</;
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
  const stripTags = /<\/?[^>]+(>|$)/g;

  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowContent = rowMatch[1];
    const dateMatch = rowContent.match(dateRegex);
    if (dateMatch) {
      currentDate = dateMatch[1].trim(); // Erwartet Format: DD.MM.YYYY
      continue;
    }

    if (rowContent.includes('class="tbdata"')) {
      const cells = [];
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
        cells.push(cellMatch[1].replace(stripTags, "").trim());
      }

      if (cells.length >= 5 && currentDate) {
        const [beginn, ende] = cells[3].split(' - ').map(t => t.trim());
        results.push({
          datum: currentDate,
          veranstaltung: cells[1],
          lehrende: cells[2],
          beginn,
          ende,
          raum: cells[4]
        });
      }
    }
  }
  return results;
}

function createICS(events) {
  const icsEvents = events.map(e => {
    const [day, month, year] = e.datum.split('.').map(Number);
    const [startH, startM] = e.beginn.split(':').map(Number);
    const [endH, endM] = e.ende.split(':').map(Number);

    return {
      title: e.veranstaltung,
      location: e.raum,
      description: `Lehrende: ${e.lehrende}`,
      start: [year, month, day, startH, startM],
      end: [year, month, day, endH, endM]
    };
  });

  const { error, value } = ics.createEvents(icsEvents);
  if (error) throw error;

  fs.writeFileSync(`${__dirname}/dualis_calendar.ics`, value);
  console.log("ICS Datei erfolgreich erstellt!");
}

getDashboard();
