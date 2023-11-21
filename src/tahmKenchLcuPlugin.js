import LcuPlugin from 'lcu-plugin';
import axios from 'axios';

const SPAM_DURATION = 3_000; // ms
const SPAM_PERIOD = 200; // ms

const TAHM_KENCH_BASE_URL = 'https://tahm-ken.ch/team_builder';
const REGION_ENDPOINT = 'lol-platform-config/v1/namespaces/LoginDataPacket/competitiveRegion';
const MEMBERS_ENDPOINT = 'lol-lobby/v2/lobby/members';
const CHAT_ENDPOINTS = {
  base: '/lol-chat/v1/conversations',
  suffix: '%40sec.na1.pvp.net/messages',
};

const CONVERSATIONS_EVENT = 'OnJsonApiEvent_lol-chat_v1_conversations';
const LOBBY_EVENT = 'OnJsonApiEvent_lol-lobby_v2_comms';

export default class TahmKenchLcuPlugin extends LcuPlugin {
  constructor() {
    super();
    this.sentMessages = new Set();
  }

  onConnect(clientData) {
    axios.defaults.baseURL = `${clientData.protocol}://${clientData.address}:${clientData.port}`;
    axios.defaults.auth = { username: clientData.username, password: clientData.password };
    return this.createPromise((resolve, reject) => {
      this.getRegion().then((region) => {
        this.subscribeEvent(CONVERSATIONS_EVENT, this.handleLobbyChat(region));
        this.subscribeEvent(LOBBY_EVENT, this.handleLobbyMemberChange(region));
        this.log('is ready');
        resolve();
      }).catch((error) => {
        reject(error);
      });
    });
  }

  getRegion(retriesLeft = 20) {
    return this.createPromise((resolve, reject) => {
      this.getRegionHelper(retriesLeft, resolve, reject);
    });
  }

  getRegionHelper(retriesLeft, resolve, reject) {
    axios.get(REGION_ENDPOINT).then((resp) => {
      resolve(resp.data);
    }).catch((error) => {
      if ((error.code !== 'ECONNREFUSED' && error?.response?.status >= 500) || retriesLeft <= 0) {
        this.error('error in getting region', error);
        reject(error);
      }
      setTimeout(() => {
        this.getRegionHelper(retriesLeft - 1, resolve, reject);
      }, 1000);
    });
  }

  async getPlayers() {
    try {
      return (await axios.get(MEMBERS_ENDPOINT)).data.map((p) => p.summonerName);
    } catch (e) {
      if (e.response.status >= 500) {
        this.error('error in getting players', e);
        throw e;
      }
      return [];
    }
  }

  sendMessage(chatUrl, message, retriesLeft = 2) {
    axios.post(chatUrl, {
      body: message,
    }).then((response) => {
      this.sentMessages.add(response.data.id);
    }).catch((error) => {
      if (retriesLeft > 0) {
        this.log(`send message error, retrying (${retriesLeft - 1} retries left)`);
        setTimeout(this.sendMessage, SPAM_DURATION, chatUrl, message, retriesLeft - 1);
      } else {
        this.error('error: ', error);
      }
    });
  }

  async spamLink(chatUrl, region, optionalPlayers) {
    const players = optionalPlayers || await this.getPlayers();
    for (let time = 0, i = 0; time < SPAM_DURATION; time += SPAM_PERIOD, i += 1) {
      const player = players[i % players.length];
      setTimeout((url) => {
        this.sendMessage(chatUrl, url);
      }, time, player ? encodeURI(`${TAHM_KENCH_BASE_URL}/${region}/${player}`) : TAHM_KENCH_BASE_URL);
    }
  }

  handleLobbyChat(region) {
    return async (event) => {
      if (event.eventType !== 'Create') {
        return;
      }
      // this.log('received party chat: ', event);
      if (event.data.type !== 'groupchat') {
        return;
      }
      if (this.sentMessages.has(event.data.id)) {
        this.log(`ignoring message ${event.data.id} because we sent it`);
        this.sentMessages.delete(event.data.id);
        return;
      }
      // this.log('received party chat: ', event);
      if (!/(link|website)/i.test(event.data.body)) {
        // this.log(`ignoring message "${event.data.body}" because it didn't match the regex`);
        return;
      }
      const chatUrl = event.uri.substring(0, event.uri.lastIndexOf('/'));
      await this.spamLink(chatUrl, region);
    };
  }

  handleLobbyMemberChange(region) {
    return async (event) => {
      // this.log('received lobby member change event: ', event);
      const partySize = Object.keys(event.data.players).length;
      if (this.lastPartySize === partySize) {
        this.log(`Same party size (${partySize}), so ignoring`);
        return;
      }
      this.lastPartySize = partySize;
      if (partySize !== 5) {
        this.log(`Not a full party (${partySize}), so ignoring`);
        return;
      }
      const chatUrl = `${CHAT_ENDPOINTS.base}/${event.data.partyId}${CHAT_ENDPOINTS.suffix}`;
      const players = Object.values(event.data.players).map((player) => player.gameName);
      await this.spamLink(chatUrl, region, players);
    };
  }
}
