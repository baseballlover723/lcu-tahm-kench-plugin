import LCUConnector from 'lcu-connector';
import axios from 'axios';
import RiotWebSocket from './riotWebSocket.js';

const connector = new LCUConnector();
const SPAM_DURATION = 3_000; // ms
const SPAM_PERIOD = 200; // ms
const SENT_MESSAGES = new Set();

const TAHM_KENCH_BASE_URL = 'https://tahm-ken.ch/team_builder';
const REGION_ENDPOINT = 'lol-platform-config/v1/namespaces/LoginDataPacket/competitiveRegion';
const MEMBERS_ENDPOINT = 'lol-lobby/v2/lobby/members';
const CHAT_ENDPOINTS = {
  base: '/lol-chat/v1/conversations',
  suffix: '%40sec.na1.pvp.net/messages',
};

const CONVERSATIONS_EVENT = 'OnJsonApiEvent_lol-chat_v1_conversations';
const LOBBY_EVENT = 'OnJsonApiEvent_lol-lobby_v2_comms';

function testSub(ws, topics) {
  for (const topic of topics) {
    ws.subscribe(topic, (event) => {
      console.log(`received ${topic} event: `);
      console.dir(event, { depth: null });
    });
    console.log(`setup ${topic}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// A lot of retries since we call this on startup, and it takes a bit for the client to have this data available
async function getRegion(retriesLeft = 20) {
  try {
    return (await axios.get(REGION_ENDPOINT)).data;
  } catch (e) {
    if ((e.code !== 'ECONNREFUSED' && e?.response?.status >= 500) || retriesLeft <= 0) {
      console.log('error in getting region', e);
      throw e;
    }
    await sleep(1000);
    return getRegion(retriesLeft - 1);
  }
}

async function getPlayers() {
  try {
    return (await axios.get(MEMBERS_ENDPOINT)).data.map((p) => p.summonerName);
  } catch (e) {
    if (e.response.status >= 500) {
      console.log('error in getting players', e);
      throw e;
    }
    return [];
  }
}

function sendMessage(chatUrl, message, retriesLeft = 2) {
  axios.post(chatUrl, {
    body: message,
  }).then((response) => {
    SENT_MESSAGES.add(response.data.id);
  }).catch((error) => {
    if (retriesLeft > 0) {
      console.log(`send message error, retrying (${retriesLeft - 1} retries left)`);
      setTimeout(sendMessage, SPAM_DURATION, chatUrl, message, retriesLeft - 1);
    } else {
      console.error('error: ', error);
    }
  });
}

async function spamLink(chatUrl, region, optionalPlayers) {
  const players = optionalPlayers || await getPlayers();
  for (let time = 0, i = 0; time < SPAM_DURATION; time += SPAM_PERIOD, i += 1) {
    const player = players[i % players.length];
    setTimeout((url) => {
      sendMessage(chatUrl, url);
    }, time, player ? encodeURI(`${TAHM_KENCH_BASE_URL}/${region}/${player}`) : TAHM_KENCH_BASE_URL);
  }
}

function handleLobbyChat(region) {
  return async (event) => {
    if (event.eventType !== 'Create') {
      return;
    }
    // console.log('received party chat: ', event);
    if (event.data.type !== 'groupchat') {
      return;
    }
    if (SENT_MESSAGES.has(event.data.id)) {
      console.log(`ignoring message ${event.data.id} because we sent it`);
      SENT_MESSAGES.delete(event.data.id);
      return;
    }
    // console.log('received party chat: ', event);
    if (!/(link|website)\??/i.test(event.data.body)) {
      console.log(`ignoring message "${event.data.body}" because it didn't match the regex`);
      return;
    }
    const chatUrl = event.uri.substring(0, event.uri.lastIndexOf('/'));
    await spamLink(chatUrl, region);
  };
}

function handleLobbyMemberChange(region) {
  return async (event) => {
    // console.log('received lobby member change event: ', event);
    if (Object.keys(event.data.players).length !== 5) {
      console.log('Not a full party, so ignoring');
      return;
    }
    const chatUrl = `${CHAT_ENDPOINTS.base}/${event.data.partyId}${CHAT_ENDPOINTS.suffix}`;
    const players = Object.values(event.data.players).map((player) => player.gameName);
    await spamLink(chatUrl, region, players);
  };
}

