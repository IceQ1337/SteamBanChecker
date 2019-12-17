const Path = require('path');
const Request = require('request');
const XML = require('xml2js');
const Datastore = require('nedb');
const Telegram = require('telegram-bot-api');
const Config = require(Path.join(__dirname, '/data/config.json'));
const Messages = require(Path.join(__dirname, `/data/messages/${Config.General.messages}.json`));
const Version = require('./package.json').version;

Request('https://raw.githubusercontent.com/IceQ1337/SteamBanChecker/master/package.json', (err, response, body) => {
    if (err) console.error(err);
    if (response.statusCode && response.statusCode === 200) {
        let newVersion = JSON.parse(body).version;
        if (Version != newVersion)
            console.warn(`${Messages.updateAvailable} (${Version} ==> ${newVersion})`);
    }
});

if (Config == null) {
    console.error('Missing config information. Exiting now.');
    process.exitCode = 1;
}

if (Messages == null) {
    console.error('Message File Missing. Exiting now.');
    process.exitCode = 1;
}

const SteamProfileURL = 'https://steamcommunity.com/profiles/';
const SteamWebAPIURL = `http://api.steampowered.com/ISteamUser/GetPlayerBans/v1/?key=${Config.Steam.apiKey}&steamids=`;

const REGEX_STEAMURL = /^(http|https):\/\/(www\.)?steamcommunity.com\/profiles\//;
const REGEX_STEAMID64 = /^[0-9]{17}$/;
const REGEX_STEAMURL64 = /^(http|https):\/\/(www\.)?steamcommunity.com\/profiles\/[0-9]{17}$/;
const REGEX_STEAMCUSTOMURL = /^(http|https):\/\/(www\.)?steamcommunity.com\/id\//;

const ProfileDB = new Datastore({ filename: Path.join(__dirname, '/data/db/profiles.db'), autoload: true });
const UserDB = new Datastore({ filename: Path.join(__dirname, '/data/db/users.db'), autoload: true });

ProfileDB.ensureIndex({ fieldName: 'SteamID', unique: true }, (err) => {
    if (err) console.error(err);
});

UserDB.ensureIndex({ fieldName: 'chatID', unique: true }, (err) => {
    if (err) console.error(err);
});

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

