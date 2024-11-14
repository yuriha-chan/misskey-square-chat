// Listen WebSocket on 8080 and HTTP on 3000
const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const fastify = require('fastify')();
const jwt = require('jsonwebtoken');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const wss = new WebSocket.Server({ port: 8080 });

// Login info by session key
const users = {};

// User data by ActivityPub username
const accounts = {};

const rooms = {};
const boxes = {};
const envelopes = {};

const flavors = ["クロアゲハ", "ルリタテハ", "モンシロチョウ", "オオムラサキ", "ギフチョウ", "ミヤマカラスアゲハ", "アオスジアゲハ", "イチモンジセセリ", "デネブ", "アルタイル", "ベガ", "ポロックス", "ベテルギウス", "リゲル", "シリウス", "カノープス", "デネボラ", "アルゴル", "北斗七星", "北極星", "馬頭星雲", "ダンベル星雲", "アンドロメダ銀河", "オリオン大星雲", "ハレー彗星", "金星", "火星", "木星", "土星", "山茱萸", "柘榴", "林檎", "蜜柑", "黒檀", "渋柿", "銀杏", "野薔薇", "ヒノキ", "ラクウショウ", "ナズナ", "セイタカアワダチソウ", "スミレ", "イチリンソウ", "ニッコウキスゲ", "オニユリ", "カサブランカ", "ネモフィラ", "シロツメクサ", "パンジー", "イチジク", "カーネーション", "ガーネット", "ルビー", "サファイア", "ダイアモンド", "蛍石", "砂金", "砂鉄", "水晶", "方解石", "霰石", "孔雀石", "菫青石", "藍銅鉱", "方鉛鉱", "黄鉄鉱", "緑鉛鉱", "輝安鉱", "トパーズ", "ラピスラズリ", "エメラルド", "スカポライト", "エピドート", "トルマリン", "翡翠", "灰十字沸石", "望遠鏡", "顕微鏡", "地球儀", "天球儀", "クロノメーター", "クリノメーター", "八分儀", "日時計", "碁盤", "避雷針", "象牙", "スウェード", "カシミア", "絨毯", "エーテル", "ビスマス"]; 

const miAuthPrefix = "chat.misskey-square.net"

function choice(arr) {
    var i = Math.floor(Math.random() * arr.length);
    return arr[i];
}

function generateRoomTitle() {
  return `${choice(flavors)}と${choice(flavors)}の部屋`
  
}

function createRoom(roomName, owner) {
  let room = { clients: [], messages: [], config: {capacity: 10, owner: owner, history: true}, users: [], name: roomName, title: generateRoomTitle() };
  let handler = setTimeout(() => { destroyRoom(room); }, 10 * 60 * 60 * 1000); 
  room.gc = handler;
  return room;
}

function destroyRoom(room) {
  if (room == rooms[room.name]) {
    room.clients = [];
    clearTimeout(room.gc);
    delete rooms[room.name];
  }
}


