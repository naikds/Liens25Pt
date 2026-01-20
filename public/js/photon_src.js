// import {arrangeImages} from './arrange.js';

//Photonサーバ系
// Photonサーバの設定
const appId = '09ff3dce-fed5-4215-8d3f-76310ae38875'; // 提供されたApp IDを使用
const appVersion = '1.0'; // アプリケーションバージョンを設定
const region = 'us'; // 使用するリージョンを設定（例：'us', 'eu', 'asia' など）

const client = new Photon.LoadBalancing.LoadBalancingClient(Photon.ConnectionProtocol.Wss, appId, appVersion);
client.connectOptions = { 
  keepAliveTimeout: 30000, // WebSocketのkeep-aliveタイムアウト（ミリ秒） 
  disconnectTimeout: 60000 // サーバーが応答しない場合のタイムアウト（ミリ秒）
}
// Photonサーバへの接続開始
client.onStateChange = function (state) {
  const stateName = getStateName(state);
  console.log(`Photon state changed to: ${stateName}`);
  // result.innerHTML = `サーバ: ${stateName}`;
};

// ルーム参加成功時の処理
client.onJoinRoom = function () {
  console.log(`Joined room: ${client.myRoom().name}`);
  // result.innerHTML = `サーバ: ${`Joined room: ${client.myRoom().name}`}`;
};

// ルーム作成成功時の処理
client.onCreatedRoom = function () {
  console.log(`Created room: ${client.myRoom().name}`);
};

// エラー処理
client.onError = function (errorCode, errorMessage) {
  console.error(`Photon error: ${errorCode} - ${errorMessage}`);
};

//ルーム取得処理
client.onRoomList = function(rooms){

}

//ルーム作成処理
export function createRoom(roomName){
  if (roomName) {
    client.createRoom(roomName, { maxPlayers: 2 });
    client.joinRoom(roomName);
  }
}

//ルーム参加処理
export function joinRoom(roomName){
  if (roomName) {
    client.connectToRegionMaster(region);
    client.joinRoom(roomName);
  }
}

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
    // result.innerHTML = `Message from ${actorNr}: ${content}`;
  }

  //ルームに人が参加した場合にデッキの内容を送信
  if (code === 5) {
    // sendFirstCardInfo();
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
