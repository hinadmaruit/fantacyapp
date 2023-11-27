const express = require('express');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer');
const path = require('path');
const { JSDOM } = require('jsdom');
const app = express();
app.use(bodyParser.json());
const PORT = 3000;



// (Start) Step1 - Login & Select a League
async function getTitle(page) {
  console.log("Getting page title...");
  await page.goto('https://sleeper.com/leagues');
  await page.waitForTimeout(5000);
  const pageTitle = (await page.title()).trim();
  console.log("Page Title => ", pageTitle);
  return pageTitle;
}

async function login(email, password, page) {
  console.log("Logging in...");

  const emailField = await page.$('input[type="text"]');
  await emailField.type(email, { delay: 100 });
  await emailField.press('Enter');

  await page.waitForSelector('input[type="password"]');
  const passwordInput = await page.$('input[type="password"]');
  await passwordInput.type(password, { delay: 100 });
  await passwordInput.press('Enter');

  await page.waitForNavigation({ timeout: 60000 });
}

async function selectLeague(page) {
  try {

    const leaguesData = await page.evaluate(async () => {
      const leaguesElements = Array.from(document.querySelectorAll('a.nav-league-item-wrapper'));
      const leaguesData = [];

      for (const leagueElement of leaguesElements) {
        leagueElement.click();
        await new Promise(resolve => setTimeout(resolve, 5000));

        const leagueHeaderElement = document.querySelector('div.left-header-row');
        const backgroundImageMatch = leagueHeaderElement.innerHTML.match(/background-image:\s*url\(&quot;(.*?)&quot;\)/);
        const imageUrl = backgroundImageMatch[1];

        const title = leagueHeaderElement.querySelector('.name').textContent.trim();
        const subHeading = leagueHeaderElement.querySelector('.desc').textContent.trim();
        const currentUrl = window.location.href;
        const id = currentUrl.match(/\/leagues\/(\d+)\/matchup/)[1];

        const leagueObject = {
          id,
          imageUrl,
          title,
          subHeading,
        };

        leaguesData.push(leagueObject);
      }

      return leaguesData;
    });

    return leaguesData;
  } catch (error) {
    console.error('Error occurred during selectLeague:', error);
    throw error;
  }
}

// (End) Step1 - Login & Select a League








// (Start) Step2 - Matchup
async function getMatchupWith(page) {
  try {
    const matchupData = [];
    const playerMatchupElements = await page.$$('div.matchup-owner-item');
    
    for (const playerMatchupElement of playerMatchupElements) {
      const teamName = await playerMatchupElement.$eval('.team-name', (element) => element.textContent);
      const name = await playerMatchupElement.$eval('.name', (element) => element.textContent);
      const percentage = await playerMatchupElement.$eval('.win-percentage-number', (element) => element.textContent);
      const projections = await playerMatchupElement.$eval('.projections', (element) => element.textContent);
      const score = await playerMatchupElement.$eval('.score', (element) => element.textContent);
      const description = await playerMatchupElement.$eval('.description', (element) => element.textContent);

      // Extract background-image URL from the style attribute
      const avatarElement = await playerMatchupElement.$('.avatar');
      const avatarStyle = await avatarElement.evaluate(element => element.getAttribute('style'));
      const backgroundImageUrlMatch = avatarStyle.match(/url\(['"]([^'"]+)['"]\)/);
      const avatarImageUrl = backgroundImageUrlMatch ? backgroundImageUrlMatch[1] : '';

      const data = {
        teamName,
        name,
        percentage,
        projections,
        score,
        description,
        avatarImageUrl,
      };
      matchupData.push(data);
    }

    return matchupData;
  } catch (error) {
    console.error('Error occurred during getMatchupWith:', error);
    throw error;
  }
}

async function getMatchups(page) {
  const playerArray1 = [];
  const playerArray2 = [];
  
  const matchupElements = await page.$$('div.player-section');
  if (matchupElements.length !== 2) {
    throw new Error('Expected 2 matchup elements, but found ' + matchupElements.length);
  }
  
  const getPlayersData = async (containerElements, playerArray) => {
    for (const containerElement of containerElements) {
      const positionElement = containerElement.querySelector('.position');
      const positionText = positionElement ? positionElement.textContent.trim() : '';
      const player1 = containerElement.querySelector('.matchup-player-item:first-child');
      const player2 = containerElement.querySelector('.matchup-player-item:last-child');
      const playerData1 = getPlayerData(player1);
      const playerData2 = getPlayerData(player2);
      
      playerArray.push({
        sl: positionText,
        vs: [playerData1, playerData2],
      });
    }
  };

  const htmlDataStarters = await matchupElements[0].getProperty('outerHTML');
  const dom = new JSDOM(await htmlDataStarters.jsonValue());
  const containerElements = dom.window.document.querySelectorAll('.matchup-player-row-container');
  await getPlayersData(containerElements, playerArray1);
  return playerArray1;
}