function sendPhoto(photoCaption, photoPath, chatID = Config.Telegram.masterChatID) {
    return new Promise((resolve, reject) => {
        if (Array.isArray(chatID)) {
            var users = 0;
            chatID.forEach((userID) => {
                TelegramBot.sendPhoto({
                    chat_id: userID,
                    caption: photoCaption,
                    photo: photoPath
                }).then(() => {
                    users++;
                    if (users == chatID.length) resolve();
                }).catch((err) => {
                    reject(err);
                });
            });
        } else {
            TelegramBot.sendPhoto({
                chat_id: chatID,
                caption: photoCaption,
                photo: photoPath
            }).then(() => {
                resolve();
            }).catch((err) => {
                reject(err);
            });
        }
    });
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

function replaceMessageString(message, data) {
    var output = message.replace(/%[^%]+%/g, (match) => {
        if (match in data) {
            return(data[match]);
        } else {
            return("");
        }
    });
    return(output);
}

TelegramBot.on('message', (message) => {
    var username = (message.from.username ? `@${message.from.username}` : message.from.first_name);
    var chatID = message.from.id;
    var msg = message.text;

    if (msg) {
        var userIDs = [];
        UserDB.find({}, (err, users) => {
            if (err) console.error(err);
    
            users.forEach((user) => {
                userIDs.push(user.chatID);
            });
    
            if (chatID == Config.Telegram.masterChatID || userIDs.includes(parseInt(chatID))) {
                if (msg.startsWith('/add')) {
                    var steamID = msg.replace('/add ', '');
                    if (steamID.endsWith('/')) steamID = steamID.slice(0, -1);
                    if (steamID.match(REGEX_STEAMID64)) {
                        addProfile(SteamWebAPIURL + steamID, chatID);
                    } else if (steamID.match(REGEX_STEAMURL64)) {
                        var steamID64 = steamID.replace(REGEX_STEAMURL, '');
                        addProfile(SteamWebAPIURL + steamID64, chatID);
                    } else if (steamID.match(REGEX_STEAMCUSTOMURL)) {
                        if (steamID.replace(REGEX_STEAMCUSTOMURL, '').indexOf('/') == -1) {
                            resolveCustomURL(steamID).then((steamID64) => {
                                addProfile(SteamWebAPIURL + steamID64, chatID);
                            }).catch(() => {
                                sendMessage(`${steamID} ${Messages.errorURLResolve}`, chatID);
                            });
                        } else {
                            sendMessage(`${steamID} ${Messages.profileInvalid}`, chatID);
                        }
                    } else {
                        sendMessage(`${steamID} ${Messages.profileInvalid}`, chatID);
                    }
                }
                
                if (msg == '/users' && chatID == Config.Telegram.masterChatID) {
                    getUserAmount().then((userAmount) => {
                        if (userAmount > 0) {
                            getCurrentUserListMenuPage().then((userListKeyboard) => {
                                sendMessageKeyboard(Messages.menuUserListTitle, userListKeyboard, chatID);
                            }).catch((err) => {
                                sendMessage(err, chatID);
                            });
                        } else {
                            sendMessage(Messages.userEmpty);
                        }
                    }).catch(() => {
                        sendMessage(Messages.errorUserAmount);
                    });
                }

                if (msg == '/stats') {
                    ProfileDB.find({}, (err, profiles) => {
                        if (err) {
                            sendMessage(err, chatID);
                        } else {
                            UserDB.count({}, (err, users) => {
                                if (err) {
                                    sendMessage(err, chatID);
                                } else {
                                    var profilesBanned = 0;
                                    var userProfiles = 0;
                                    var userProfilesBanned = 0;
                                    profiles.forEach((profile) => {
                                        if (profile.Tracked == false) profilesBanned++;
                                        if (profile.Users.includes(chatID)) {
                                            userProfiles++;

                                            if (profile.Tracked == false) {
                                                userProfilesBanned++;
                                            }
                                        }
                                    });

                                    var botStatistics = replaceMessageString(Messages.botStatistics, { '%TOTAL%': profiles.length, '%USERS%': users + 1, '%BANNED%': profilesBanned, '%CHECKED%': profiles.length - profilesBanned, '%PERCENT%': Math.round((profilesBanned / profiles.length) * 100) });
                                    var userStatistics = replaceMessageString(Messages.userStatistics, { '%PROFILES%': userProfiles, '%BANNED%': userProfilesBanned, '%PERCENT%': Math.round((userProfilesBanned / userProfiles) * 100) });
                                    sendMessage(botStatistics + '\n\n' + userStatistics, chatID);
                                }
                            });
                        }
                    });
                }
    
                if (msg == '/version') {
                    sendMessage(Version, chatID);
                }
            } else {
                if (msg == '/start') {
                    sendMessage(Messages.userStartInfo, chatID);
                } else if (msg == '/request') {
                    if (Config.General.allowRequests) {
                        var userRequestKeyboard = {
                            inline_keyboard: [
                                [
                                    { text: Messages.buttonAccept, callback_data: `user-accept-${chatID}-${username}` },
                                    { text: Messages.buttonDeny, callback_data: `user-deny-${chatID}` }
                                ]
                            ]
                        };
                        sendMessage(Messages.userRequestSend, chatID);
                        sendMessageKeyboard(`${username} ${Messages.userRequestSendMaster}`, userRequestKeyboard);
                    }
                }
            }
        });
    }
});

TelegramBot.on('inline.callback.query', (message) => {
    var chatID = message.message.chat.id;
    var messageID = message.message.message_id;
    var messageText = message.message.text;
    var callback_data = message.data;
    
    if (callback_data.startsWith('user-accept-')) {
        var userData = callback_data.split("-");
        addUser(chatID, messageID, parseInt(userData[2]), userData[3]);
    } else if (callback_data.startsWith('user-deny-')) {
        editMessageText(chatID, messageID, Messages.userRequestDeniedMaster);
        sendMessage(Messages.userRequestDenied, parseInt(callback_data.replace('user-deny-', '')));
    } else if (callback_data.startsWith('user-list-menu-prev-')) {
        editUserListMenuPage(chatID, messageID, messageText, parseInt(callback_data.replace('user-list-menu-prev-', '')));
    } else if (callback_data.startsWith('user-list-menu-next-')) {
        editUserListMenuPage(chatID, messageID, messageText, parseInt(callback_data.replace('user-list-menu-next-', '')));
    } else if (callback_data == 'user-list-menu-cancel') {
        editMessageText(chatID, messageID, Messages.menuActionCanceled);
    } else if (callback_data.startsWith('user-list-menu-user-')) {
        openUserActionMenu(chatID, messageID, Messages.menuActionChoose, parseInt(callback_data.replace('user-list-menu-user-', '')));
    } else if (callback_data.startsWith('user-action-menu-remove-')) {
        removeUser(chatID, messageID, parseInt(callback_data.replace('user-action-menu-remove-', '')));
    } else if (callback_data == 'user-action-menu-cancel') {
        editMessageText(chatID, messageID, Messages.menuActionCanceled);
    }
});

TelegramBot.getMe().then(() => {
	getBanData();
}).catch((err) => {
    console.error(err);
});
TelegramBot.on('polling_error', (err) => { console.error(err); });

function getUserAmount() {
    return new Promise((resolve, reject) => {
        UserDB.find({}, (err, users) => {
            if (err) reject('error');
            resolve(users.length);
        });
    });
}

function getCurrentUserListMenuPage(pageNumber = 1) {
    return new Promise((resolve, reject) => {
        UserDB.find({}, (err, users) => {
            if (err) {
                console.error(err);
                reject(Messages.errorReadingUserlist);
            }
    
            var firstPageEntry = (pageNumber - 1)  * 6 + 1;
            var lastPageEntry = pageNumber * 6;
    
            var userListMenu = [];
            var userList = [];
            var current = 0;
            users.forEach((user, index) => {
                if ((index + 1) >= firstPageEntry && (index + 1) <= lastPageEntry) {
                    var listUpdated = false;
                    userList.push({ text: user.Username, callback_data: `user-list-menu-user-${user.chatID}` });
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
                menuPaging.push({ text: Messages.buttonCancel, callback_data: 'user-list-menu-cancel' });
                if (totalPages > 1) menuPaging.push({ text: '>>', callback_data: `user-list-menu-next-${nextPage}` });
            } else if (pageNumber == totalPages) {
                menuPaging.push({ text: '<<', callback_data: `user-list-menu-prev-${prevPage}` });
                menuPaging.push({ text: Messages.buttonCancel, callback_data: 'user-list-menu-cancel' });
            } else {
                menuPaging.push({ text: '<<', callback_data: `user-list-menu-prev-${prevPage}` });
                menuPaging.push({ text: Messages.buttonCancel, callback_data: 'user-list-menu-cancel' });
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
            { text: Messages.buttonRemove, callback_data: `user-action-menu-remove-${userID}` }
        ],
        [
            { text: Messages.buttonCancel, callback_data: `user-action-menu-cancel` }
        ]
    ];
    var userActionKeyboard = {
        inline_keyboard: userActionMenu
    };
    editMessageText(chatID, messageID, messageText, userActionKeyboard);
}

function addUser(chatID, messageID, userID, username) {
    UserDB.insert({ chatID: userID, Username: username }, (err) => {
        if (err) {
            if (err.errorType == 'uniqueViolated') sendMessage(Messages.userExists);
            console.error(err);
        }
        sendMessage(Messages.userRequestAccepted, userID);
        editMessageText(chatID, messageID, Messages.userRequestAcceptedMaster);
    });
}

function removeUser(chatID, messageID, userID) {
    UserDB.remove({ chatID: userID }, {}, (err) => {
        if (err) console.error(err);
        sendMessage(Messages.userRequestRevoked, userID);
        editMessageText(chatID, messageID, Messages.userRequestRevokedMaster);
    });
}

function resolveCustomURL(customURL) {
    return new Promise((resolve, reject) => {
        Request(customURL + '?xml=1', (err, response, body) => {
            if (err) reject(err);

            if (response.statusCode && response.statusCode === 200) {
                XML.parseString(body, (err, result) => {
                    if (err) reject(err);
                    resolve(result.profile.steamID64[0]);
                });
            } else {
                reject();
            }
        });
    });
}

function addProfile(apiURL, chatID) {
    Request(apiURL, (err, response, body) => {
        if (err) console.error(err);

        if (response.statusCode && response.statusCode === 200) {
            var apiData = JSON.parse(body);
            if (apiData.players.length > 0 && apiData.players[0].SteamId) {
                var player = apiData.players[0];
                ProfileDB.insert({ SteamID: player.SteamId, CommunityBanned: player.CommunityBanned, VACBanned: player.VACBanned, NumberOfVACBans: player.NumberOfVACBans, NumberOfGameBans: player.NumberOfGameBans, Tracked: true, Users: [chatID] }, (err) => {
                    if (err) {
                        if (err.errorType == 'uniqueViolated') {
                            ProfileDB.findOne({ SteamID: player.SteamId }, (err, profile) => {
                                if (err) console.error(Messages.errorUpdatingDB);
                                if (profile == null) return;

                                if (profile.Users.includes(chatID)) {
                                    sendMessage(`${player.SteamId} ${Messages.profileExists}`, chatID);
                                } else {
                                    profile.Users.push(chatID);
                                    ProfileDB.update({ SteamID: player.SteamId }, { $set: { Users: profile.Users } }, {}, (err) => {
                                        if (err) console.error(Messages.errorUpdatingDB);
                                        sendMessage(`${player.SteamId} ${Messages.profileAdded}`, chatID);
                                    });
                                }
                            });
                        } else {
                            sendMessage(Messages.errorUpdatingDB, chatID);
                        }
                    } else {
                        sendMessage(`${player.SteamId} ${Messages.profileAdded}`, chatID);
                    }
                });
            } else {
                sendMessage(Messages.errorAPIData, chatID);
            }
        } else {
            sendMessage(Messages.errorAPIRequest, chatID);
        }
    });
}

function updateProfile(steamID, player, type) {
    switch(type) {
        case 'community':
            ProfileDB.update({ SteamID: steamID }, { $set: { CommunityBanned: player.CommunityBanned } }, {}, (err) => {
                if (err) console.error(Messages.errorUpdatingDB);
            });
            break;
        case 'vac':
            ProfileDB.update({ SteamID: steamID }, { $set: { VACBanned: player.VACBanned, NumberOfVACBans: player.NumberOfVACBans, Tracked: false } }, {}, (err) => {
                if (err) console.error(Messages.errorUpdatingDB);
            });
            break;
        case 'game':
            ProfileDB.update({ SteamID: steamID }, { $set: { NumberOfGameBans: player.NumberOfGameBans, Tracked: false } }, {}, (err) => {
                if (err) console.error(Messages.errorUpdatingDB);
            });
            break;
        default:
            break;
    }
}

function handleDisplayedBan(steamID, profileURL, banMessage, users) {
    //if (Config.Screenshot.takeScreenshot && (Config.Screenshot.sendScreenshot || Config.Screenshot.saveScreenshot)) {}
    sendMessage(`${profileURL}\n${banMessage}`, users);
}

function getBanData() {
    ProfileDB.find({ Tracked: true }, (err, profiles) => {
        if (err) console.error(err);

        var profileIDs = [];
        profiles.forEach((profile) => {
            profileIDs.push(profile.SteamID);
        });

        var queries = Math.ceil(profileIDs.length / 100);
        for (let i = 0; i < queries; i++) {
            var queryStart = i * 100;
            var queryEnd = (i + 1) * 100;
            var queryProfiles = profileIDs.slice(queryStart, queryEnd);

            var apiURL = SteamWebAPIURL + queryProfiles.reverse().join();
            Request(apiURL, (err, response, body) => {
                if (err) console.error(err);
    
                if (response.statusCode && response.statusCode === 200) {
                    var apiData = JSON.parse(body);
                    apiData.players.forEach((player) => {
                        var steamID = player.SteamId;
                        var profileURL = SteamProfileURL + steamID;
                        ProfileDB.findOne({ SteamID: steamID }, (err, profile) => {
                            if (err) console.error(err);
                            if (profile == null) return;
    
                            if (player.CommunityBanned && !profile.CommunityBanned) {
                                updateProfile(steamID, player, 'community');
                                sendMessage(`${profileURL}\n${Messages.profileCommunityBanned}`, profile.Users);
                            }
    
                            if (player.VACBanned && !profile.VACBanned) {
                                updateProfile(steamID, player, 'vac');
                                handleDisplayedBan(steamID, profileURL, Messages.profileVACBanned, profile.Users);
                            } else if (player.VACBanned && player.NumberOfVACBans > profile.NumberOfVACBans) {
                                updateProfile(steamID, player, 'vac');
                                handleDisplayedBan(steamID, profileURL, Messages.profileVACBannedAgain, profile.Users);                       
                            }
    
                            if (player.NumberOfGameBans > profile.NumberOfGameBans && profile.NumberOfGameBans > 0) {
                                updateProfile(steamID, player, 'game');
                                handleDisplayedBan(steamID, profileURL, Messages.profileGameBannedAgain, profile.Users);   
                            } else if (player.NumberOfGameBans > profile.NumberOfGameBans) {
                                updateProfile(steamID, player, 'game');
                                handleDisplayedBan(steamID, profileURL, Messages.profileGameBanned, profile.Users);   
                            }
                        });
                    });
                }
            });
        }
    });
    setTimeout(getBanData, 1000 * 60 * Config.General.checkInterval);
}