connector.on('connect', async (clientData) => {
  console.log('League Client has started, connecting websocket', clientData);
  axios.defaults.baseURL = `${clientData.protocol}://${clientData.address}:${clientData.port}`;
  axios.defaults.auth = { username: clientData.username, password: clientData.password };
  console.log('waiting for client to be fully open');
  const region = await getRegion();
  const ws = new RiotWebSocket(clientData);

  ws.on('open', () => {
    ws.subscribe(CONVERSATIONS_EVENT, handleLobbyChat(region));
    ws.subscribe(LOBBY_EVENT, handleLobbyMemberChange(region));
    // testSub(ws, [
    //   // 'OnJsonApiEvent',
    //   // 'OnJsonApiEvent_chat_v1_session',
    //   // 'OnJsonApiEvent_chat_v1_settings',
    //   // 'OnJsonApiEvent_chat_v3_blocked',
    //   // 'OnJsonApiEvent_chat_v3_errors',
    //   // 'OnJsonApiEvent_chat_v3_friends',
    //   // 'OnJsonApiEvent_chat_v3_groups',
    //   // 'OnJsonApiEvent_chat_v4_friendrequests',
    //   // 'OnJsonApiEvent_chat_v4_presences',
    //   // 'OnJsonApiEvent_chat_v5_messages',
    //   // 'OnJsonApiEvent_chat_v5_participants',
    //   // 'OnJsonApiEvent_chat_v6_conversations',
    //   //
    //   // 'OnJsonApiEvent_lol-chat_v1_blocked-players',
    //   // 'OnJsonApiEvent_lol-chat_v1_config',
    //   'OnJsonApiEvent_lol-chat_v1_conversations', // party chat
    //   // 'OnJsonApiEvent_lol-chat_v1_errors',
    //   // 'OnJsonApiEvent_lol-chat_v1_friend-counts',
    //   // 'OnJsonApiEvent_lol-chat_v1_friend-groups',
    //   // 'OnJsonApiEvent_lol-chat_v1_friend-requests',
    //   // 'OnJsonApiEvent_lol-chat_v1_friends',
    //   // 'OnJsonApiEvent_lol-chat_v1_me',
    //   // 'OnJsonApiEvent_lol-chat_v1_player-mutes',
    //   // 'OnJsonApiEvent_lol-chat_v1_resources',
    //   // 'OnJsonApiEvent_lol-chat_v1_session',
    //   // 'OnJsonApiEvent_lol-chat_v1_settings',
    //
    //
    //   // 'OnJsonApiEvent_lol-lobby_v1_lobby',
    //   // 'OnJsonApiEvent_lol-lobby_v2_comms', // to get participant updates
    //   // 'OnJsonApiEvent_lol-lobby_v2_lobby',
    //   // 'OnJsonApiEvent_lol-lobby_v1_parties',
    //   // 'OnJsonApiEvent_lol-lobby_v2_party-active'
    //   // 'OnJsonApiEvent_lol-lobby_v2_received-invitations',
    //   // 'OnJsonApiEvent_lol-game-client-chat_v1_aas-messages',
    //   // 'OnJsonApiEvent_lol-game-client-chat_v1_buddies',
    //   // 'OnJsonApiEvent_lol-game-client-chat_v1_instant-messages',
    //   // 'OnJsonApiEvent_lol-game-client-chat_v2_aas-messages',
    //   // 'OnJsonApiEvent_lol-game-client-chat_v2_buddies',
    //   // 'OnJsonApiEvent_lol-game-client-chat_v2_instant-messages',
    //   // 'OnJsonApiEvent_riot-messaging-service_v1_message',
    //   // 'OnLcdsEvent'
    //   // 'PostLolChatV1ConversationsByIdMessages',
    //   // 'LolChatChatMessage',
    //   // 'LolChatChatMessageList',
    //   // 'LolChatConversationMessageResource',
    //   // 'LolChatMessage',
    //   // 'LolChatMessageList',
    //   // 'LolChatMessagePost',
    //   // 'LolChatMessageSend',
    //   // 'LolChatMessageType',
    //   // 'LolGameClientChatConversationMessageResource',
    //   // 'LolGameClientChatGameClientChatMessageResource',
    //   // 'LolGameClientChatMessageToPlayer',
    //   // 'LolLobbyRiotMessagingServiceMessage',
    //   // 'LolPlayerMessagingSimpleMessage',
    //   // 'RmsMessage',
    //   // 'SimpleDialogMessage',
    //   // 'SimpleDialogMessageResponse',
    //   // 'OnJsonApiEvent_lol-game-client-chat_v1_aas-messages',
    //   // 'OnJsonApiEvent_lol-game-client-chat_v1_instant-messages',
    //   // 'OnJsonApiEvent_lol-game-client-chat_v2_aas-messages',
    //   // 'OnJsonApiEvent_lol-game-client-chat_v2_instant-messages',
    //   // 'OnJsonApiEvent_lol-platform-config_v1_namespaces_LoginDataPacket_simpleMessages',
    //   // 'OnJsonApiEvent_riot-messaging-service_v1_message',
    //   // 'OnLcdsEvent_com_riotgames_platform_game_message_GameNotification'
    // ])
    console.log('ready');
  });
});

connector.on('disconnect', () => {
  console.log('League Client has been closed');
});

// Start listening for the LCU client
connector.start();
console.log('Listening for League Client');
