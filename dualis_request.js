const fs = require('fs');
const ics = require('ics');

// Variablen aus GitHub Secrets/Environment
const usrname = process.env.DUALIS_USER;
const pass = process.env.DUALIS_PASS;

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

    let scheduleArray;

    for (let i = 0; i < 3; i++) {
      const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 * i).toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });

      const response = await fetch(`https://dualis.dhbw.de/scripts/mgrqispi.dll?APPNAME=CampusNet&PRGNAME=SCHEDULERPRINT&ARGUMENTS=${urlPart},-N000028,-A${date},-A,-N1`, {
        method: 'GET',
        headers: { 'Cookie': `cnsc=${cookieValue}` }
      });

      const html = await response.text();
      scheduleArray.push(parse(html));
    }

    console.log(scheduleArray);

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
  
  // Mapping für deutsche Monatskürzel
  const monthMap = {
    'Jan': 1, 'Feb': 2, 'Mär': 3, 'Apr': 4, 'Mai': 5, 'Jun': 6,
    'Jul': 7, 'Aug': 8, 'Sep': 9, 'Okt': 10, 'Nov': 11, 'Dez': 12
  };

  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  const dateRegex = /class="tbhead"[^>]*>([^<]+)</;
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
  const stripTags = /<\/?[^>]+(>|$)/g;

  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowContent = rowMatch[1];
    const dateMatch = rowContent.match(dateRegex);

    if (dateMatch) {
      // Wandelt "Mo, 26. Jan. 2026" in ein Objekt {day: 26, month: 1, year: 2026} um
      const rawDate = dateMatch[1].trim(); 
      try {
        const parts = rawDate.replace(/^[A-Za-z]{2}, /, "").split('. ');
        currentDate = {
          day: parseInt(parts[0]),
          month: monthMap[parts[1].replace('.', '')],
          year: parseInt(parts[2])
        };
      } catch (e) {
        console.error("Datum konnte nicht parsen:", rawDate);
      }
      continue;
    }

    if (rowContent.includes('class="tbdata"')) {
      const cells = [];
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
        cells.push(cellMatch[1].replace(stripTags, "").trim());
      }

      if (cells.length >= 5 && currentDate) {
        const times = cells[3].split(' - ').map(t => t.trim());
        const start = times[0].split(':').map(Number);
        const end = times[1].split(':').map(Number);

        results.push({
          title: cells[1],
          start: [currentDate.year, currentDate.month, currentDate.day, start[0], start[1]],
          end: [currentDate.year, currentDate.month, currentDate.day, end[0], end[1]],
          location: cells[4],
          description: `Lehrende: ${cells[2]}`
        });
      }
    }
  }
  return results;
}

function createICS(scheduleArray) {
  if (scheduleArray.length === 0) return;

  const { error, value } = ics.createEvents(scheduleArray);

  if (error) {
    console.error("Fehler beim Erstellen der ICS:", error);
    return;
  }

  fs.writeFileSync('termine.ics', value);
  console.log("✅ Datei 'termine.ics' wurde erfolgreich erstellt.");
}

getDashboard();
