const Path = require('path');
const ChildProcess = require('child_process');
const Config = require('./configs/config.json');

function startBanChecker(scriptPath, callback) {
    var invoked = false;
    var process = ChildProcess.fork(scriptPath, [], { env: { messengerType: Config.General.messengerType } });

    process.on('error', (err) => {
        if (invoked) return;
        invoked = true;
        callback(err);
    });

    process.on('exit', (exitCode) => {
        if (invoked) return;
        invoked = true;
        callback((exitCode === 0 ? null : new Error('Exit Code: ' + exitCode)));
    });

    console.log(`[${new Date().toUTCString()}] [INFO] Ban Checker Process SPAWNED.`);
}

var scriptPath;
if (Config.General.messengerType === 'TELEGRAM') {
    scriptPath = Path.join(__dirname, 'server_telegram.js');
} else {
    console.log(`[${new Date().toUTCString()}] [ERROR] Invalid Messenger Type.`);
}

if (scriptPath) {
    startBanChecker(scriptPath, (err) => {
        if (err) throw err;
        console.log(`[${new Date().toUTCString()}] [ERROR] Ban Checker Process STOPPED.`);
    });
}