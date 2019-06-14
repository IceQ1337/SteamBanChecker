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

function sendMessage(messageText, chatID = Config.Telegram.masterChatID) {
    if (Array.isArray(chatID)) {
        chatID.forEach((userID) => {
            TelegramBot.sendMessage({
                chat_id: userID,
                text: messageText,
                parse_mode: 'Markdown'
            }).catch((err) => {
                console.error(err);
            });
        });
    } else {
        TelegramBot.sendMessage({
            chat_id: chatID,
            text: messageText,
            parse_mode: 'Markdown'
        }).catch((err) => {
            console.error(err);
        });
    }
}

function sendMessageKeyboard(messageText, inlineKeyboard, chatID = Config.Telegram.masterChatID) {
    TelegramBot.sendMessage({
        chat_id: chatID,
        text: messageText,
        reply_markup: JSON.stringify(inlineKeyboard)
    }).catch((err) => {
        console.error(err);
    });  
}

function editMessageText(chatID, messageID, messageText, inlineKeyboard = { inline_keyboard: [] }) {
    TelegramBot.editMessageText({
        chat_id: chatID,
        message_id: messageID,
        text: messageText,
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
                    sendMessage(`${steamID} ${Language.profileInvalid}`, chatID);
                }
            }
            
            if (msg == '/users' && chatID == Config.Telegram.masterChatID) {
                getCurrentUserListMenuPage().then((userListKeyboard) => {
                    sendMessageKeyboard(Language.menuUserListTitle, userListKeyboard, chatID);
                }).catch((err) => {
                    sendMessage(err, chatID);
                });
            }
        } else {
            if (msg == '/start') {
                sendMessage(Language.userStartInfo, chatID);
            } else if (msg == '/request') {
                if (Config.General.allowRequests) {
                    var userRequestKeyboard = {
                        inline_keyboard: [
                            [
                                { text: Language.buttonAccept, callback_data: `user-accept-${chatID}` },
                                { text: Language.buttonDeny, callback_data: `user-deny-${chatID}` }
                            ]
                        ]
                    };
                    sendMessage(Language.userRequestSend, chatID);
                    sendMessageKeyboard(`${username} ${Language.userRequestSendMaster}`, userRequestKeyboard);
                }
            }
        }
    })
});

TelegramBot.on('inline.callback.query', (message) => {
    var chatID = message.message.chat.id;
    var messageID = message.message.message_id;
    var messageText = message.message.text;
    var callback_data = message.data;

    TelegramBot.editMessageReplyMarkup({
        chat_id: message.message.chat.id,
        message_id: message.message.message_id,
        reply_markup: JSON.stringify({ inline_keyboard: [] })
    }).catch((err) => {
        console.error(err);
    });
    
    if (callback_data.startsWith('user-accept-')) {
        addUser(chatID, messageID, parseInt(callback_data.replace('user-accept-', '')));
    } else if (callback_data.startsWith('user-deny-')) {
        editMessageText(chatID, messageID, Language.userRequestDeniedMaster);
        sendMessage(Language.userRequestDenied, parseInt(callback_data.replace('user-deny-', '')));
    } else if (callback_data.startsWith('user-list-menu-prev-')) {
        editUserListMenuPage(chatID, messageID, messageText, parseInt(callback_data.replace('user-list-menu-prev-', '')));
    } else if (callback_data.startsWith('user-list-menu-next-')) {
        editUserListMenuPage(chatID, messageID, messageText, parseInt(callback_data.replace('user-list-menu-next-', '')));
    } else if (callback_data == 'user-list-menu-cancel') {
        editMessageText(chatID, messageID, Language.menuActionCanceled);
    } else if (callback_data.startsWith('user-list-menu-user-')) {
        openUserActionMenu(chatID, messageID, Language.menuActionChoose, parseInt(callback_data.replace('user-list-menu-user-', '')));
    } else if (callback_data.startsWith('user-action-menu-remove-')) {
        removeUser(chatID, messageID, parseInt(callback_data.replace('user-action-menu-remove-', '')));
    }
});

TelegramBot.getMe().then(() => {
	getBanData();
}).catch((err) => {
    console.error(err);
});

function getCurrentUserListMenuPage(pageNumber = 1) {
    return new Promise((resolve, reject) => {
        UserDB.find({}, (err, users) => {
            if (err) {
                console.error(err);
                reject(Language.errorUnexpected);
            }
    
            var firstPageEntry = (pageNumber - 1)  * 6 + 1;
            var lastPageEntry = pageNumber * 6;
    
            var userListMenu = [];
            var userList = [];
            var current = 0;
            users.forEach((user, index) => {
                if ((index + 1) >= firstPageEntry && (index + 1) <= lastPageEntry) {
                    var listUpdated = false;
                    userList.push({ text: user.chatID, callback_data: `user-list-menu-user-${user.chatID}` });
                    if (++current >= 3) {
                        userListMenu.push(userList);
                        listUpdated = true;
                        userList = [];
                        current = 0;
                    }
                    if (index === users.length -1 && !listUpdated) userListMenu.push(userList);
                }
            });
    
            var prevPage = pageNumber - 1;
            var nextPage = pageNumber + 1;

            var totalPages = Math.ceil(users.length / 6);
            var menuPaging = [];
            if (pageNumber == 1) {
                menuPaging.push({ text: Language.buttonCancel, callback_data: 'user-list-menu-cancel' });
                if (totalPages > 1) menuPaging.push({ text: '>>', callback_data: `user-list-menu-next-${nextPage}` });
            } else if (pageNumber == totalPages) {
                menuPaging.push({ text: '<<', callback_data: `user-list-menu-prev-${prevPage}` });
                menuPaging.push({ text: Language.buttonCancel, callback_data: 'user-list-menu-cancel' });
            } else {
                menuPaging.push({ text: '<<', callback_data: `user-list-menu-prev-${prevPage}` });
                menuPaging.push({ text: Language.buttonCancel, callback_data: 'user-list-menu-cancel' });
                menuPaging.push({ text: '>>', callback_data: `user-list-menu-next-${nextPage}` });
            }

            userListMenu.push(menuPaging);    
            var userListKeyboard = {
                inline_keyboard: userListMenu
            };

            resolve(userListKeyboard);
        }); 
    });
}

