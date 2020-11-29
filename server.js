const io = require('socket.io');
const forge = require('node-forge');

const server = io.listen(8000);

let session_keys = [];

(async() => {

    console.log('сервер запущен :^)');

    server.on('connection', function (socket) {

        console.log('у нас новенький:', socket.id);

        socket.emit('gen_keys');

        socket.on('send', function (data) {

            let item = {
                'from': socket.id,
                'to': data.to,
                'msg': data.message,
                'auth_x': data.x,
            };

            // console.log('передача зашифрованного сообщения:');
            // console.log(item);

            socket.to(data.to).emit('message', item);

        });


        socket.on('request_s', (data) => {
            let socket_to = data.to;

            console.log('пользователь', socket.id, 'запросил проверку аутентификации для', socket_to);

            socket.to(socket_to).emit('request_s', {
                'from': socket.id,
                'e': data.e
            });
        });

        socket.on('confirm_s', (data) => {
            let socket_to = data.to;

            console.log('пользователь', socket.id, 'отправил подтверждение аутентификации для', socket_to);

            socket.to(socket_to).emit('confirm_s', {
                'from': socket.id,
                's': data.s
            });
        });

        socket.on('publish_public_data', function (data) {

            console.log(socket.id, 'опубликовал свои публичные данные:');
            console.log('открытый ключ (' + data.p + ', ' + data.q + ', ' + data.g + ', ' + data.y + ')');

            let info = {
                'socket_id': socket.id,
                'p': data.p,
                'q': data.q,
                'g': data.g,
                'y': data.y,
            };
            session_keys.push(info);

            // Обновить открытую информацию о пользователях в чате
            server.sockets.emit('public', session_keys);
        });

        socket.on('disconnect', (reason) => {
            console.log('пользователь', socket.id, 'вышел');
            let new_session_keys = [];
            for (let i = 0; i < session_keys.length; i++) {
                if (session_keys[i].socket_id !== socket.id) {
                    new_session_keys.push(session_keys[i]);
                }
            }
            session_keys = new_session_keys;

            // Обновить открытую информацию о пользователях в чате
            server.sockets.emit('public', session_keys);
        });

    });
})();