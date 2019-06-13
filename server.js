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
const UserDB = new Datastore({ filename: Path.join(__dirname, 'users.db'), autoload: true });

ProfileDB.ensureIndex({ fieldName: 'SteamID', unique: true }, (err) => {
    if (err) console.error(err);
});

UserDB.ensureIndex({ fieldName: 'chatID', unique: true }, (err) => {
    if (err) console.error(err);
});

const Telegram = require('telegram-bot-api');
const TelegramBot = new Telegram({ token: Config.Telegram.botToken, updates: { enabled: true } });

function sendTelegramMessage(message, chatID = Config.Telegram.masterChatID) {
    TelegramBot.sendMessage({
        chat_id: chatID,
        text: message,
        parse_mode: 'Markdown'
    }).catch((err) => {
        console.error(err);
    });
}

function sendTelegramMessageAcceptDeny(message, inlineKeyboard, chatID = Config.Telegram.masterChatID) {
    TelegramBot.sendMessage({
        chat_id: chatID,
        text: message,
        reply_markup: JSON.stringify(inlineKeyboard)
    }).catch((err) => {
        console.error(err);
    });  
}

TelegramBot.on('message', (message) => {
    var username = (message.from.username ? `@${message.from.username}` : message.from.first_name);
    var chatID = message.from.id;
    var msg = message.text;

    var userIDs = [];
    UserDB.find({}, (err, users) => {
        if (err) console.error(err);
        users.forEach((user) => {
            userIDs.push(user.chatID);
        });

        if (chatID == Config.Telegram.masterChatID || userIDs.includes(chatID.toString())) {
            if (msg.startsWith('/add')) {
                var steamID = msg.replace('/add ', '');
                if (steamID.match(REGEX_STEAMID64)) {
                    addProfile(SteamWebAPIURL + steamID, chatID);
                } else if (steamID.match(REGEX_STEAMURL64)) {
                    var steamID64 = steamID.replace(REGEX_STEAMURL, '');
                    addProfile(SteamWebAPIURL + steamID64, chatID);
                } else {
                    sendTelegramMessage(`${steamID} ${Language.profileInvalid}`, chatID);
                }
            }
        } else {
            if (msg == '/start') {
                sendTelegramMessage(Language.userStartInfo, chatID);
            } else if (msg == '/request') {
                if (Config.General.allowRequests) {
                    var inlineKeyboard = {
                        inline_keyboard: [
                            [
                                {
                                    text: Language.buttonAccept,
                                    callback_data: `user-accept-${chatID}`
                                },
                                {
                                    text: Language.buttonDeny,
                                    callback_data: `user-deny-${chatID}`
                                }
                            ]
                        ]
                    };
                    sendTelegramMessage(Language.userRequestSend, chatID);
                    sendTelegramMessageAcceptDeny(`${username} ${Language.userRequestSendMaster}`, inlineKeyboard);
                }
            } else if (msg == '/master') {
                sendTelegramMessage(Language.masterInfo, chatID);
            }
        }
    })
});

TelegramBot.on('inline.callback.query', (message) => {
    var callback_data = message.data;

    TelegramBot.editMessageReplyMarkup({
        chat_id: message.message.chat.id,
        message_id: message.message.message_id,
        reply_markup: JSON.stringify({ inline_keyboard: [] })
    }).catch((err) => {
        console.error(err);
    });
    
    if (callback_data.startsWith('user-accept-')) {
        var userID = callback_data.replace('user-accept-', '');
        UserDB.insert({ chatID: userID }, (err) => {
            if (err) {
                if (err.errorType == 'uniqueViolated') sendTelegramMessage(Language.userExists);
                return;
            }
            sendTelegramMessage(Language.userRequestAcceptedMaster);
            sendTelegramMessage(Language.userRequestAccepted, userID);
        });
    } else if (callback_data.startsWith('user-deny-')) {
        var userID = callback_data.replace('user-deny-', '');
        sendTelegramMessage(Language.userRequestDeniedMaster);
        sendTelegramMessage(Language.userRequestDenied, userID);
    }
});

TelegramBot.getMe().then(() => {
	getBanData();
}).catch((err) => {
    console.error(err);
});

function addProfile(apiURL, chatID) {
    Request(apiURL, (err, response, body) => {
        if (err) return;
        if (response.statusCode === 200) {
            var apiData = JSON.parse(body);
            if (apiData.players[0].SteamId) {
                var player = apiData.players[0];
                if (chatID == Config.Telegram.masterChatID) {
                    var profile = { SteamID: player.SteamId, CommunityBanned: player.CommunityBanned, VACBanned: player.VACBanned, NumberOfVACBans: player.NumberOfVACBans, NumberOfGameBans: player.NumberOfGameBans, Tracked: true };
                } else {
                    var profile = { SteamID: player.SteamId, CommunityBanned: player.CommunityBanned, VACBanned: player.VACBanned, NumberOfVACBans: player.NumberOfVACBans, NumberOfGameBans: player.NumberOfGameBans, Tracked: true, User: chatID };
                }
                ProfileDB.insert(profile, (err) => {
                    if (err) {
                        if (err.errorType == 'uniqueViolated') sendTelegramMessage(`${player.SteamId} ${Language.profileExists}`, chatID);
                        return;
                    }
                    sendTelegramMessage(`${player.SteamId} ${Language.profileAdded}`, chatID);
                });
            } else {
                sendTelegramMessage(Language.errorUnexpected, chatID);
            }
        } else {
            sendTelegramMessage(Language.errorUnexpected, chatID);
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

                        var userID = (profile.User ? profile.User : Config.Telegram.masterChatID);

                        if (player.CommunityBanned && !profile.CommunityBanned) {
                            updateProfileDB(steamID, player, 'community');
                            sendTelegramMessage(`${profileURL}\n${Language.profileCommunityBanned}`, userID);
                        }

                        if (player.VACBanned && !profile.VACBanned) {
                            updateProfileDB(steamID, player, 'vac');
                            sendTelegramMessage(`${profileURL}\n${Language.profileVACBanned}`, userID);
                        } else if (player.VACBanned && player.NumberOfVACBans > profile.NumberOfVACBans) {
                            updateProfileDB(steamID, player, 'vac');
                            sendTelegramMessage(`${profileURL}\n${Language.profileVACBannedAgain}`, userID);                        
                        }

                        if (player.NumberOfGameBans > profile.NumberOfGameBans && profile.NumberOfGameBans > 0) {
                            updateProfileDB(steamID, player, 'game');
                            sendTelegramMessage(`${profileURL}\n${Language.profileGameBannedAgain}`, userID);
                        } else if (player.NumberOfGameBans > profile.NumberOfGameBans) {
                            updateProfileDB(steamID, player, 'game');
                            sendTelegramMessage(`${profileURL}\n${Language.profileGameBanned}`, userID);  
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
            ProfileDB.update({ SteamID: steamID }, { $set: { CommunityBanned: player.CommunityBanned } }, {}, (err) => {
                if (err) console.error(Language.errorUpdatingDB);
            });
            break;
        case 'vac':
            ProfileDB.update({ SteamID: steamID }, { $set: { VACBanned: player.VACBanned, NumberOfVACBans: player.NumberOfVACBans, Tracked: false } }, {}, (err) => {
                if (err) console.error(Language.errorUpdatingDB);
            });
            break;
        case 'game':
            ProfileDB.update({ SteamID: steamID }, { $set: { NumberOfGameBans: player.NumberOfGameBans, Tracked: false } }, {}, (err) => {
                if (err) console.error(Language.errorUpdatingDB);
            });
            break;
        default:
            break;
    }
}