wss.on('connection', (ws) => {
  console.log('Client connected');
  let roomName, room;

  ws.on('message', (m) => {
    try {
      if ("" + m === "heartbeat") {
        return ws.send(JSON.stringify({ type: "heartbeat" }));
      }
      const message = JSON.parse(m);
      // username verification using JWT
      let token;
      try {
        token = jwt.verify(message.token, publicKey);
      } catch (e) {
        console.log("JWT verification error");
        ws.send(JSON.stringify({ error: "verification" }));
        return;
      }
      const username = token.username;
      message.username = username;
      delete message.token;

      if (message.type === "join") {
        console.log(message);
        roomName = message.room;
        rooms[roomName] = rooms[roomName] || createRoom(roomName, username);
        room = rooms[roomName];
        if (room.config.capacity <= room.users.length && !(room.users.includes(username))) {
          return ws.send(JSON.stringify({ error: "filled" }));
        }
        room.clients.push(ws);
        message.info = accounts[username].info;
        if (!room.users.includes(username)) {
		      room.users.push(username);
        }
        sendRoomMessages(ws, room);
      } else if (message.type === "message") {
        // broadcast as-is
      } else if (message.type === "setCapacity") {
        const capacity = 0 + message.setCapacity;
        if (room.config.owner == username && 1 < capacity && capacity <= 20) {
	        room.config.capacity = message.capacity;
        } else {
          return;
        }
      } else if (message.type === "putBallotBox") {
        const id = `${username}/${crypto.randomUUID()}`;
        message.id = id;
	      boxes[id] = { id, creator: username, votes: {}, room, title: message.title, choices: message.choices, notifyVotes: message.notifyVotes, timer: message.timer, anonymous: message.anonymous };
        if (message.timer) {
          setTimeout(() => openBallotBox(id), message.timer * 1000);
        }
      } else if (message.type === "updateBallotBox") {
	      const box = boxes[message.id];
        box.votes[username] = message.vote;
        message.title = box.title;
        if (room.users.every((user) => box.votes[user])) {
          openBallotBox(message.id);
        }
	      delete message.vote;
        if (box.notifyVotes) {
          // send message
        } else {
          return;
        }
      } else if (message.type === "openBallotBox") {
        if (username === boxes[message.id].creator) {
          openBallotBox(message.id);
          return;
        }
      } else if (message.type === "putEnvelope") {
        const id = `${username}/${crypto.randomUUID()}`;
        message.id = id;
        envelopes[id] = { id, creator: username, room, title: message.title, secret: message.secret, timer: message.timer };
        message.creator = username;
        delete message.secret;
        if (message.timer) {
          envelopes[id].timerHandler = setTimeout(() => revealEnvelope(id), message.timer * 1000);
        }
      } else if (message.type === "revealEnvelope") {
        let envelope = envelopes[message.id];
        if (username === envelope.creator) {
          return revealEnvelope(message.id);
        }
      } else if (message.type === "leave") {
        room.users = room.users.filter((x) => x !== username);
      } else if (message.type === "destroyRoom") {
        if (username === room.config.owner) {
          setTimeout(() => destroyRoom(room), 10000);
        } else {
          return;
        }
      } else {
        return;
      }
      if (room && room.users && (room.users.some((user) => (user === username)) || message.type === "leave")) {
        if (room.config.history) {
          room.messages.push(message);
        }
        room.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
          }
        });
      }
    } catch (e) {
      console.log(e);
    }
  });

  ws.on('close', () => {
    if (room) {
      room.clients = room.clients.filter((client) => client !== ws);
      // room.users.forEach((user) => {
      //   user.clients.filter((client) => client !== ws);
      //   if (user.clients.length) {
      //     user.online = false;
      //   }
      // });
    };
  });
});

// クライアントに部屋のメッセージを送信
function sendRoomMessages(client, room) {
  if (room) {
    const userInfo = {};
    for (k of room.users) {
      userInfo[k] = accounts[k].info;
    }
    client.send(JSON.stringify({ type: "roomInfo", room: { title: room.title, config: room.config }, users: userInfo }));
    room.messages.forEach((message) => {
      client.send(JSON.stringify(message));
    });
  }
}

function count(votes) {
  const ret = {};
  for (k in votes) {
    ret[votes[k]] = 1 + (ret[votes[k]] || 0);
  }
  return ret;
}

function openBallotBox(ballotbox) {
  const box = boxes[ballotbox];
  if (box.opened) return;
  box.opened = true;
  box.result = count(box.votes);
  if (box.anonymous) box.votes = {};
  const message = { type: "openBallotBox", id: ballotbox, title: box.title, creator: box.creator, votes: box.votes, result: box.result };
  if (box.room.config.history) {
    box.room.messages.push(message);
  }
  box.room.clients.forEach((client) => {
    client.send(JSON.stringify(message));
  });
}

function revealEnvelope(secret) {
  const envelope = envelopes[secret];
  const message = { type: "revealEnvelope", secret: envelope.secret, creator: envelope.creator, title: envelope.title, id: secret };
  if (envelope.room.config.history) {
    envelope.room.messages.push(message);
  }
  envelope.room.clients.forEach((client) => {
    client.send(JSON.stringify(message));
  });
  clearTimeout(envelope.timerHandler);
}

//
// -- deliver & login server --
//


