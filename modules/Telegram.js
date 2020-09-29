const TelegramAPI = require('telegram-bot-api');
const Events = require('events');
const FS = require('fs');

module.exports = function(Config, Messages) {
    this.masterID = Config.Telegram.masterChatID;
    this.telegramBot = new TelegramAPI({ token: Config.Telegram.botToken, updates: { enabled: true, get_interval: 1000 } });
    this.telegramMessageProvider = new TelegramAPI.GetUpdateMessageProvider();
    this.events = new Events.EventEmitter();

    this.isMaster = (chatID) => {
        const _this = this;
        return chatID == _this.masterID;
    };

    this.telegramBot.on('update', (update) => {
        if (update.message) {
            this.telegramBot.onMessage(update.message);
        }

        if (update.callback_query) {
            this.telegramBot.onCallbackQuery(update.callback_query);
        }
    });

    this.telegramBot.onMessage = (message) => {
        const _this = this;

        const chat = message.chat;
        const chatID = chat.id;
        //const chatType = chat.type;

        const user = message.from;
        const userID = user.id;
        const userName = (user.username ? `@${user.username}` : user.first_name);

        if (message.text) {
            const messageText = message.text.toLowerCase();
            
            if (messageText == '/users' && userID == _this.masterID) {
                _this.events.emit('command_users', userID, chatID);
            } else if (messageText.startsWith('/add')) {
                const argument = messageText.replace('/add ', '').replace(/\s+/g,'');
                _this.events.emit('command_add', userID, chatID, argument);
            } else if (messageText == '/stats') {
                _this.events.emit('command_stats', userID, chatID);
            } else if (messageText == '/start') {
                _this.events.emit('command_start', userID, chatID);
            } else if (messageText == '/request') {
                _this.events.emit('command_request', userID, chatID, userName);
            }
        }
    };

    this.telegramBot.onCallbackQuery = (message) => {
        const _this = this;

        const chatID = message.message.chat.id;
        const messageID = message.message.message_id;
        const messageText = message.message.text;
        const callbackData = message.data;

        _this.events.emit('callback', messageText, messageID, chatID, callbackData);
    };

    this.sendMessageFinal = (messageText, chatID) => {
        const _this = this;

        _this.telegramBot.sendMessage({
            chat_id: chatID,
            text: messageText,
            parse_mode: 'Markdown'
        }).catch((err) => {
            _this.events.emit('error', 'sendMessageFinal', err);
        }); 
    };

    this.sendPhotoFinal = (photoCaption, photoPath, chatID) => {
        const _this = this;

        _this.telegramBot.sendPhoto({
            chat_id: chatID,
            caption: photoCaption,
            photo: FS.createReadStream(photoPath)
        }).catch((err) => {
            _this.events.emit('error', 'sendPhotoFinal', err);
        }); 
    };

    this.sendMessage = (messageText, chatID = this.masterID) => {
        const _this = this;

        if (Array.isArray(chatID)) {
            chatID.forEach((userID) => {
                _this.sendMessageFinal(messageText, userID);
            });
        } else {
            _this.sendMessageFinal(messageText, chatID);
        }
    }

    this.sendPhoto = (photoCaption, photoPath, chatID = this.masterID) => {
        const _this = this;

        if (Array.isArray(chatID)) {
            chatID.forEach((userID) => {
                _this.sendPhotoFinal(photoCaption, photoPath, userID);
            });
        } else {
            _this.sendPhotoFinal(photoCaption, photoPath, chatID);
        }
    };

    this.sendMessageKeyboard = (messageText, inlineKeyboard, chatID = this.masterID) => {
        const _this = this;

        _this.telegramBot.sendMessage({
            chat_id: chatID,
            text: messageText,
            reply_markup: inlineKeyboard
        }).catch((err) => {
            _this.events.emit('error', 'sendMessageKeyboard', err);
        });      
    };

    this.editMessageText = (messageText, messageID, chatID, inlineKeyboard = { inline_keyboard: [] }) => {
        const _this = this;

        _this.telegramBot.editMessageText({
            chat_id: chatID,
            message_id: messageID,
            text: messageText,
            reply_markup: inlineKeyboard
        }).catch((err) => {
            _this.events.emit('error', 'editMessageText', err);
        });       
    };

    this.generateUserRequestKeyboard = (chatID, userName) => {
        const userRequestKeyboard = {
            inline_keyboard: [
                [
                    { text: Messages.buttonAccept, callback_data: `user-accept-${chatID}-${userName}` },
                    { text: Messages.buttonDeny, callback_data: `user-deny-${chatID}` }
                ]
            ]
        };
        return userRequestKeyboard;
    };

    this.generateUserListKeyboard = (users, pageNumber = 1) => {
        const firstPageEntry = (pageNumber - 1) * 6 + 1;
        const lastPageEntry = pageNumber * 6;

        const userListMenu = [];
        var userList = [];

        var current = 0;
        users.forEach((user, userIndex) => {
            if ((userIndex + 1) >= firstPageEntry && (userIndex + 1) <= lastPageEntry) {
                var listUpdated = false;
                userList.push({ text: user.Username, callback_data: `user-list-menu-user-${user.chatID}` });
                if (++current >= 3) {
                    userListMenu.push(userList);
                    listUpdated = true;
                    userList = [];
                    current = 0;
                }

                if (userIndex == (users.length - 1) && !listUpdated) {
                    userListMenu.push(userList);
                }
            }              
        });

        const prevPage = pageNumber - 1;
        const nextPage = pageNumber + 1;
        const totalPages = Math.ceil(users.length / 6);

        const menuPaging = [];
        if (pageNumber == 1) {
            menuPaging.push({ text: Messages.buttonCancel, callback_data: 'user-list-menu-cancel' });
            if (totalPages > 1) {
                menuPaging.push({ text: '>>', callback_data: `user-list-menu-next-${nextPage}` });
            }
        } else if (pageNumber == totalPages) {
            menuPaging.push({ text: '<<', callback_data: `user-list-menu-prev-${prevPage}` });
            menuPaging.push({ text: Messages.buttonCancel, callback_data: 'user-list-menu-cancel' });
        } else {
            menuPaging.push({ text: '<<', callback_data: `user-list-menu-prev-${prevPage}` });
            menuPaging.push({ text: Messages.buttonCancel, callback_data: 'user-list-menu-cancel' });
            menuPaging.push({ text: '>>', callback_data: `user-list-menu-next-${nextPage}` });
        }

        userListMenu.push(menuPaging);
        const userListKeyboard = {
            inline_keyboard: userListMenu
        };

        return userListKeyboard;
    };

    this.openUserActionMenu = (messageText, messageID, chatID, userID) => {
        const _this = this;

        const userActionKeyboard = {
            inline_keyboard: [
                [
                    { text: Messages.buttonRemove, callback_data: `user-action-menu-remove-${userID}` }
                ],
                [
                    { text: Messages.buttonCancel, callback_data: `user-action-menu-cancel` }
                ]
            ]
        };
        _this.editMessageText(messageText, messageID, chatID, userActionKeyboard); 
    };
}