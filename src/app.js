const LCUConnector = require('lcu-connector');
const axios = require('axios');
const RiotWebSocket = require('./riotWebSocket');

const connector = new LCUConnector();

function testSub(ws, topics) {
  for (const topic of topics) {
    ws.subscribe(topic, (event) => {
      console.log(`received ${topic} event: `);
      console.dir(event, { depth: null });
    });
    console.log(`setup ${topic}`);
  }
}

const SENT_MESSAGES = new Set();
connector.on('connect', (clientData) => {
  console.log('League Client has started, connecting websocket', clientData);
  axios.defaults.baseURL = `${clientData.protocol}://${clientData.address}:${clientData.port}`;
  axios.defaults.auth = { username: clientData.username, password: clientData.password };
  const ws = new RiotWebSocket(clientData);

  ws.on('open', () => {
    ws.subscribe('OnJsonApiEvent_lol-chat_v1_conversations', (event) => {
      if (event.eventType !== 'Create' || event.data.type !== 'groupchat') {
        return;
      }
      if (SENT_MESSAGES.has(event.data.id)) {
        console.log(`ignoring message ${event.data.id} because we sent it`);
        SENT_MESSAGES.delete(event.data.id);
        return;
      }
      console.log('received party chat: ', event);
      const chatUrl = event.uri.substring(0, event.uri.lastIndexOf('/'));
      axios.post(chatUrl, {
        body: `you said: "${event.data.body}"`,
      }).then((response) => {
        SENT_MESSAGES.add(response.data.id);
      }).catch((error) => {
        console.log('error: ', error);
      });
    });
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
