import { render, Component } from 'preact';
import { Router, route } from 'preact-router';
import { useState, useEffect } from 'preact/hooks';

import { ChakraProvider, Textarea, Box, Flex, Spacer, HStack, VStack, Grid, GridItem, FormLabel, Fade, IconButton, Input, useDisclosure, useNumberInput, Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter, Button, Menu, MenuList, MenuButton, MenuItem, MenuDivider, Checkbox, Select } from '@chakra-ui/react'
import { ArrowRightIcon, HamburgerIcon, InfoOutlineIcon } from '@chakra-ui/icons'

import axios from 'axios';

// import { isValidDomain } from 'is-valid-domain';

import './style.css';

const default_room = crypto.randomUUID();

const Main = () => (
  <Router>
    <App path="/" room={default_room}/>
    <App path="/room/:room" />
  </Router>
);
const to_base64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));

async function sha256(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

const download = (fileName, text) => {
  const blob = new Blob([text], { type: 'text/plain' });
  const aTag = document.createElement('a');
  aTag.href = URL.createObjectURL(blob);
  aTag.target = '_blank';
  aTag.download = fileName;
  aTag.click();
  URL.revokeObjectURL(aTag.href);
}

const useCheckbox = ((setter) => ((event) => setter(event.target.checked)));
const useFormValue = ((setter) => ((event) => setter(event.target.value)));

async function miAuthLogin(domain) {
  const sessionId = (await axios.post(`/login/miauth/start?server=${encodeURIComponent(domain)}`)).data;
  const redirectURL = new URL("/login/miauth/redirect-here", location.href).href;
  const authorizeEndpoint = `https://${domain}/miauth/${sessionId}`;
  const targetURL = `${authorizeEndpoint}?callback=${encodeURIComponent(redirectURL)}&name=${encodeURIComponent('MiSq Chat (chat.misskey-square.net)')}&permission=read:account`;
  const popup = window.open(targetURL, "_blank");
  window.addEventListener('message', (event) => { popup.close(); } );
  return targetURL;
}

function LoginDialog(props) {
  const { isOpen, onClose } = props;
  const [domain, setDomain] = useState('');
  const [loginLink, setLoginLink] = useState('');
  const handleDomain = useFormValue(setDomain);
  return (
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>ログインしてね</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            { (loginLink) ? <p><strong><a href={loginLink}>ログインを続行する</a></strong></p> : 
              <VStack align="start">
              <Button onClick={ async () => setLoginLink(await miAuthLogin("misskey-square.net"))} >みすきーすくえあ！でログインする。</Button>
              <Button onClick={ async () => setLoginLink(await miAuthLogin("misskey.io"))} >Misskey IO でログインする。</Button>
              <Button onClick={ async () => setLoginLink(await miAuthLogin("misskey.gg"))}>Misskey GGでログインする。</Button>
              <Button onClick={ async () => setLoginLink(await miAuthLogin("fix.misskey.life"))}>みすきーらいふ！チャットあり版でログインする。</Button>
              <Input placeholder="misskey.example.net" value={domain} onChange={handleDomain} size='lg'/>
              <Button onClick={ () => setLoginLink(miAuthLogin(domain)) }>↑の Misskey/FireFish サーバーでログイン。</Button>
              <p><strong>なりすましに注意！</strong> Misskeyアカウントを悪いサービスに連携した場合、本チャットでなりすまされるかも。不審な例は管理者@yuriha@misskey-square.netまで。</p>
              </VStack>
            }
          </ModalBody>
        </ModalContent>
      </Modal>
  )
}

function NumberInputButton(props) {
  const { inc, dec, input, isDisabled, value } = props;
  return (
    <HStack>
      <Button isDisabled={isDisabled} { ...dec}>−</Button>
      <Input isDisabled={isDisabled} value={value} style={{textAlign: "right"}} {...input} size='lg' maxW='7ch' minW='7ch'/>
      <Button isDisabled={isDisabled} { ...inc}>+</Button>
      <FormLabel mb={0} me={0}>秒</FormLabel>
    </HStack>
  );
}

function MiniUser(props) {
  const users = props.client.roomInfo.users;
  const username = props.username;
  const user = users[username];
  return (<span>{user.name}<span style={{fontSize: '70%'}}>{username}</span></span>);
}
function LargeUser(props) {
  const users = props.client.roomInfo.users;
  const username = props.username;
  const user = users[username];
  return (<Flex align="center"><img height="48" width="48" src={user.avatarUrl}/><div><strong>{user.name}</strong> - {username}</div></Flex>);
}

function EnvelopeDialog(props) {
  // Dialog States
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { id, client } = props;
  const envelope = client.envelopes[id];
  if (envelope.opened) { return; };
  return (
    <>
      <Fade in={!(envelope.opened)}>
      <Button onClick={onOpen}>{envelope.title ? <span style={{fontSize: '80%'}}>秘密: {envelope.title}</span> : '投票'}</Button>
      </Fade>
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>あなたの伏せた秘密</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack align="stretch" spacing={3}>
            <Box>秘密のタイトル: {envelope.title}</Box>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button colorScheme='ghost' mr={3} onClick={onClose}>閉じる</Button>
            <Button colorScheme="red" onClick={()=>{ client.send({type: "revealEnvelope", id: id}); onClose();}}> 秘密を公表する</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
function VoteBallotBoxDialog(props) {
  // Dialog States
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { id, client } = props;
  const box = client.boxes[id];

  const [choices, setChoices] = useState(null);
  const handleChoices = useFormValue(setChoices);

  const vote = ((selection) =>
    (() => { client.send({ type: "updateBallotBox", vote: selection, id}); onClose(); }));
  if (box.opened) { return; };
  return (
    <>
      <Fade in={!(box.opened)}>
      <Button onClick={onOpen}>{box.title ? <span style={{fontSize: '80%'}}>投票: {box.title}</span> : '投票'}</Button>
      </Fade>
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>投票!!</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack align="stretch" spacing={3}>
            { (box.choices === "yes") ?
                ( <Flex align="center">
                  <Button colorScheme="green" onClick={vote("Yes")} size='lg'> はいに投票！ </Button>
                  <Spacer />
                  <Button colorScheme="red" onClick={vote("No")} size='lg'> いいえに投票！ </Button>
                </Flex> ) :
              (box.choices === "rock") ?
                ( <Flex gap={3} align="center">
                  <Button onClick={vote("グー")} size='lg'> グー！ </Button>
                  <Spacer />
                  <Button onClick={vote("チョキ")} size='lg'> チョキ！ </Button>
                  <Spacer />
                  <Button onClick={vote("パー")} size='lg'> パー！ </Button>
                </Flex> ) :
               (box.choices === "five") ?
                ( <Flex gap={3} align="center">
                  <Button onClick={vote("1")} size='lg'> 1 </Button>
                  <Spacer />
                  <Button onClick={vote("2")} size='lg'> 2 </Button>
                  <Spacer />
                  <Button onClick={vote("3")} size='lg'> 3 </Button>
                  <Spacer />
                  <Button onClick={vote("4")} size='lg'> 4 </Button>
                  <Spacer />
                  <Button onClick={vote("5")} size='lg'> 5 </Button>
                </Flex> ) :
               (box.choices === "participants") ?
                  Object.keys(client.roomInfo.users).map((username) =>
                  ( <Button onClick={vote(username)}><LargeUser client={client} username={username} /></Button> )) :
               (box.choices === "text") ?
                  <Flex gap={3} align="center">
                  <Input onChange={handleChoices} />
                  <Button onClick={vote(choices)}>投票!</Button></Flex> :
                  box.choices.map((candidate) => <Button onClick={vote(candidate)}>{candidate}</Button>) }
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}

function PutBallotBoxDialog(props) {
  // Dialog States
  const { isOpen, onClose } = props;

  const [title, setTitle] = useState('');
  const handleTitle = useFormValue(setTitle);

  const [choices, setChoices] = useState('yes');
  const handleChoices = useFormValue(setChoices);

  // Checkbox States
  const [notifyVotes, setNotifyVotes] = useState(true);
  const [anonymous, setAnonymous] = useState(false);
  const [timer, setTimer] = useState(true);
  const [handleNotifyVotes, handleAnonymous, handleTimer] = [setNotifyVotes, setAnonymous, setTimer].map(useCheckbox);

  // NumberInput States
  const { getInputProps, getIncrementButtonProps, getDecrementButtonProps, value: timerValue } = useNumberInput({step: 15, defaultValue: 30, min: 15, max: 120});

  return (
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>投票箱を設置するよ</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack align="stretch" spacing={3}>
            <Flex gap={3} align="center">
            <Box><FormLabel mb={0} me={0}>タイトル</FormLabel></Box>
            <Input value={title} onChange={handleTitle} size='lg' />
            </Flex>
            <Flex gap={3} align="center">
            <Box><FormLabel mb={0} me={0}>選択肢</FormLabel></Box>
            <Box style={{ flex: 1, width: "auto" }}>
            <Select value={choices} onChange={handleChoices}>
              <option value='yes'>はい/ いいえ</option>
              <option value='rock'>じゃんけん</option>
              <option value='participants'>部屋の参加者</option>
              <option value='five'>1 2 3 4 5</option>
              <option value='text'>自由記述</option>
            </Select>
            </Box>
            </Flex>
            <Checkbox isChecked={notifyVotes} onChange={handleNotifyVotes}>投票時に自動でコメントする</Checkbox>
            <Checkbox isChecked={anonymous} onChange={handleAnonymous}>匿名投票</Checkbox>
            <Flex gap={3} align="center">
            <Box><Checkbox isChecked={timer} onChange={handleTimer}>制限時間</Checkbox></Box>
            <Spacer />
            <Box><NumberInputButton isDisabled={!timer} inc={getIncrementButtonProps()} dec={getDecrementButtonProps()} input={getInputProps()}/></Box>
            </Flex>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button colorScheme='ghost' mr={3} onClick={onClose}>
              やっぱりやめる
            </Button>
            <Button colorScheme='blue' mr={3} onClick={(event) => { props.client.send({ type: "putBallotBox", title, choices, anonymous, notifyVotes, timer: timer && parseInt(timerValue) }); onClose(event);}}>
              設置する
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
  );
}

function PutEnvelopeDialog(props) {
  // Dialog States
  const { isOpen, onClose } = props;

  const [title, setTitle] = useState('秘密のお題');
  const handleTitle = useFormValue(setTitle);

  const [secret, setSecret] = useState('');
  const handleSecret = useFormValue(setSecret);

  // Checkbox States
  const [timer, setTimer] = useState(true);
  const handleTimer = useCheckbox(setTimer);

  // NumberInput States
  const { getInputProps, getIncrementButtonProps, getDecrementButtonProps, value: timerValue } = useNumberInput({step: 60, defaultValue: 180, min: 60, max: 600});

  return (
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>秘密を伏せる</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack align="stretch" spacing={3}>
            <Flex gap={3} align="center">
            <Box><FormLabel mb={0} me={0}>タイトル</FormLabel></Box>
            <Input value={title} onChange={handleTitle} size='lg' />
            </Flex>
            <Flex gap={3} align="center">
            <Box><FormLabel mb={0} me={0}>秘密の内容</FormLabel></Box>
            <Input value={secret} onChange={handleSecret} size='lg' />
            </Flex>
            <Flex gap={3} align="center">
            <Box><Checkbox isChecked={timer} onChange={handleTimer}>時間経過で公開</Checkbox></Box>
            <Spacer />
            <Box><NumberInputButton isDisabled={!timer} inc={getIncrementButtonProps()} dec={getDecrementButtonProps()} input={getInputProps()}/></Box>
            </Flex>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button colorScheme='ghost' mr={3} onClick={onClose}>
              やっぱりやめる
            </Button>
            <Button colorScheme='blue' mr={3} onClick={(event) => { props.client.send({ type: "putEnvelope", title, secret, timer: timer && parseInt(timerValue) }); onClose(event);}}>
              伏せて発言する
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
  );
}

function ConfigRoomDialog(props) {
  // Dialog States
  const { isOpen, onClose } = props;

  // Checkbox States
  const [keeplogs, setKeeplogs] = useState(true);
  const handleTimer = useCheckbox(setKeeplogs);

  // NumberInput States
  const { getInputProps, getIncrementButtonProps, getDecrementButtonProps, value: capacity } = useNumberInput({step: 1, defaultValue: 10, min: 2, max: 20});

  return (
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>部屋の設定</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack align="stretch" spacing={3}>
            <Flex gap={3} align="center">
            <Spacer />
            <Box><FormLabel mb={0} me={0}>部屋の人数</FormLabel></Box>
            <Box><NumberInputButton inc={getIncrementButtonProps()} dec={getDecrementButtonProps()} input={getInputProps()}/></Box>
            </Flex>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button colorScheme='ghost' mr={3} onClick={onClose}>
              保存せずに閉じる
            </Button>
            <Button colorScheme='blue' mr={3} onClick={(event) => { props.client.send({ type: "setCapacity", capacity }); onClose(event);}}>
              設定を保存する
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
  );
}

class TokenError extends Error {
}

// JWT access token (refresh token is stored in Cookie)
class Token {
  async refresh() {
    const token = (await axios.post("/login/refresh-token")).data;
    if (token) {
      this.content = token;
      this.info = (await axios.post('/account/profile', {token: this.content})).data;
      setTimeout(() => this.refresh(), 10 * 60 * 1000);
    }
  }
  reset() {
    this.content = "";
    delete this.info;
  }
}

let token;

class ChatClient {
  constructor(token, room, onMessage) {
    this.token = token;
    this.room = room;
    this.messages = [];
    this.lastMessage = "";
    this.boxes = {};
    this.envelopes = {};
    this.onMessage = onMessage;
    this.connect();
  }
  connect = () => {
    this.socket = new WebSocket('wss://chat.misskey-square.net/ws');
    this.socket.addEventListener('message', (event) => { 
      const message = JSON.parse(event.data);
      if (message.type === "heartbeat") {
        return;
      } else if (message.type === "roomInfo") {
        this.roomInfo = { room: message.room, users: message.users };
        return;
      } else if (message.type === "join") {
        this.roomInfo.users[message.info.username] = message.info;
      } else if (message.type === "leave") {
        delete this.roomInfo.users[message.info.username];
      } else if (message.type === "putBallotBox") {
        this.boxes[message.id] = { opened: false, ...message };
      } else if (message.type === "putEnvelope" && message.creator === this.token.info.username) {
        this.envelopes[message.id] = { opened: false, ...message};
      } else if (message.type === "revealEnvelope" && this.envelopes[message.id]) {
        this.envelopes[message.id].opened = true;
      } else if (message.type === "updateBallotBox") {
        if (this.boxes[message.id].opened) return;
      } else if (message.type === "openBallotBox") {
        if (this.boxes[message.id].opened) return;
        this.boxes[message.id].opened = true;
      } else if (message.error && message.error === "filled") {
        window.alert("部屋が満員です。");
        return;
      } else if (message.error) {
        setTimeout(() => token.refresh(), 10000);
        return;
      }
      this.messages.push(message);
      this.onMessage(message, this.messages);
    });
    this.socket.addEventListener('open', () => { console.log("WebSocket Open") });
    this.heartbeat && clearInterval(this.heartbeat);
    this.heartbeat = setInterval(() => this.socket.send("heartbeat"), 28*1000);
    this.checkConnection && clearInterval(this.checkConnection);
    this.checkConnection  = setInterval(() => {
        if (this.socket.readyState === this.socket.CLOSING || this.socket.readyState === this.socket.CLOSED) {
          this.connect();
        }
      }, 60 * 1000);
    return new Promise((res, err) => {
      crypto.subtle.generateKey({name: 'ECDSA', namedCurve: 'P-384'}, true, ['sign', 'verify']).then((keypair) => {
        this.keypair = keypair;
        crypto.subtle.exportKey('spki', keypair.publicKey).then((pubkey) => {
          const message = { type: "join", join: to_base64(pubkey), room: this.room };
          this.send(message, true).catch((e) => {
            this.socket.addEventListener('open', () => {
              console.log("delayed join", e);
              this.send(message);
              res();
            });
          });
        });
      });
    });
  }

  destroy = () => {
    this.heartbeat && clearInterval(this.heartbeat);
  }

  send = async (data, boot) => {
    if (!boot && (this.socket.readyState === this.socket.CLOSING || this.socket.readyState === this.socket.CLOSED)) {
        await this.connect();
    }
    this.socket.send(JSON.stringify({ token: this.token.content, ...data }));
  }

  close = () => {
    this.socket.close();
  }
  downloadJSON = () =>{
    download(`room-log-${this.room}.txt`, JSON.stringify(this.messages));
  };
  post = (text) => {
    const date = new Date().getTime();
    sha256(JSON.stringify(this.lastMessage)).then(digest => sign({ type: "message", date, text, room: this.room, previous: digest}, this.keypair.privateKey)).then(this.send);
  }
}

async function sign(data, key) {
  const commit = JSON.stringify(data);
  const enc = new TextEncoder();
  const encoded = enc.encode(commit);
  const signature = await crypto.subtle.sign({name: 'ECDSA', namedCurve: 'P-384', hash: 'SHA-256'}, key, encoded);
  return { type: data.type, data, signature: to_base64(signature)};
}

const timeFormatter = Intl.DateTimeFormat('ja-JP', {timeStyle: 'short'});
class App extends Component {
  constructor(props) {
    super();
    console.log("constructor");
    this.state = { messages: [], newMessage: "", scrolling: false, isLoginDialogOpen: false, isPutBallotBoxDialogOpen: false, isPutEnvelopeDialogOpen: false };
  }

  openLoginDialog = () => {
    this.setState({ isLoginDialogOpen: true });
  }
  
  closeLoginDialog = () => {
    this.setState({ isLoginDialogOpen: false });
  }

  openPutBallotBoxDialog = () => {
    this.setState({ isPutBallotBoxDialogOpen: true });
  }

  closePutBallotBoxDialog = () => {
    this.setState({ isPutBallotBoxDialogOpen: false });
  }
  
  openPutEnvelopeDialog = () => {
    this.setState({ isPutEnvelopeDialogOpen: true });
  }

  closePutEnvelopeDialog = () => {
    this.setState({ isPutEnvelopeDialogOpen: false });
  }

  setClient = () => {
    if (this.client && this.client.destroy) {
      this.client.destroy();
    }
    this.client = new ChatClient(
      token,
      this.props.room,
      (_, messages) => {
        this.setState({ messages: messages, scrolling: true });
        const q = document.querySelector("#sentinel");
        setTimeout(() => q.scrollIntoView({ behavior: "smooth" }), 1);
        setTimeout(() => q.scrollIntoView({ behavior: "smooth" }), 10);
        setTimeout(() => this.setState({ scrolling: false }), 200);
        });
  }

  scrollToBottom = () => {
        const q = document.querySelector("#sentinel");
        setTimeout(() => q.scrollIntoView(), 10);
        setTimeout(() => q.scrollIntoView(), 100);
        setTimeout(() => q.scrollIntoView(), 200);
        setTimeout(() => q.scrollIntoView(), 300);
        setTimeout(() => q.scrollIntoView(), 400);
        setTimeout(() => q.scrollIntoView(), 500);
  }

  componentWillMount = async () => {
    this.client = {room: 'loading ...', messages: []};
    if (!token) {
      token = new Token();
      await token.refresh();
      if (!token.content) {
        this.openLoginDialog();
        window.addEventListener('message', async (event) => {
          await token.refresh();
          this.closeLoginDialog();
          this.setClient();
        });
      }
    };
    this.setClient();
  }

  componentWillUnMount = () => {
    console.log("unmount");
    this.client.close();
  }

  handleInputChange = (event) => {
    if (event.target.value.includes("\n")) {
      this.handleSubmit(event);
      return;
    }
    this.setState({'newMessage': event.target.value});
  }

  handleSubmit = (event) => {
    event.preventDefault();
    if (this.state.newMessage.trim() === '') return;
    const text = `${this.state.newMessage}`;
    this.client.post(text);
    this.setState({'newMessage': ''});
  }

  user = (username) => {
    return this.client.roomInfo.users[username];
  }

  logout = async () => {
    await axios.post('/login/logout');
    location.reload();
  }

  render = () => {
    let ret = (
      <ChakraProvider>
      <LoginDialog isOpen={this.state.isLoginDialogOpen} onClose={this.closeLoginDialog}/>
      <div className="chat-app">
        <Grid templateColumns='repeat(3, 33.33%)' className='topbar'>
        <GridItem h='12' w='100%'>
        <Box style={{textAlign: 'start'}}>
        { this.client.roomInfo && Object.keys(this.client.roomInfo.users).map((username) =>
          <Box style={{display: 'inline-block'}}><Fade in={true}><img height="24" width="24" src={this.user(username).avatarUrl}/></Fade></Box>) }
        </Box>
        </GridItem>
        <GridItem h='12' w='100%' className='roomName'>
          <a href={`/room/${this.client.room}`}>{this.client.roomInfo && this.client.roomInfo.room ? this.client.roomInfo.room.title : "loading ..."}</a>
        </GridItem>
        <GridItem h='12' w='100%'>
        { this.client.boxes && Object.keys(this.client.boxes).map((id) =>
          <VoteBallotBoxDialog id={id} client={this.client}/>) }
        { this.client.envelopes && Object.keys(this.client.envelopes).map((id) =>
          <EnvelopeDialog id={id} client={this.client}/>) }
        </GridItem>
        </Grid>
        <div className="chat-messages" id="scroller">
          <div id="message-head" />
          {this.state.messages.map((message, index) =>
            ((message.type === "join") ?
              ( <div key={index} className='message-item system'>
              <div className="message"> <MiniUser username={message.username} client={this.client}/>が入室しました</div>
              </div> ) :
            (message.type === "leave") ?
              ( <div key={index} className='message-item system'>
              <div className="message"> <MiniUser username={message.username} client={this.client}/>が退出しました</div>
              </div> ) :
            (message.type === "putBallotBox") ?
              ( <div className='message-item system'>
              <div key={index} className="message">
              <MiniUser username={message.username} client={this.client}/> が投票箱{message.title ? `「${message.title}」` : ""}を設置しました</div>
              </div> ) :
            (message.type === "openBallotBox") ?
              ( <div className='message-item system'>
              <div key={index} className="message">
              投票{message.title ? `「${message.title}」` : ""}の結果！
              <div>
              { (message.votes) ? Object.keys(this.client.roomInfo.users).map((user) =>
                (<div><MiniUser username={user} client={this.client}/> →  {message.votes[user]} </div>)) : [] }
              </div>
              <div>
              { Object.keys(message.result).map((key)=>
                (<div>{key} => {message.result[key]} 票</div>) ) }
              </div>
              </div>
              </div> ) :
            (message.type === "updateBallotBox") ?
              ( <div className='message-item system'>
              <div key={index} className="message">
              <MiniUser username={message.username} client={this.client}/> は{message.title ? `投票箱「${message.title}」に` : ""}投票しました。</div>
              </div> ) :
            (message.type === "putEnvelope") ?
              ( <div className='message-item system'>
              <div key={index} className="message">
              <MiniUser username={message.username} client={this.client}/>が「{message.title}」を伏せました。</div>
              </div> ) :
            (message.type === "revealEnvelope") ?
              ( <div className='message-item system'>
              <div key={index} className="message">
              <MiniUser username={message.creator} client={this.client}/> の伏せた「{message.title}」は「{message.secret}」でした！</div>
              </div> ) :
            (message.type === "destroyRoom") ?
              ( <div className='message-item system'>
              <div key={index} className="message">
              部屋が解散されました。10秒後にメッセージが送れなくなります。
              </div></div> ) :
              (
                <div className={`message-item ${(token.info.username === message.username) ? 'me' : 'other'}`}>
                  <img height="48" width="48" src={this.user(message.username).avatarUrl}/>
                  <div className="message-container">
                    <p className="user">{this.user(message.username).name} <span className="username">{message.username}</span></p>
                    <Fade in={(index !== this.state.messages.length - 1) || !this.state.scrolling}>
                    <div key={index} className="message">{message.data.text} <small className="time">{ timeFormatter.format(new Date(message.data.date)) }</small></div>
                    </Fade>
                  </div>
                </div>
              )))}
          <div id="spacing"/>
          <div id="sentinel"/>
        </div>
        <form onSubmit={this.handleSubmit} className="chat-form" autocomplete="off">
          <Box m={2}>
          <Menu>
            <MenuButton as={IconButton} aria-label='Menu' size='lg' icon={<HamburgerIcon />} colorScheme='orange' />
            <MenuList>
              <MenuItem onClick={this.client.downloadJSON}> 管理者への連絡用にログを保存する </MenuItem>
              <MenuDivider />
              <MenuItem onClick={this.logout}>ログアウト</MenuItem>
              <MenuDivider />
              <MenuItem onClick={() => location.href="/"}>新しいルーム</MenuItem>
              <MenuItem onClick={() => this.client.send({"type": "leave"})}>部屋を退出</MenuItem>
              <MenuItem isDisabled={token.info && this.client.roomInfo && token.info.username !== this.client.roomInfo.room.config.owner} onClick={() => this.client.send({"type": "destroyRoom"})}>部屋を解散</MenuItem>
              <MenuDivider />
              <MenuItem onClick={() => window.open(`https://${token ? token.info.host : "example.com"}/share?text=${encodeURIComponent("チャットルーム開いています")}&url=${encodeURIComponent(new URL('/room/'+this.client.room, location.href).href)}`, "_blank")}>このルームへのリンクを投稿</MenuItem>
              <MenuItem onClick={() => window.open(`https://${token ? token.info.host : "example.com"}/share?text=${encodeURIComponent("チャットきて")}&url=${encodeURIComponent(new URL('/room/'+this.client.room, location.href).href)}&visibility=specified`, "_blank")}>友達を誘う</MenuItem>
              <MenuDivider />
              <MenuItem onClick={this.openPutBallotBoxDialog}>投票箱をつくる</MenuItem>
              <PutBallotBoxDialog client={this.client} isOpen={this.state.isPutBallotBoxDialogOpen} onClose={this.closePutBallotBoxDialog}/>
              <MenuItem onClick={this.openPutEnvelopeDialog}>秘密を伏せる</MenuItem>
              <PutEnvelopeDialog client={this.client} isOpen={this.state.isPutEnvelopeDialogOpen} onClose={this.closePutEnvelopeDialog}/>
            </MenuList>
          </Menu>
          </Box>
          <Textarea
            rows="1"
            m={2}
            size="lg"
            value={this.state.newMessage}
            onChange={this.handleInputChange}
            onClick={this.scrollToBottom}
            bg='white'
          />
          <IconButton m={2} colorScheme='teal' aria-label='Send' size='lg' icon={<ArrowRightIcon />} onClick={this.handleSubmit}/>
        </form>
      </div>
      </ChakraProvider>);
      return ret;
  }
}

render(<Main />, document.getElementById('app'));