function getPlayerData(playerElement) {
  const name = playerElement.querySelector('.player-name div')?.textContent || '';
  const position = playerElement.querySelector('.player-pos')?.textContent || '';
  const projections = playerElement.querySelector('.projections')?.textContent || '';
  const description = playerElement.querySelector('.game-schedule-live-description')?.textContent || '';
  return {
    name,
    position,
    projections,
    description
  };
}

// (End) Step2 - Matchup







// (Start) Step3 - Team
async function getTeamInfo(page) {
  try {
    const teamElements = await page.$$('div.user-tab-menu');
    const nameElement = await teamElements[0].$('div.name');
    const name = await nameElement.evaluate(element => element.textContent);
    const teamElementHTML = await teamElements[0].evaluate(element => element.outerHTML);
    const imageUrl = teamElementHTML.split('&quot;')[1];
    const teamObj = {
      name: name,
      imageUrl: imageUrl,
    };
    return teamObj;

  } catch (error) {
    console.error('Error occurred during getTeamInfo:', error);
    throw error;
  }
}

async function getTeams(page) {
  try {
    const playerInfo = [];
    const matchupElements = await page.$$('div.team-roster-item');

    for (const matchupElement of matchupElements) {
      const playerNameElement = await matchupElement.$('.player-name');
      const positionElement = await matchupElement.$('.pos');
      const byeWeekElement = await matchupElement.$('.bye-week');
      const slotPositionSquareElement = await matchupElement.$('.league-slot-position-square');
      const avatarElement = await matchupElement.$('.avatar-player');
      const nicknameElement = await matchupElement.$('.roster-nickname');
      const scheduleElement = await matchupElement.$('.game-schedule-live-description');
      const itemOptionElements = await matchupElement.$$('.item-option');

      if (!playerNameElement || !positionElement || !byeWeekElement) {
        console.warn('Skipping a player due to missing data.');
        continue;
      }

      const playerName = await playerNameElement.evaluate((element) => element.textContent);
      const position = await positionElement.evaluate((element) => element.textContent);
      const byeWeek = await byeWeekElement.evaluate((element) => element.textContent.trim());
      const slotPositionSquare = slotPositionSquareElement
        ? await slotPositionSquareElement.evaluate((element) => element.getAttribute('class'))
        : '';
      const avatarSrc = avatarElement
        ? await avatarElement.evaluate((element) => element.getAttribute('src'))
        : '';
      const nickname = nicknameElement
        ? await nicknameElement.evaluate((element) => element.textContent)
        : '';
      const schedule = scheduleElement
        ? await scheduleElement.evaluate((element) => element.textContent)
        : '';

      const itemOptions = [];
      for (const itemOptionElement of itemOptionElements) {
        const itemOptionContent = await itemOptionElement.evaluate((element) =>
          element.textContent.trim()
        );
        itemOptions.push(itemOptionContent);
      }

      const parts = position.split('-');
      const positionValue = parts[0].trim();
      const playerObj = {
        positionValue,
        playerName,
        position,
        byeWeek,
        slotPositionSquare,
        avatarSrc,
        nickname,
        schedule,
        itemOptions,
      };

      playerInfo.push(playerObj);
    }

    return playerInfo;
  } catch (error) {
    console.error('Error occurred during getTeams:', error);
    throw error;
  }
}

// (End) Step3 - Team







