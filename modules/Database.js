const Path = require('path');
const NeDB = require('nedb');
const Events = require('events');

const ProfileDB = new NeDB({ filename: Path.join(__dirname, '../datastore/profiles.db'), autoload: true });
ProfileDB.ensureIndex({ fieldName: 'SteamID', unique: true }, (err) => {
    if (err) {
        console.error(new Error(`[${new Date().toUTCString()}] NEDB (ProfileDB.ensureIndex) > ${err}`));
    }
});

const UserDB = new NeDB({ filename: Path.join(__dirname, '../datastore/users.db'), autoload: true });
UserDB.ensureIndex({ fieldName: 'chatID', unique: true }, (err) => {
    if (err) {
        console.error(new Error(`[${new Date().toUTCString()}] NEDB (UserDB.ensureIndex) > ${err}`));
    }
});

module.exports = function() {
    this.db = { profiles: ProfileDB, users: UserDB };
    this.eventEmitter = new Events.EventEmitter();

    this.addUser = (userID, username) => {
        return new Promise((resolve, reject) => {
            this.db.users.insert({ chatID: userID, username: username }, (err) => {
                if (err) {
                    reject(err);
                }
                resolve();
            });
        });
    };

    this.removeUser = (userID) => {
        return new Promise((resolve, reject) => {
            this.db.users.remove({ chatID: userID }, (err) => {
                if (err) {
                    reject(err);
                }
                resolve();
            });
        });
    };

    this.getUsers = () => {
        return new Promise((resolve, reject) => {
            this.db.users.find({}, (err, users) => {
                if (err) {
                    reject(err);
                }
                resolve(users);
            });
        });
    };

    this.countUsers = () => {
        return new Promise((resolve, reject) => {
            this.db.users.count({}, (err, count) => {
                if (err) {
                    reject(err);
                }
                resolve(count);
            });
        });
    };

    this.addProfile = (chatID, profileData) => {
        return new Promise((resolve, reject) => {
            this.db.profiles.insert(profileData, (err) => {
                if (err) {
                    if (err.errorType == 'uniqueViolated') {
                        this.db.profiles.update({ SteamID: profileData.SteamID }, { $addToSet: { Users: chatID } }, {}, () => {
                            resolve();
                        });
                    } else {
                        reject(err);
                    }
                } else {
                    resolve();
                }
            });
        });
    };

    /*
    this.removeProfile = (steamID) => {
        return new Promise((resolve, reject) => {
            this.db.profiles.remove({ SteamID: steamID }, (err) => {
                if (err) {
                    reject(err);
                }
                resolve();
            });
        });
    };
    */

    this.updateProfile = (steamID, updateData) => {
        this.db.profiles.update({ SteamID: steamID }, { $set: updateData }, {}, (err) => {
            if (err) {
                _this.eventEmitter.emit('error', 'updateProfile', err);
            }
        });
    };

    this.getProfile = (steamID) => {
        return new Promise((resolve, reject) => {
            this.db.profiles.findOne({ SteamID: steamID }, (err, profile) => {
                if (err) {
                    reject(err);
                }
                resolve(profile);
            });
        });
    };

    this.getProfiles = () => {
        return new Promise((resolve, reject) => {
            this.db.profiles.find({}, (err, profiles) => {
                if (err) {
                    reject(err);
                }
                resolve(profiles);
            });
        });
    };

    this.getTrackedProfiles = () => {
        return new Promise((resolve, reject) => {
            this.db.profiles.find({ Tracked: true }, { SteamID: 1, _id: 0 }, (err, profiles) => {
                if (err) {
                    reject(err);
                }

                var result = [];
                profiles.forEach((profile) => {
                    result.push(profile.SteamID);
                });
                resolve(result);
            });
        });
    };

    this.getStats = (chatID) => {
        return new Promise((resolve, reject) => {
            var profiles = -1;
            this.getProfiles().then((result) => {
                profiles = result;
                return this.countUsers();
            }).then((userCount) => {
                var bannedProfiles = 0;
                var userProfiles = 0;
                var userProfilesBanned = 0;

                if (profiles.length > 0) {
                    profiles.forEach((profile) => {
                        if (!profile.Tracked) {
                            bannedProfiles++;
                        }

                        if (profile.Users.includes(chatID)) {
                            userProfiles++;
                            if (!profile.Tracked) {
                                userProfilesBanned++;
                            }
                        }
                    });

                    const stats = { profileCount: profiles.length, bannedProfiles: bannedProfiles, userCount: userCount + 1 , userProfiles: userProfiles, userProfilesBanned: userProfilesBanned };
                    resolve(stats);
                } else {
                    resolve();
                }
            }).catch((err) => {
                reject(err);
            });
        });
    };
}