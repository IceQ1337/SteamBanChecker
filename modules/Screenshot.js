const Path = require('path');
const Webshot = require('webshot-node');

module.exports = function() {
    this.saveProfile = (profileURL, profileID) => {
        return new Promise((resolve, reject) => {
            const options = { screenSize: { width: 1024, height: 768 }, shotSize: { width: 'window', height: 'window' }};
            const imagePath = Path.join(__dirname, `../datastore/screenshots/${profileID}.png`);
            Webshot(profileURL, imagePath, options, (err) => {
                if (err) reject(err);
                resolve(imagePath);
            });;
        });
    };
}