// (Start) Step4 - League
async function getLeagueMatchups(page) {
  try {
    const matchupsData = [];
    const matchupElements = await page.$$('div.league-matchups');

    if (matchupElements.length > 0) {
      const htmlData = await matchupElements[0].getProperty('outerHTML');
      const htmlContent = await htmlData.jsonValue();
      const dom = new JSDOM(htmlContent);
      const matchupRowItems = dom.window.document.querySelectorAll('.league-matchup-row-item');

      matchupRowItems.forEach((matchupRowItem) => {
        const userElements = matchupRowItem.querySelectorAll('.user');

        userElements.forEach((userElement, index) => {
          const avatarElement = userElement.querySelector('.avatar');
          const teamNameElement = userElement.querySelector('.team-name');
          const nameElement = userElement.querySelector('.name');
          const scoreElement = userElement.querySelector('.score');
          const winPercentageElement = userElement.querySelector('.win-percentage-number');
          const descriptionElement = userElement.querySelector('.description');
          const projectionsElement = userElement.querySelector('.projections');

          const avatarStyle = avatarElement ? avatarElement.getAttribute('style') : '';
          const avatarSrcMatch = avatarStyle.match(/background-image:\s?url\("([^"]+)"\)/);
          const avatarSrc = avatarSrcMatch ? avatarSrcMatch[1] : '';
          const teamName = teamNameElement ? teamNameElement.textContent.trim() : '';
          const name = nameElement ? nameElement.textContent.trim() : '';
          const score = scoreElement ? scoreElement.textContent.trim() : '';
          const winPercentage = winPercentageElement ? winPercentageElement.textContent.trim() : '';
          const description = descriptionElement ? descriptionElement.textContent.trim() : '';
          const projections = projectionsElement ? projectionsElement.textContent.trim() : '';

          matchupsData.push({
            avatarSrc,
            teamName,
            name,
            score,
            winPercentage,
            description,
            projections,
          });
        });
      });
    }

    return matchupsData;
  } catch (error) {
    console.error('Error occurred during getMatchups:', error);
    throw error;
  }
}

async function getLeaguesData(page) {
  try {
    const leaguesData = [];
    const matchupElements = await page.$$('div.league-standing-list');

    if (matchupElements.length > 0) {
      const htmlData = await matchupElements[0].getProperty('outerHTML');
      const htmlContent = await htmlData.jsonValue();
      const dom = new JSDOM(htmlContent);
      const leaguesRowItems = dom.window.document.querySelectorAll('.league-standing-item');

      leaguesRowItems.forEach((leagueRowItem) => {
        const rankElement = leagueRowItem.querySelector('.rank');
        const avatarElement = leagueRowItem.querySelector('.avatar');
        const nameElement = leagueRowItem.querySelector('.name');
        const teamNameElement = leagueRowItem.querySelector('.team-name');
        const descriptionElement = leagueRowItem.querySelector('.description');

        const waiverElement = Array.from(leagueRowItem.querySelectorAll('.standings-row .value.bold')).find(
          (el) => el.textContent.trim() === 'WAIVER'
        );

        const name = nameElement ? nameElement.textContent.trim() : '';
        const waiver = waiverElement ? waiverElement.nextElementSibling.textContent.trim() : '';

        leaguesData.push({
          name,
          waiver,
        });
      });
    }

    return leaguesData;
  } catch (error) {
    console.error('Error occurred during getLeagues:', error);
    throw error;
  }
}
// (End) Step4 - League









// (Start) Step5 - Players
async function getPlayers(page) {
  try {
    const playersData = [];
    const playerElements = await page.$$('.player-list-item');

    for (const playerElement of playerElements) {
      const playerNameElement = await playerElement.$('.name');
      const playerPositionElement = await playerElement.$('.position');
      const playerGameScheduleElement = await playerElement.$('.game-schedule-live-description');
      const playerStatsCells = await playerElement.$$('.cell.all');

      const playerName = await playerNameElement.evaluate(el => el.textContent);
      const playerPosition = await playerPositionElement.evaluate(el => el.textContent);
      const playerGameSchedule = await playerGameScheduleElement.evaluate(el => el.textContent);

      const playerData = {
        name: playerName,
        position: playerPosition,
        gameSchedule: playerGameSchedule,
      };

      playersData.push(playerData);
    }

    return playersData;
  } catch (error) {
    console.error('Error occurred during getPlayers:', error);
    throw error;
  }
}

// (End) Step5 - Players







// (Start) Step6 - Logout
async function logout(page) {
  console.log("Logging out...");
  await page.goto('https://sleeper.com/settings/account');
  await page.waitForTimeout(5000);
  const logoutButton = await page.$('div.logout-text');

  if (logoutButton) {
    await logoutButton.click();
    await page.waitForTimeout(5000);
    return true;
  } else {
    return false;
  }
}


