# Steam Ban Checker v2 (Work in Progress)
[![forthebadge](https://forthebadge.com/images/badges/built-with-love.svg)](https://forthebadge.com)
[![forthebadge](https://forthebadge.com/images/badges/uses-js.svg)](https://forthebadge.com)  
A simple Node.js script that periodically checks given Steam Profiles for new VAC, Game or Community Bans and informs you or a group via Telegram Bot.

## Requirements
In order to use this script, you need the following dependencies and tokens:

- Node.js: https://nodejs.org/en/  
  - Compatible with Version 12 and 13
- Steam API Key: https://steamcommunity.com/dev/apikey
- Telegram Bot Token: https://core.telegram.org/bots#6-botfather
- Telegram Chat ID: [Retrieve your Telegram Chat ID](#retrieve-your-telegram-chat-id)

### Dependencies
- Linux: `fontconfig` or `libfontconfig`, depending on the distribution  
  - If you don't get any screenshots, try `apt install phantomjs` instead

## Installation
- Make sure you have the latest version of [Node.js](https://nodejs.org/) installed.
- Download this repository as and unpack it wherever you like.
- Go into the `configs` folder and rename `config.json.example` to `config.json`
- Edit `config.json` and fill in your **Steam API Key**, **Telegram Bot Token** and **Telegram Chat ID**
- Type `npm install` into your console of choice to install all necessary Node.js dependencies
- Type `npm start` or `node server.js` to start the script.
  - To find out how to run the script permanently on a server you should check out [forever](https://github.com/foreversd/forever).

**Make sure you have everything set up properly and your config is valid without missing information!**  

## Updating
In most cases, files only need to be overwritten, renamed or moved, but this project has **no guaranteed backward compatibility** and if the file structure changes during an update, a local installation must be manually adjusted. The only files that will remain compatible at all times are database files if not otherwise stated.

## Configuration
```Javascript
{
	"General": {
		"allowRequests": true, // Enable Access Requests
		"messages": "default", // Message File
		"checkInterval": 10 // Check-Interval in Minutes
	},
	"Steam": {
		"apiKey": "STEAM API KEY" // Your Steam API Key
	},
	"Telegram": {
		"botToken": "Telegram Bot Token", // Your Telegram Bot Token
		"masterChatID": "Telegram Chat ID" // Your Telegram Chat ID
	},
	"Screenshot": {
		"saveScreenshot": true, // Take Screenshots of Banned Profiles
		"sendScreenshot": true // Send Screenshots with Telegram Messages
	}
}
```

#### Profile Screenshots
**This only applies to displayed bans like VAC and Game Bans.**  
- If `saveScreenshot` is enabled, a profile screenshot will be taken as soon as a profile gets banned.
- If `sendScreenshot` is enabled, the screenshot will also be sent via Telegram Bot.

## Usage
#### Adding Profiles
- Use `/add <steamID64|profileURL>` to add profiles to the list.
  - Examples:
    - `/add 12345678912345678`
	- `/add http://steamcommunity.com/profiles/12345678912345678`
    - `/add https://steamcommunity.com/id/customURL`

To get the steamID64 or URL of a profile you can use websites like [STEAMID I/O](https://steamid.io/).  

#### Adding Users
While `allowRequests` is enabled (true), everyone can `/request` access to the script and you can either accept or decline the request. Users then can `/add` their own profiles, but you will not be notified about this.

#### Manage Users
- Type `/users` to receive a list of current users.
- Tap on the user you want to edit. The rest is relatively self-explanatory.

#### View Statistics
Type `/stats` to view global and personal statistics.

### Groups and Supergroups
If you **disable** the [Privacy Mode](https://core.telegram.org/bots#privacy-mode) for your Telegram Bot, you can also use it in groups and supergroups. Users in the group will still need access to the script in order to use it, but if they do have access, the profile will be checked for the entire group and can not be added again.

## Functionality
- The script will check every profile that gets added to the list once to get its initial data.
  - This is because you most-likely have a reason to track it for future bans ignoring old ones.
- While running, the script will check profiles every `checkInterval` minutes. (Default: 10)
  - Keep in mind that you are limited to 100.000 calls to the Steam Web API per day.
- If a profile got banned since it was checked for the first time, you will receive a Telegram notification.
  - This includes the following ban types: Community Ban, VAC Ban, Game Ban.
  - A banned profile will no longer get checked if it got banned. (Exception: Community Ban)

All data is stored in readable database files called `profiles.db` and `users.db`.

## Additional Information

### Retrieve your Telegram Chat ID
In order to retrieve your unique Telegram Chat ID, do as follows:

**Easy Method**
- `/start` a chat with the [@myidbot](https://telegram.me/myidbot).
- Type `/myid` to get your Telegram Chat ID.

**Complex Method**
- `/start` a chat with your bot.
- Get the list of updates for your bot at: `https://api.telegram.org/bot<Telegram Bot Token>/getUpdates`
  - Example: `https://api.telegram.org/bot123456789:abcdefghijklmnopqrstuvwxyz/getUpdates`
- Search for the `id` field within the `from` object of your message response.
  - Absolute Path: `result[arrayIndex].message.from.id`

### Contributing
There are currently no contributing guidelines, but I am open to any kind of improvements.  
In order to contribute to the project, please follow the **GitHub Standard Fork & Pull Request Workflow**

- **Fork** this repository on GitHub.
- **Clone** the project to your own machine.
- **Commit** changes to your own branch.
- **Push** your work to your own fork.
- Submit a **Pull Request** so I can review your changes

### Used Node.js Modules
- [Node.js Telegram Bot API](https://github.com/mast/telegram-bot-api)
- [NeDB](https://github.com/louischatriot/nedb)
- [Request](https://github.com/request/request)
- [Webshot (Fixed Version)](https://github.com/architjn/node-webshot)
- [XML2JS](https://github.com/Leonidas-from-XIV/node-xml2js)
- [SteamID](https://github.com/DoctorMcKay/node-steamid)

### Donating
If you find this script useful, you can support me by donating items via steam.  
[Steam Trade Link](https://steamcommunity.com/tradeoffer/new/?partner=169517256&token=77MTawmP)

### License
[MIT](https://github.com/IceQ1337/SteamBanChecker/blob/master/LICENSE)