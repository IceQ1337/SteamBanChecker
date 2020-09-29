const SteamID = require('steamid');
const Request = require('request');
const XML = require('xml2js');

module.exports = function() {
    this.getUTC = () => {
        return new Date().toUTCString();
    };

    this.toUTCString = (timestamp) => {
        return new Date(timestamp).toUTCString();
    };
    
    this.log = (type, origin, func, err) => {
        console.log(`[${this.getUTC()}] [${type}] [${origin}] ${func} > ${err}`);
    };

    this.chunkArray = (array, chunkSize) => {
        const _this = this;

        if (!array) return [];
        const firstChunk = array.slice(0, chunkSize);
        if (!firstChunk.length) {
            return array;
        }
        return [firstChunk].concat(_this.chunkArray(array.slice(chunkSize, array.length), chunkSize));
    };

    this.replaceMessageString = (messageText, messageData) => {
        return messageText.replace(/%[^%]+%/g, (match) => (match in messageData) ? messageData[match] : '');
    };

    this.resolveCustomURL = (customURL) => {
        return new Promise((resolve, reject) => {
            Request('https://steamcommunity.com/id/' + customURL + '?xml=1', (err, response, body) => {
                if (err) reject(err);
    
                if (response.statusCode && response.statusCode === 200) {
                    XML.parseString(body, (err, result) => {
                        if (err) reject(err);
                        if (result && result.profile && result.profile.steamID64[0]) {
                            resolve(result.profile.steamID64[0]);
                        } else {
                            resolve();
                        }
                    });
                } else {
                    reject();
                }
            });
        });
    };

    this.isValidSteamID = (argument) => {
        const _this = this;
        return new Promise((resolve, reject) => {
            const profileURL = /^(((http|https):\/\/(www\.)?)?steamcommunity.com\/profiles\/([0-9]{17}))|([0-9]{17})$/;
            const customURL = /^((http|https):\/\/(www\.)?)?steamcommunity.com\/id\//;

            if (argument.match(profileURL)) {
                var steamID = argument.match(/[0-9]{17}/gi)[0];
                var realID = new SteamID(steamID);
                if (realID.isValid()) {
                    resolve(steamID);
                } else {
                    resolve();
                }
            } else if (argument.match(customURL)) {
                var url = argument.replace(customURL, '');
                if (url.charAt(url.length - 1) == '/') {
                    url = url.substring(0, url.length -1);
                }

                _this.resolveCustomURL(url).then((steamID) => {
                    if (steamID) {
                        var realID = new SteamID(steamID);
                        if (realID.isValid()) {
                            resolve(steamID);
                        } else {
                            resolve();
                        }
                    } else {
                        resolve();
                    }
                }).catch((err) => {
                    reject(err);
                });
            } else {
                resolve();
            }
        });
    };
}