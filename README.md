# Steam Ban Checker
[![forthebadge](https://forthebadge.com/images/badges/built-with-love.svg)](https://forthebadge.com)
[![forthebadge](https://forthebadge.com/images/badges/uses-js.svg)](https://forthebadge.com)  
A simple Node.js script that periodically checks given steam-profiles for various bans and informs you via Telegram Bot.

## Requirements
In order to use this bot, you need the following dependencies and tokens:

- Node.js
- Steam API Key: https://steamcommunity.com/dev/apikey
- Telegram Bot Token: https://core.telegram.org/bots#6-botfather
- Telegram Chat ID: [Retrieve your Telegram Chat ID](#retrieve-your-telegram-chat-id)

## Installation
- Make sure you have the latest version of [Node.js](https://nodejs.org/) installed.
- Download this repository as a ZIP file and unpack it wherever you like.
- Rename `config.json.example` to `config.json`
- Edit `config.json` and fill in your **Steam API Key**, **Telegram Bot Token** and **Telegram Chat ID**
- Type `npm install` into your console of choice to install Node.js dependencies
- Type `npm start` or `node server.js` to start the bot.
  - To find out how to run the script permanently on a server you should check out [forever](https://github.com/foreversd/forever)

**The script does not properly check if your config is valid or has missing information. Make sure you have everything set up properly.**

## Configuration
```Javascript
{
	"General": {
		"language": "en", // Language Code (must match a file in the localization folder)
		"checkInterval": 15 // Check-Interval in Minutes
	},
	"Steam": {
		"apiKey": "STEAM API KEY" // Your Steam API Key
	},
	"Telegram": {
		"botToken": "Telegram Bot Token", // Your Telegram Bot Token
		"masterChatID": "Telegram Chat ID" // Your Telegram Chat ID
	}
}
```

## Usage
**Adding Profiles**
- Use `/add <steamID64|profileURL>` to add profiles to the list.
  - Example: `/add 12345678912345678` or `/add http://steamcommunity.com/profiles/12345678912345678`

To get the steamID64 or URL of a profile you can use websites like [STEAMID I/O](https://steamid.io/).  
Adding a profile via customURL will **NOT** work!

**How It Operates**
- The script will check every profile that gets added to the list once to get its initial data.
  - This is because you most-likely have a reason to track it for future bans ignoring old ones.
- While running, the script will check profiles every `checkInterval` minutes. (Default: 15)
  - Keep in mind that you are limited to 100.000 calls to the Steam Web API per day.
- If a profile got banned since it was checked for the first time, you will receive a telegram notification.
  - This includes the following ban types: Community Ban, VAC Ban, Game Ban.
  - A banned profile will no longer get checked if it got banned. (Exception: Community Ban)

All data is stored in a readable database called `profiles.db`.

### Retrieve your Telegram Chat ID
In order to retrieve your unique Telegram Chat ID, do as follows:

**Easy Method**
- `/start` a chat with the [@myidbot](https://telegram.me/myidbot).
- Type `/myid` to get your chat ID.

**Complex Method**
- `/start` a chat with your bot.
- Get the list of updates for your bot at: `https://api.telegram.org/bot<Telegram Bot Token>/getUpdates`.
  - Example: `https://api.telegram.org/bot123456789:abcdefghijklmnopqrstuvwxyz/getUpdates`.
- Search for the `id` field within the `from` object of your message response.
  - Absolute Path: `result[arrayIndex].message.from.id`.

### Used Node.js Modules
- [NeDB](https://github.com/louischatriot/nedb)
- [Request](https://github.com/request/request)
- [Node.js Telegram Bot API](https://github.com/yagop/node-telegram-bot-api)

### Contributing
There are currently no contributing guidelines, but I am open to any kind of improvements.  
In order to contribute to the project, please follow the **GitHub Standard Fork & Pull Request Workflow**

- **Fork** this repository on GitHub.
- **Clone** the project to your own machine.
- **Commit** changes to your own branch.
- **Push** your work to your own fork.
- Submit a **Pull Request** so I can review your changes

### Donating
If you find this script useful, you can support me by donating items via steam.
- [Steam Trade Link](https://steamcommunity.com/tradeoffer/new/?partner=169517256&token=77MTawmP)

### License
[MIT](https://github.com/IceQ1337/SteamBanChecker/blob/master/LICENSE)