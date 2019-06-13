const Path = require('path');
const Request = require('request');
const Config = require(Path.join(__dirname, 'config.json'));
const Language = require(Path.join(__dirname, `/localization/${Config.General.language}.json`));

if (Config == null) {
    console.error('Missing config information. Exiting now.');
    process.exitCode = 1;
}

if (Language == null) {
    console.error('Missing localization. Exiting now.');
    process.exitCode = 1;
}

const SteamProfileURL = 'https://steamcommunity.com/profiles/';
const SteamWebAPIURL = `http://api.steampowered.com/ISteamUser/GetPlayerBans/v1/?key=${Config.Steam.apiKey}&steamids=`;

const REGEX_STEAMURL = /^(http|https):\/\/steamcommunity.com\/profiles\//;
const REGEX_STEAMID64 = /^[0-9]{17}$/;
const REGEX_STEAMURL64 = /^(http|https):\/\/steamcommunity.com\/profiles\/[0-9]{17}$/;

const Datastore = require('nedb');
const ProfileDB = new Datastore({ filename: Path.join(__dirname, 'profiles.db'), autoload: true });

const Telegram = require('telegram-bot-api');
const TelegramBot = new Telegram({ token: Config.Telegram.botToken, updates: { enabled: true } });

function sendTelegramMessage(message) {
    TelegramBot.sendMessage({
        chat_id: Config.Telegram.masterChatID,
        text: message,
        parse_mode: 'Markdown'
    });
}

TelegramBot.on('message', (message) => {
	var chatID = message.from.id;
    var msg = message.text;

    if (chatID == Config.Telegram.masterChatID) {
        if (msg.startsWith('/add')) {
            var steamID = msg.replace('/add ', '');
            if (steamID.match(REGEX_STEAMID64)) {
                addProfile(SteamWebAPIURL + steamID);
			} else if (steamID.match(REGEX_STEAMURL64)) {
                var steamID64 = steamID.replace(REGEX_STEAMURL, '');
                addProfile(SteamWebAPIURL + steamID64);
            } else {
                sendTelegramMessage(`${steamID} ${Language.profileInvalid}`);
            }
        }
    }
});

TelegramBot.getMe().then((data) => {
	getBanData();
}).catch((err) => {
    console.error(`[X] ${err}`);
});

function addProfile(apiURL) {
    Request(apiURL, (err, response, body) => {
        if (err) return;
        if (response.statusCode === 200) {
            var apiData = JSON.parse(body);
            if (apiData.players[0].SteamId) {
                var player = apiData.players[0];
                ProfileDB.insert({ SteamID: player.SteamId, CommunityBanned: player.CommunityBanned, VACBanned: player.VACBanned, NumberOfVACBans: player.NumberOfVACBans, NumberOfGameBans: player.NumberOfGameBans, Tracked: true }, (err, data) => {
                    if (err) return;
                    sendTelegramMessage(`${steamID} ${Language.profileAdded}`);
                });
            } else {
                sendTelegramMessage(Language.errorUnexpected);
            }
        } else {
            sendTelegramMessage(Language.errorUnexpected);
        }
    });
}

function getBanData() {
    ProfileDB.find({ Tracked: true }, (err, profiles) => {
        if (err) return;

        var profileIDs = [];
        profiles.forEach((profile) => {
            profileIDs.push(profile.SteamID);
        });

        var apiURL = SteamWebAPIURL + profileIDs.reverse().join();
        Request(apiURL, (err, response, body) => {
            if (err) return;
            if (response.statusCode === 200) {
                var apiData = JSON.parse(body);
                apiData.players.forEach((player) => {
                    var steamID = player.SteamId;
                    var profileURL = SteamProfileURL + steamID;
                    ProfileDB.findOne({ SteamID: steamID }, (err, profile) => {
                        if (err) return;
                        if (profile == null) return;

                        if (player.CommunityBanned && !profile.CommunityBanned) {
                            updateProfileDB(steamID, player, 'community');
                            sendTelegramMessage(`${profileURL}\n${Language.CommunityBanned}`);
                        }

                        if (player.VACBanned && !profile.VACBanned) {
                            updateProfileDB(steamID, player, 'vac');
                            sendTelegramMessage(`${profileURL}\n${Language.VACBanned}`);
                        } else if (player.VACBanned && player.NumberOfVACBans > profile.NumberOfVACBans) {
                            updateProfileDB(steamID, player, 'vac');
                            sendTelegramMessage(`${profileURL}\n${Language.VACBannedAgain}`);                        
                        }

                        if (player.NumberOfGameBans > profile.NumberOfGameBans && profile.NumberOfGameBans > 0) {
                            updateProfileDB(steamID, player, 'game');
                            sendTelegramMessage(`${profileURL}\n${Language.GameBannedAgain}`);
                        } else if (player.NumberOfGameBans > profile.NumberOfGameBans) {
                            updateProfileDB(steamID, player, 'game');
                            sendTelegramMessage(`${profileURL}\n${Language.GameBanned}`);  
                        }
                    });
                });
            }
        });
    });
    setTimeout(getBanData, 1000 * 60 * Config.General.checkInterval);
}

function updateProfileDB(steamID, player, type) {
    switch(type) {
        case 'community':
            ProfileDB.update({ SteamID: steamID }, { $set: { CommunityBanned: player.CommunityBanned } }, {}, (err, numReplaced) => {
                if (err) console.error(Language.errorUpdatingDB);
            });
            break;
        case 'vac':
            ProfileDB.update({ SteamID: steamID }, { $set: { VACBanned: player.VACBanned, NumberOfVACBans: player.NumberOfVACBans, Tracked: false } }, {}, (err, numReplaced) => {
                if (err) console.error(Language.errorUpdatingDB);
            });
            break;
        case 'game':
            ProfileDB.update({ SteamID: steamID }, { $set: { NumberOfGameBans: player.NumberOfGameBans, Tracked: false } }, {}, (err, numReplaced) => {
                if (err) console.error(Language.errorUpdatingDB);
            });
            break;
        default:
            break;
    }
}