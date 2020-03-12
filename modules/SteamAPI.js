const Request = require('request');

const EventEmitter = require('events');
class SteamAPI extends EventEmitter {
    constructor(Config, Database) {
        super();

        this.apiKey = Config.Steam.apiKey;
        this.apiURL = `http://api.steampowered.com/ISteamUser/GetPlayerBans/v1/?key=${this.apiKey}&steamids=`;
        this.profileURL = 'https://steamcommunity.com/profiles/';

        this.profiles = Database.db.profiles;
    }

    queryProfile(profile, chatID) {
        const _this = this;

        const apiURL = _this.apiURL + profile;
        Request(apiURL, (err, response, body) => {
            if (err) {
                _this.emit('error', 'queryProfile', err);
            }

            if (response && response.statusCode && response.statusCode === 200) {
                const apiData = JSON.parse(body);
                if (apiData.players && apiData.players.length > 0 && apiData.players[0].SteamId) {
                    const player = apiData.players[0];
                    const playerData = { SteamID: player.SteamId, CommunityBanned: player.CommunityBanned, VACBanned: player.VACBanned, NumberOfVACBans: player.NumberOfVACBans, NumberOfGameBans: player.NumberOfGameBans, Tracked: true, Users: [chatID] };
                    _this.emit('playerdata', playerData, chatID);
                } else {
                    _this.emit('error', 'queryProfile', 'INVALID RESPONSE');
                }
            } else {
                _this.emit('error', 'queryProfile', 'NO RESPONSE');
            }
        });
    }

    queryProfileChunks(profiles) {
        const _this = this;

        const apiURL = _this.apiURL + profiles.join();
        Request(apiURL, (err, response, body) => {
            if (err) {
                _this.emit('error', 'queryProfileChunks', err);
            }

            if (response) {
                if (response.statusCode === 200) {
                    const apiData = JSON.parse(body);
                    if (apiData.players) {
                        apiData.players.forEach((player) => {
                            _this.profiles.findOne({ SteamID: player.SteamId }, (err, profile) => {
                                if (err) {
                                    _this.emit('error', 'queryProfileChunks', err);
                                }
    
                                if (profile == null) {
                                    _this.emit('error', 'queryProfileChunks', 'Unknown Profile');
                                }
    
                                if (player.CommunityBanned && !profile.CommunityBanned) {
                                    _this.emit('ban', 'community', player, profile.Users);
                                }
    
                                if (player.VACBanned && !profile.VACBanned) {
                                    _this.emit('ban', 'vac', player, profile.Users);
                                } else if (player.VACBanned && player.NumberOfVACBans > profile.NumberOfVACBans) {
                                    _this.emit('ban', 'vac_multiple', player, profile.Users);
                                }
    
                                if (player.NumberOfGameBans > profile.NumberOfGameBans) {
                                    if (profile.NumberOfGameBans > 0) {
                                        _this.emit('ban', 'game_multiple', player, profile.Users);
                                    } else {
                                        _this.emit('ban', 'game', player, profile.Users);
                                    }
                                }
                            });
                        });
                    } else {
                        _this.emit('error', 'queryProfileChunks', 'Invalid Response');
                    }
                } else {
                    _this.emit('error', 'queryProfileChunks', `Invalid Status Code: ${response.statusCode}`);
                }
            } else {
                _this.emit('error', 'queryProfileChunks', 'No Response');
            }
        });
    }
}

module.exports = SteamAPI;