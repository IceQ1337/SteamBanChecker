const Config = require('./configs/config.json');
const Messages = require('./configs/messages/' + Config.General.messages + '.json');

const Utility_Module = require('./modules/Utility');
const Utility = new Utility_Module();

const Database_Module = require('./modules/Database');
const Database = new Database_Module();

const SteamAPI_Module = require('./modules/SteamAPI');
const SteamAPI = new SteamAPI_Module(Config, Database);

const Telegram_Module = require('./modules/Telegram');
const Telegram = new Telegram_Module(Config, Messages);

const Screenshot_Module = require('./modules/Screenshot');
const Screenshot = new Screenshot_Module();

Telegram.telegramBot.getMe().then(() => {
    recursiveLoop();

    // Cannot use setInterval() because of NodeJS Timeout "Bug"
    // const loop = setInterval(recursiveLoop, ((1000 * 60) * (Config.General.checkInterval > 0 ? Config.General.checkInterval : 10)));
}).catch((err) => {
    Utility.log('ERROR', 'Telegram', 'getMe', err);
});

function recursiveLoop() {
    checkProfiles();
    setTimeout(recursiveLoop, ((1000 * 60) * (Config.General.checkInterval > 0 ? Config.General.checkInterval : 10)));
}

function checkProfiles() {
    Database.getTrackedProfiles().then((profiles) => {
        Utility.log('INFO', 'INDEX', 'checkProfiles', `Checking ${profiles.length} profile${profiles.length > 1 ? 's' : ''}.`);
        const queryChunks = Utility.chunkArray(profiles, 100);
        queryChunks.forEach((queryChunk) => {
            SteamAPI.queryProfileChunks(queryChunk);
        });
    }).catch((err) => {
        Utility.log('ERROR', 'INDEX', 'checkProfiles', err);
    });
}

SteamAPI.on('error', (func, err) => {
    Utility.log('ERROR', 'SteamAPI', func, err);
});

SteamAPI.on('info', (func, info) => {
    Utility.log('INFO', 'SteamAPI', func, info);
});

SteamAPI.on('ban', (type, player, users) => {
    Utility.log('INFO', 'SteamAPI', 'Ban', `Profile: ${player.SteamId} Type: ${type}`);

    const typeCommunity = (type == 'community') ? true : false;
    const updateData = { CommunityBanned: player.CommunityBanned, VACBanned: player.VACBanned, NumberOfVACBans: player.NumberOfVACBans, NumberOfGameBans: player.NumberOfGameBans, Tracked: typeCommunity };
    Database.updateProfile(player.SteamId, updateData);
    
    const profileURL = SteamAPI.profileURL + player.SteamId;

    if (typeCommunity) {
        Telegram.sendMessage(`${profileURL}\n${Messages.profileCommunityBanned}`, users);
    } else {
        var message = -1;
        switch(type) {
            case 'vac':
                message = Messages.profileVACBanned;
            case 'vac_multiple':
                message = Messages.profileVACBannedAgain;
            case 'game_multiple':
                message = Messages.profileGameBannedAgain;
            case 'game':
                message = Messages.profileGameBanned;
            default:
                break;
        }

        if (Config.Screenshot.saveScreenshot) {
            Screenshot.saveProfile(profileURL, player.SteamId).then((imagePath) => {
                if (Config.Screenshot.sendScreenshot) {
                    Telegram.sendPhoto(`${profileURL}\n${message}`, imagePath, users);
                } else {
                    Telegram.sendMessage(`${profileURL}\n${message}`, users);
                }
            }).catch((err) => {
                Utility.log('ERROR', 'Screenshot', 'saveProfile', err);
                Telegram.sendMessage(`${profileURL}\n${message}`, users);
            });
        } else {
            Telegram.sendMessage(`${profileURL}\n${message}`, users);
        }
    }
});