function editUserListMenuPage(chatID, messageID, messageText, pageNumber) {
    getCurrentUserListMenuPage(pageNumber).then((userListKeyboard) => {
        editMessageText(chatID, messageID, messageText, userListKeyboard);
    }).catch((err) => {
        sendMessage(err, chatID);
    });   
}

function openUserActionMenu(chatID, messageID, messageText, userID) {
    userActionMenu = [
        [
            { text: Language.buttonRemove, callback_data: `user-action-menu-remove-${userID}` }
        ]
    ];
    var userActionKeyboard = {
        inline_keyboard: userActionMenu
    };
    editMessageText(chatID, messageID, messageText, userActionKeyboard);
}

function addUser(chatID, messageID, userID) {
    UserDB.insert({ chatID: userID }, (err) => {
        if (err) {
            if (err.errorType == 'uniqueViolated') sendMessage(Language.userExists);
            return;
        }
        sendMessage(Language.userRequestAccepted, userID);
        editMessageText(chatID, messageID, Language.userRequestAcceptedMaster);
    });   
}

function removeUser(chatID, messageID, userID) {
    UserDB.remove({ chatID: userID }, {}, (err) => {
        if (err) console.error(err);
        sendMessage(Language.userRequestRevoked, userID);
        editMessageText(chatID, messageID, Language.userRequestRevokedMaster);
    });
}

function addProfile(apiURL, chatID) {
    Request(apiURL, (err, response, body) => {
        if (err) return;
        if (response.statusCode === 200) {
            var apiData = JSON.parse(body);
            if (apiData.players[0].SteamId) {
                var player = apiData.players[0];
                ProfileDB.insert({ SteamID: player.SteamId, CommunityBanned: player.CommunityBanned, VACBanned: player.VACBanned, NumberOfVACBans: player.NumberOfVACBans, NumberOfGameBans: player.NumberOfGameBans, Tracked: true, Users: [chatID] }, (err) => {
                    if (err) {
                        if (err.errorType == 'uniqueViolated') {
                            ProfileDB.findOne({ SteamID: player.SteamId }, (err, profile) => {
                                if (err) console.error(Language.errorUpdatingDB);
                                if (profile == null) return;

                                if (profile.Users.includes(chatID)) {
                                    sendMessage(`${player.SteamId} ${Language.profileExists}`, chatID);
                                } else {
                                    profile.Users.push(chatID);
                                    ProfileDB.update({ SteamID: player.SteamId }, { $set: { Users: profile.Users } }, {}, (err) => {
                                        if (err) console.error(Language.errorUpdatingDB);
                                        sendMessage(`${player.SteamId} ${Language.profileAdded}`, chatID);
                                    });
                                }
                            });
                        }
                        return;
                    }
                    sendMessage(`${player.SteamId} ${Language.profileAdded}`, chatID);
                });
            } else {
                sendMessage(Language.errorUnexpected, chatID);
            }
        } else {
            sendMessage(Language.errorUnexpected, chatID);
        }
    });
}

function updateProfile(steamID, player, type) {
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
                            updateProfile(steamID, player, 'community');
                            sendMessage(`${profileURL}\n${Language.profileCommunityBanned}`, profile.Users);
                        }

                        if (player.VACBanned && !profile.VACBanned) {
                            updateProfile(steamID, player, 'vac');
                            sendMessage(`${profileURL}\n${Language.profileVACBanned}`, profile.Users);
                        } else if (player.VACBanned && player.NumberOfVACBans > profile.NumberOfVACBans) {
                            updateProfile(steamID, player, 'vac');
                            sendMessage(`${profileURL}\n${Language.profileVACBannedAgain}`, profile.Users);                        
                        }

                        if (player.NumberOfGameBans > profile.NumberOfGameBans && profile.NumberOfGameBans > 0) {
                            updateProfile(steamID, player, 'game');
                            sendMessage(`${profileURL}\n${Language.profileGameBannedAgain}`, profile.Users);
                        } else if (player.NumberOfGameBans > profile.NumberOfGameBans) {
                            updateProfile(steamID, player, 'game');
                            sendMessage(`${profileURL}\n${Language.profileGameBanned}`, profile.Users);
                        }
                    });
                });
            }
        });
    });
    setTimeout(getBanData, 1000 * 60 * Config.General.checkInterval);
}