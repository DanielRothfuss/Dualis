const fs = require('fs');
const ics = require('ics');

const usrname = process.env.DUALIS_USER;
const pass = process.env.DUALIS_PASS;

// Erzeugt "27.01.2026"
const date = new Date().toLocaleDateString('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
});

async function getDashboard() {
  try {
    // Login-Prozess
    const login = await fetch(`https://dualis.dhbw.de/scripts/mgrqispi.dll?usrname=${usrname}&pass=${pass}&APPNAME=CampusNet&PRGNAME=LOGINCHECK&ARGUMENTS=clino%2Cusrname%2Cpass%2Cmenuno%2Cmenu_type%2Cbrowser%2Cplatform&clino=000000000000001&menuno=000324&menu_type=classic&browser=&platform=`);
    
    const refreshHeader = login.headers.get('refresh');
    if (!refreshHeader) throw new Error("Login fehlgeschlagen.");
    
    const urlPart = refreshHeader.match(/ARGUMENTS=(-N\d+)/)[1];
    const cookieValue = login.headers.get('set-cookie').match(/cnsc\s*=\s*([^;]+)/)[1];

    // Abfrage mit dem Datum im Format DD.MM.YYYY
    const response = await fetch(`https://dualis.dhbw.de/scripts/mgrqispi.dll?APPNAME=CampusNet&PRGNAME=SCHEDULERPRINT&ARGUMENTS=${urlPart},-N000028,-A${date},-A,-N1`, {
      headers: { 'Cookie': `cnsc=${cookieValue}` }
    });

    const html = await response.text();
    const scheduleArray = parse(html);
    
    if (scheduleArray.length > 0) {
      createICS(scheduleArray);
    } else {
      console.log("Keine Termine für dieses Datum gefunden.");
    }

  } catch (error) {
    console.error("Script-Fehler:", error);
    process.exit(1);
  }
}

// ... (Hier die parse() Funktion aus der vorherigen Antwort einfügen) ...

function createICS(events) {
  const icsEvents = events.map(e => {
    const [day, month, year] = e.datum.split('.').map(Number);
    const [startH, startM] = e.beginn.split(':').map(Number);
    const [endH, endM] = e.ende.split(':').map(Number);

    return {
      title: e.veranstaltung,
      location: e.raum,
      description: `Dozent: ${e.lehrende}`,
      start: [year, month, day, startH, startM],
      end: [year, month, day, endH, endM]
    };
  });

  const { error, value } = ics.createEvents(icsEvents);
  if (error) return console.error(error);
  
  fs.writeFileSync('termine.ics', value);
  console.log("Datei 'termine.ics' wurde aktualisiert.");
}

getDashboard();