SteamAPI.on('playerdata', (playerData, chatID) => {
    Database.addProfile(chatID, playerData).then(() => {
        Telegram.sendMessage(`${playerData.SteamID} ${Messages.profileAdded}`, chatID);
    }).catch((err) => {
        Utility.log('ERROR', 'Database', 'addProfile', err);
    });
});

Telegram.eventEmitter.on('error', (func, err) => {
    Utility.log('ERROR', 'Telegram', func, err);
});

Telegram.eventEmitter.on('command_start', (userID, chatID) => {
    if (userID == chatID) {
        Telegram.sendMessage(Messages.userStartInfo, chatID);
    }
});

Telegram.eventEmitter.on('command_add', (userID, chatID, argument) => {
    Database.getUsers().then((users) => {
        const userIDs = [];
        users.forEach((user) => {
            userIDs.push(user.chatID);
        });

        if (Telegram.isMaster(userID) || userIDs.includes(parseInt(userID))) {
            Utility.isValidSteamID(argument).then((validSteamID) => {
                if (validSteamID) {
                    Database.getProfile(validSteamID).then((profile) => {
                        if (profile && profile.Users.includes(chatID)) {
                            Telegram.sendMessage(`${validSteamID} ${Messages.profileExists}`, chatID);
                        } else {
                            SteamAPI.queryProfile(validSteamID, chatID);
                        }
                    }).catch((err) => {
                        Utility.log('ERROR', 'Database', 'getProfile', err);
                    });
                } else {
                    Telegram.sendMessage('Invalid Argument.\nUsage: /add <steamID64|profileURL>', chatID);
                }
            }).catch((err) => {
                Utility.log('ERROR', 'Utility', 'isValidSteamID', err);
            });
        } else {
            Telegram.sendMessage(Messages.userStartInfo, chatID);
        }
    });
});

Telegram.eventEmitter.on('command_users', (userID, chatID) => {
    if (userID == chatID) {
        if (Telegram.isMaster(userID)) {
            Database.getUsers().then((users) => {
                if (users.length > 0) {
                    Telegram.sendMessageKeyboard(Messages.menuUserListTitle, Telegram.generateUserListKeyboard(users));
                } else {
                    Telegram.sendMessage(Messages.userEmpty);
                }
            }).catch((err) => {
                Utility.log('ERROR', 'Database', 'getUsers', err);
            });
        }
    } else {
        Telegram.sendMessage(Messages.isPrivateCommand, chatID);
    }
});

Telegram.eventEmitter.on('command_request', (userID, chatID, userName) => {
    if (userID == chatID) {
        if (Config.General.allowRequests) {
            if (!Telegram.isMaster(chatID)) {
                Database.getUsers().then((users) => {
                    const userIDs = [];
                    users.forEach((user) => {
                        userIDs.push(user.chatID);
                    });
        
                    if (userIDs.includes(parseInt(chatID))) {
                        Telegram.sendMessage(Messages.userRequestAccepted, chatID);
                    } else {
                        Telegram.sendMessage(Messages.userRequestSend, chatID);
                        Telegram.sendMessageKeyboard(`${userName} ${Messages.userRequestSendMaster}`, Telegram.generateUserRequestKeyboard(chatID, userName));
                    }
                }).catch((err) => {
                    Utility.log('ERROR', 'Database', 'getUsers', err);
                });
            } else {
                Telegram.sendMessage(Messages.userRequestMaster, chatID);
            }
        } else {
            Telegram.sendMessage(Messages.userRequestDisabled, chatID);
        }
    } else {
        Telegram.sendMessage(Messages.isPrivateCommand, chatID);
    }
});

