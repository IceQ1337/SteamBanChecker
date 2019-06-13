const Path = require('path');
const Request = require('request');
const Config = require(Path.join(__dirname, 'config.json'));

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
                sendTelegramMessage(steamID + ' is not valid and was NOT added to the list!');
            }
        }
    }
});

TelegramBot.getMe().then((data) => {
	getBanData();
}).catch((err) => {
    console.log(`[X] ${err}`);
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
                    sendTelegramMessage(steamID + ' was successfully added to the list!');
                });
            } else {
                sendTelegramMessage('An unexpected error occurred. Please try again.');
            }
        } else {
            sendTelegramMessage('An unexpected error occurred. Please try again.');
        }
    });
}

function getBanData() {
    DB.find({ Tracked: true }, (err, profiles) => {
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
                    DB.findOne({ SteamID: steamID }, (err, profile) => {
                        if (err) return;
                        if (profile == null) return;

                        if (player.CommunityBanned && !profile.CommunityBanned) {
                            DB.update({ SteamID: steamID }, { $set: { CommunityBanned: player.CommunityBanned } }, {}, (err, numReplaced) => {
                                if (err) return;
                                sendTelegramMessage(SteamProfileURL + steamID + ' just got community banned!');
                            });
                        }

                        if (player.VACBanned && !profile.VACBanned) {
                            DB.update({ SteamID: steamID }, { $set: { VACBanned: player.VACBanned, NumberOfVACBans: player.NumberOfVACBans, Tracked: false } }, {}, (err, numReplaced) => {
                                if (err) return;
                                sendTelegramMessage(SteamProfileURL + steamID + ' just got VAC banned!');
                            });
                        } else if (player.VACBanned && player.NumberOfVACBans > profile.NumberOfVACBans) {
                            DB.update({ SteamID: steamID }, { $set: { VACBanned: player.VACBanned, NumberOfVACBans: player.NumberOfVACBans, Tracked: false } }, {}, (err, numReplaced) => {
                                if (err) return;
                                sendTelegramMessage(SteamProfileURL + steamID + ' just got VAC banned again!');
                            });                            
                        }

                        if (player.NumberOfGameBans > profile.NumberOfGameBans && profile.NumberOfGameBans > 0) {
                            DB.update({ SteamID: steamID }, { $set: { NumberOfGameBans: player.NumberOfGameBans, Tracked: false } }, {}, (err, numReplaced) => {
                                if (err) return;
                                sendTelegramMessage(SteamProfileURL + steamID + ' just got game banned again!');
                            });  
                        } else if (player.NumberOfGameBans > profile.NumberOfGameBans) {
                            DB.update({ SteamID: steamID }, { $set: { NumberOfGameBans: player.NumberOfGameBans, Tracked: false } }, {}, (err, numReplaced) => {
                                if (err) return;
                                sendTelegramMessage(SteamProfileURL + steamID + ' just got game banned!');
                            });  
                        }
                    });
                });
            }
        });
    });
    setTimeout(getBanData, 1000 * 60 * Config.Steam.checkInterval);
}