app.post('/logout', async (req, res) => {
  try {
    // const { email, password } = req.body;
    const email = "Seanmasek";
    const password = "SWM514dlg";
        
    const userDataDir = path.join('chrome-profile');
    const launchOptions = {
      headless: "new",
      args: [
        '--start-maximized',
        '--user-data-dir=' + userDataDir,
      ],
    };
    const browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    const pageTitle = await getTitle(page);
    if (pageTitle === "Sleeper - Sign Up or Login") {
      console.log("already logout");

      await page.goto('https://sleeper.com/leagues');
      await page.waitForTimeout(5000);      
      await login(email, password, page);
      const newTitle = await getTitle(page);
      if (newTitle === "Sleeper - Sign Up or Login") {
        console.log("login fail");
        res.json({ status:false, message:'login fail' });
      } else {
        console.log("login success");
        const sleeperLeagues = await selectLeague(page);
        console.log("selectLeague success data");
        res.json({ status:true, message:'login success', sleeperLeagues:sleeperLeagues });
      }
    }
    else
    {
      const logoutSuccess = await logout(page);
      if (logoutSuccess) {
        console.log("logout success");

        await page.goto('https://sleeper.com/leagues');
        await page.waitForTimeout(5000);      
        await login(email, password, page);
        const newTitle = await getTitle(page);
        if (newTitle === "Sleeper - Sign Up or Login") {
          console.log("login fail");
          res.json({ status:false, message:'login fail' });
        } else {
          console.log("login success");
          const sleeperLeagues = await selectLeague(page);
          console.log("selectLeague success data");
          res.json({ status:true, message:'login success', sleeperLeagues:sleeperLeagues });
        }

      } else {
        console.log("Error during logout");
        res.json({ status:false, data:'Error during logout' });
      }
    }

    await browser.close();
  } catch (error) {
    console.error('Error occurred during logout:', error);
    res.json({ status:false, data:'Error occurred during logout : '+error });
  }
});
// (End) Step6 - Logout


app.get('/', (req, res) => {
  res.send('Nodejs APIs - Fantasy Sleeper');
});

app.post('/login', async (req, res) => {
  try {
    const userDataDir = path.join('chrome-profile');
    const launchOptions = {
      headless: "new",
      args: [
        '--start-maximized',
        '--user-data-dir=' + userDataDir,
      ],
    };
    const browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    const pageTitle = await getTitle(page);
    if (pageTitle === "Sleeper - Sign Up or Login") {
      // const { email, password } = req.body;
      const email = "Seanmasek";
      const password = "SWM514dlg";
      
      await login(email, password, page);
      const newTitle = await getTitle(page);
      if (newTitle === "Sleeper - Sign Up or Login") {
        console.log("login fail");
        res.json({ status:false, message:'login fail' });
      } else {
        console.log("login success");
        const my_leagues = await selectLeague(page);
        console.log("selectLeague success data");
        res.json({ status:true, message:'login success', my_leagues:my_leagues });
      }
    } else {
      console.log("already login");
      const my_leagues = await selectLeague(page);
      console.log("selectLeague success data");
      res.json({ status:true, message:'already login', my_leagues:my_leagues });
    }

    await browser.close();
  } catch (error) {
    console.error('Error occurred during login:', error);
    res.json({ status:false, data:'An error occurred during login' });
  }
});

app.post('/getLeaguesData', async (req, res) => {
  const { league_id, league_title, platform_name } = req.body;
  console.log("getLeaguesData leagueId => ", league_id);
  try {
    const userDataDir = path.join('chrome-profile');
    const launchOptions = {
      headless: "new",
      args: [
        '--start-maximized',
        '--user-data-dir=' + userDataDir,
      ],
    };
    const browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    await page.goto('https://sleeper.com/leagues/'+league_id+'/league');
    await page.waitForTimeout(5000);
    const leagues = await getLeaguesData(page);

    await page.goto('https://sleeper.com/leagues/'+league_id+'/team');
    await page.waitForTimeout(5000);
    const team = await getTeams(page);

    await page.goto('https://sleeper.com/leagues/'+league_id+'/players');
    await page.waitForTimeout(5000);
    const players = await getPlayers(page);

    await page.goto('https://sleeper.com/leagues/'+league_id+'/matchup');
    await page.waitForTimeout(5000);
    const matchup_vs = await getMatchupWith(page);
    const matchups = await getMatchups(page);


    // get current dateTime
    const currentDate = new Date();
    const options = {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false, // Use 24-hour format
    };
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const formattedDate = formatter.format(currentDate);


    res.json({
      status:true,
      message:"My Leagues Data",      
      platform_name:platform_name,
      league_id:league_id,
      league_title:league_title,
      update_dateTime:formattedDate,

      matchup_vs:matchup_vs, 
      matchups:matchups,
      leagues:leagues,
      team:team,
      players:players,
    });

    await browser.close();
  } catch (error) {
    console.error('Error occurred during getLeaguesData:', error);
    res.json({ status:false, message:'Error occurred during getLeaguesData : '+error });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
