const readline = require('readline'),
    io = require('socket.io-client'),
    forge = require('node-forge'),
    bigInt = require("big-integer"),
    crypto = require('crypto');

let ioClient = io.connect('http://localhost:8000');
let rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Открытый ключ
let pub_p;
let pub_q;
let pub_g;
let pub_y;

// Закрытый ключ
let prv_w;

// Проверка подлинности
let auth_r;
let auth_x;

// Для повторной отправки при проверки подлинности
let check_e;

let session_keys = [];
let users_x = [];

async function getPrime(bits)
{
    return await new Promise((resolve, reject) => {
        return forge.prime.generateProbablePrime(bits, function (err, num) {
            if (err) {
                reject(err)
            } else {
                resolve(num)
            }
        });
    })
}

rl.on('line', function (msg) {
    for (let i = 0; i < session_keys.length; i++) {

        let user = session_keys[i];

        // Чтобы не отправлять сообщение самому себе
        if (user.socket_id !== ioClient.id) {

            console.log('собщение было отправлено ' + user.socket_id + ', ключ проверки аутентификации x = ' + auth_x);
            // console.log({
            //     'to': user.socket_id,
            //     'message': msg,
            //     'x': auth_x,
            // });

            ioClient.emit('send', {
                'to': user.socket_id,
                'message': msg,
                'x': auth_x,
            });
        }
    }

    rl.prompt(true);
});

ioClient.on('message', function (data) {

    for (let i = 0; i < session_keys.length; i++) {

        let user = session_keys[i];
        let user_socket_id = user.socket_id;

        if (user_socket_id === data.from) {

            let message = data.msg;
            let rcv_x = data.auth_x;

            console_out('было получено сообщение "' + message + '" от ' + data.from + ' с ключом проверки x = ' + rcv_x);

            // Запоминаем ключ проверки для каждого пользователя
            users_x[user_socket_id] = rcv_x;

            console_out('запросим проверку подлинности с ключом e = ' + check_e);
            ioClient.emit('request_s', {
                'to': data.from,
                'e': check_e
            });
        }
    }
});

ioClient.on('request_s', function (data) {

    console_out('от пользователя ' + data.from + ' была запрошена прроверка подлинности, его ключ e = ' + data.e)

    let e_big = bigInt(data.e);

    let check_s = prv_w.multiply(e_big).add(auth_r).mod(pub_q);

    console_out('подтверждение подлинности было отправлено, s = ' + check_s)
    ioClient.emit('confirm_s', {
        'to': data.from,
        's': check_s
    });

});

ioClient.on('confirm_s', function (data) {

    let confirm_s = data.s;
    let from_id = data.from;

    console_out('ключ подтверждения ' + from_id + ' был получен, s = ' + confirm_s);

    for (let i = 0; i < session_keys.length; i++) {

        let user = session_keys[i];
        let user_socket_id = user.socket_id;

        if (user_socket_id === data.from) {

            console.log('публичный ключ пользователя:')
            console.log(user)

            let user_y = bigInt(user.y)
            let user_g = bigInt(user.g)
            let user_p = bigInt(user.p)

            let e_big = bigInt(check_e);
            let part_y = user_y.pow(e_big);
            let s_big = bigInt(confirm_s);
            let check_x = user_g.pow(s_big).multiply(part_y).mod(user_p);

            let sent_from_user = bigInt(users_x[user_socket_id]);
            let calc_by_me = check_x;

            console_out('полученный x: ' + sent_from_user);
            // console.log(sent_from_user);
            console_out('посчитанный x: ' + check_x);
            // console.log(check_x);
            if (sent_from_user.equals(calc_by_me)) {
                console.log('+ проверка подлиности пользователя была выполнена успешно');
            } else {
                console.log('! внимание ! проверка подлиности пользовател провалилась');
            }

        }
    }

});

ioClient.on('gen_keys', async function (data) {

    // Генерация ключей
    console_out('происходит генерация ключей при подключении...');

    let q = await getPrime(4);
    let q_big =  bigInt(q.toString(16), 16);
    console_out('простое число q = ' + q_big);

    let X = await getPrime(18);
    let x_big = bigInt(X.toString(16), 16);
    let xmod = x_big.mod(q_big.multiply(2));
    let p = x_big.add(1).subtract(xmod);
    let p_big = bigInt(p.toString(16), 16);
    console_out('простое число p = ' + p_big);

    let g_big = bigInt(1n);
    let i = bigInt(2n);
    for (i; i < 2*p; i++) {
        let i_big = bigInt(i);
        if (i_big.modPow(q_big, p_big).equals(1n)) {
            g_big = i_big
            break;
        }
    }
    console_out('было выбрано g = ' + g_big);

    console_out('происходит генерация пары закрытый / открытый ключ');
    let w = bigInt.randBetween(1, q_big.subtract(1));
    let w_big = bigInt(w.toString(16), 16);

    prv_w = w_big;
    console_out('закрытый ключ w = ' + w_big);

    let y = g_big.modPow(-w_big, p_big);
    let y_big = bigInt(y.toString(16), 16);

    pub_p = p_big;
    pub_q = q_big;
    pub_g = g_big;
    pub_y = y_big;
    console_out('открытый ключ (' + p_big + ', ' + q_big + ', ' + g_big + ', ' + y_big + ')');

    ioClient.emit('publish_public_data', { p: p_big, q: q_big, g: g_big, y: y_big });

    auth_r = bigInt.randBetween(1, pub_q.subtract(1));
    auth_x = g_big.modPow(auth_r, pub_p);
    console_out('были посчитаны числа для проверки подлинности r = ' + auth_r + ' и x = ' + auth_x);

    let t = bigInt.randBetween(2, 16);
    let t_big = bigInt(t.toString(16), 16);
    check_e = bigInt.randBetween(1, bigInt(2).pow(t_big).minus(1));
    console_out('число для операции аутентификации e = ' + check_e);
});

ioClient.on('public', function (data) {

    session_keys = data;

    // console_out('public');
    console_out('в комнате ' + session_keys.length + ' человек(а)');
});

function console_out(msg) {
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    console.log(msg);
    rl.prompt(true);
}

