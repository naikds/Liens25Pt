import {applyRemote,createRole,applyRole} from './game.js';

//Photonサーバ系
// Photonサーバの設定
const appId = '09ff3dce-fed5-4215-8d3f-76310ae38875'; // 提供されたApp IDを使用
const appVersion = '1.0'; // アプリケーションバージョンを設定
const region = 'us'; // 使用するリージョンを設定（例：'us', 'eu', 'asia' など）

const client = new Photon.LoadBalancing.LoadBalancingClient(Photon.ConnectionProtocol.Wss, appId, appVersion);
let room = null;

client.connectOptions = { 
  keepAliveTimeout: 30000, // WebSocketのkeep-aliveタイムアウト（ミリ秒） 
  disconnectTimeout: 60000 // サーバーが応答しない場合のタイムアウト（ミリ秒）
}
// Photonサーバへの接続開始
client.onStateChange = function (state) {
  const stateName = getStateName(state);
  console.log(`Photon state changed to: ${stateName}`);
  // result.innerHTML = `サーバ: ${stateName}`;
  if (state === Photon.LoadBalancing.LoadBalancingClient.State.JoinedLobby) {
  const rooms = client.availableRooms();
  const exists = rooms.some(r => r.name === "room1");

    client.createRoom("room1", { maxPlayers: 2 });
    client.joinRoom("room1");
}
};

// ルーム参加成功時の処理
client.onJoinRoom = function () {
  console.log(`Joined room: ${client.myRoom().name}`);
  // result.innerHTML = `サーバ: ${`Joined room: ${client.myRoom().name}`}`;
  sendPhotonMessage(3,'roomjoin');
};

// ルーム作成成功時の処理
client.onCreatedRoom = function () {
  console.log(`Created room: ${client.myRoom().name}`);
};

// エラー処理
client.onError = function (errorCode, errorMessage) {
  console.error(`Photon error: ${errorCode} - ${errorMessage}`);
};

export function reConnect(){
  client.connectToRegionMaster(region);
}


//メッセージ送信
export function sendPhotonMessage(code, message) {
    client.raiseEvent(code, message);
}

// メッセージ受信処理
client.onEvent = function (code, content, actorNr) {
  console.log(`Received event: ${code} from ${actorNr} with content: ${content}`);
  if (code === 1) { // コード1はメッセージイベントとします
    applyRemote(content);
  }

  if(code === 3){
    createRole();
  }

  if(code ===5){
    applyRole(content);
  }
};

//Photn用の関数
// 状態名を取得する関数
function getStateName(state) {
    const states = Photon.LoadBalancing.LoadBalancingClient.State;
    for (let key in states) {
      if (states[key] === state) {
        return key;
      }
    }
    return "Unknown";
  }
