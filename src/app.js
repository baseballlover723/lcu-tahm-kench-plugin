const LCUConnector = require('lcu-connector');
const RiotWebSocket = require('./riotWebSocket');

const connector = new LCUConnector();
connector.on('connect', (data) => {
  console.log('League Client has started, connecting websocket', data);
  const ws = new RiotWebSocket(data);

  ws.on('open', () => {
    ws.subscribe('OnJsonApiEvent', console.log);
    console.log('ready');
  });
});

connector.on('disconnect', () => {
  console.log('League Client has been closed');
});

// Start listening for the LCU client
connector.start();
console.log('Listening for League Client');