const privateKey = fs.readFileSync("jwt.private.pem", 'utf8');
const publicKey = fs.readFileSync("jwt.private.pem", 'utf8');

const frontendDir = path.join(__dirname, '..', 'frontend', 'dist');

fastify.register(require('@fastify/static'), {
  root: frontendDir,
});

fastify.register(require('@fastify/cookie'), {
  secret: "U8bsadYC9bw8Cuybxu6TBsQ8",
});

async function api(host, ep, data) {
	return (await axios.post(`https://${host}/api/${ep}`, JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })).data;
}

class AuthorizationError extends Error {}

function verifyMiAuthClient(host, session, refreshKey) {
	 if (users[refreshKey].miauth.host !== host) {
		 throw new AuthorizationError("Client server verification failed [host]");
	 }
	 if (users[refreshKey].miauth.session !== session) {
		 throw new AuthorizationError("Client server verification failed [session]");
	 }
}

async function verifyMiAuthAuthorizationServer(host, session) {
	let r = await api(host, `miauth/${session}/check`, {});
	if (r.ok) {
		return { user: r.user, token: r.token };
	} else {
		throw new AuthorizationError("Authorization server verification failed");
	}
}

// Unlink the session key stored in the Cookie and the account
fastify.post('/login/logout', (request, reply) => {
	const r = request.cookies.refresh;
	delete users[r];
  reply.send("");
});

// Send user identity and access token
fastify.post('/login/refresh-token', (request, reply) => {
	const r = request.cookies.refresh;
  console.log("refresh requested", r)
	if (r && users[r] && users[r].username) {
    console.log("refresh", users[r].username)
		const user = users[r];
		const token = jwt.sign({ username: user.username }, privateKey, { expiresIn: '30m', algorithm: 'RS256' });
		reply.send(token);
	} else {
    if (!r) {
		  let refreshKey = crypto.randomUUID();
      console.log("new refresh key", refreshKey)
		  reply.cookie('refresh', refreshKey, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true, path: "/login" });
		  users[refreshKey] = { issuedAt: new Date() };
    }
		reply.send("");
	}
});

// Issue session ID for MiAuth
fastify.post('/login/miauth/start', (request, reply) => {
	const r = request.cookies.refresh;
  console.log('miauth started', r);
	const host = request.query.server;
	const session = miAuthPrefix + ".." + crypto.randomUUID();
  if (!users[r]) {
    users[r] = {};
  }
	users[r].miauth = { host, session };
	reply.send(session);
});

// Handle response from MiAuth authorization server
fastify.get('/login/miauth/redirect-here', async (request, reply) => {
	const r = request.cookies.refresh;
  console.log('redirect received', r);
	try {
		const referringURL = request.headers.referer;
		const session = request.query.session;
		const host = new URL(referringURL).host;

		verifyMiAuthClient(host, session, r);
		const response = await verifyMiAuthAuthorizationServer(host, session);
		const username = `@${response.user.username}@${host}`;

		const newRKey = crypto.randomUUID();
    console.log("new refresh key", newRKey)
		reply.cookie('refresh', newRKey, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true, path: "/login" });
		users[newRKey] = { issuedAt: new Date() };
		users[newRKey].username = username;
		accounts[username] = { token: response.token, info: {avatarUrl: response.user.avatarUrl, name: response.user.name, username, host } };
	} finally {
		delete users[r].miauth;
	  reply.redirect('/close.html');
	}
});

fastify.get('/', (request, reply) => {
  reply.redirect(`/room/${crypto.randomUUID()}`);
});

fastify.get('/room/*', (request, reply) => {
  reply.sendFile('index.html');
});

fastify.post('/account/profile', (request, reply) => {
	try {
		const token = jwt.verify(request.body.token, privateKey, {algorithm: 'RS256'});
		reply.send(JSON.stringify(accounts[token.username].info));
	} catch (error) {
		if (error instanceof jwt.TokenExpiredError) {
			return { error: "Token Expired" };
		} else {
			// unrecoverable error
			throw error;
		}
	}
});

fastify.listen(3000, (err) => {
	if (err) throw err;
});