Telegram.eventEmitter.on('command_stats', (userID, chatID) => {
    Database.getUsers().then((users) => {
        const userIDs = [];
        users.forEach((user) => {
            userIDs.push(user.chatID);
        });

        if (Telegram.isMaster(userID) || userIDs.includes(parseInt(userID))) {
            Database.getStats(userID).then((stats) => {
                if (stats) {
                    const botStatistics = Utility.replaceMessageString(Messages.botStatistics, { '%TOTAL%': stats.profileCount, '%USERS%': stats.userCount, '%BANNED%': stats.bannedProfiles, '%CHECKED%': stats.profileCount - stats.bannedProfiles, '%PERCENT%': Math.round((stats.bannedProfiles / stats.profileCount) * 100) });
                    const userStatistics = Utility.replaceMessageString(Messages.userStatistics, { '%PROFILES%': stats.userProfiles, '%BANNED%': stats.userProfilesBanned, '%PERCENT%': Math.round((stats.userProfilesBanned / stats.userProfiles) * 100) });
                    Telegram.sendMessage(botStatistics + '\n\n' + userStatistics, chatID);
                } else {
                    Telegram.sendMessage(Messages.noStatistics, chatID);
                }
            }).catch((err) => {
                Utility.log('ERROR', 'Database', 'getStats', err);
            });
        } else {
            Telegram.sendMessage(Messages.userStartInfo, chatID);
        }
    });
});

Telegram.eventEmitter.on('callback', (messageText, messageID, chatID, callbackData) => {
    if (callbackData.startsWith('user-accept')) {
        const userData = callbackData.split('-');
        const userID = parseInt(userData[2]);
        const userName = userData[3];
        Database.addUser(userID, userName).then(() => {
            Telegram.sendMessage(Messages.userRequestAccepted, userID);
            Telegram.editMessageText(Messages.userRequestAcceptedMaster, messageID, chatID);
        }).catch((err) => {
            Utility.log('ERROR', 'Database', 'addUser', err);
        });
    } else if (callbackData.startsWith('user-deny')) {
        const userID = parseInt(callbackData.replace('user-deny-', ''));
        Telegram.editMessageText(Messages.userRequestDeniedMaster, messageID, chatID);
        Telegram.sendMessage(Messages.userRequestDenied, userID);
    } else if (callbackData.startsWith('user-list-menu-prev-')) {
        const pageNumber = parseInt(callbackData.replace('user-list-menu-prev-', ''));
        Database.getUsers().then((users) => {
            Telegram.editMessageText(messageText, messageID, chatID, Telegram.generateUserListKeyboard(users, pageNumber));
        }).catch((err) => {
            Utility.log('ERROR', 'Database', 'getUsers', err);
        });
    } else if (callbackData.startsWith('user-list-menu-next-')) {
        const pageNumber = parseInt(callbackData.replace('user-list-menu-next-', ''));
        Database.getUsers().then((users) => {
            Telegram.editMessageText(messageText, messageID, chatID, Telegram.generateUserListKeyboard(users, pageNumber));
        }).catch((err) => {
            Utility.log('ERROR', 'Database', 'getUsers', err);
        });
    } else if (callbackData.startsWith('user-list-menu-user-')) { 
        const userID = parseInt(callbackData.replace('user-list-menu-user-', ''));
        Telegram.openUserActionMenu(messageText, messageID, chatID, userID);
    } else if (callbackData.startsWith('user-action-menu-remove-')) {
        const userID = parseInt(callbackData.replace('user-action-menu-remove-', ''));
        Database.removeUser(userID).then(() => {
            Telegram.sendMessage(Messages.userRequestRevoked, userID);
            Telegram.editMessageText(Messages.userRequestRevokedMaster, messageID, chatID);           
        }).catch((err) => {
            Utility.log('ERROR', 'Database', 'removeUser', err);
        });
    } else if (callbackData == 'user-list-menu-cancel' || callbackData == 'user-action-menu-cancel') {
        Telegram.editMessageText(Messages.menuActionCanceled, messageID, chatID);
    }
});

/* Database Event Listeners */
Database.eventEmitter.on('error', (func, err) => {
    Utility.log('ERROR', 'Database', func, err);
});