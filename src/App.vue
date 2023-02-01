<script setup lang="ts">
import HelloWorld from "./components/HelloWorld.vue";
import { ServerConnection } from "./scripts/connection";
import { RtcPeer } from "./scripts/peer";
import { PublicEvent } from "./scripts/public_event";
import type { PeerInfo } from "./scripts/peer";
import { ref } from "vue";
import type { Ref } from "vue";
// import OnePeer from "./components/OnePeer.vue";

// let room = new Map<string, PeerInfo>();
let peerInfos: Ref<Record<string, PeerInfo>> = ref({});
let peerConnecters: Record<string, RtcPeer> = {};

// let selfId = ref("");
let displayName = ref("");

// new ServerConnection();
const server = new ServerConnection();

// As WebRTC caller
PublicEvent.on("existing-peers", (event) => {
  let msg: { self: PeerInfo; peers: Record<string, PeerInfo> } = (
    event as CustomEvent
  ).detail;
  // selfId.value = msg.self.peerId;
  displayName.value = msg.self.displayName;

  for (const peerId in msg.peers) {
    peerInfos.value[peerId] = msg.peers[peerId];
    peerConnecters[peerId] = new RtcPeer(server, peerId);
  }
});

// As WebRTC recipient
PublicEvent.on("peer-joined", (event) => {
  let msg: { peer: PeerInfo } = (event as CustomEvent).detail;
  // console.log("Peer joined", msg.peer.displayName);
  peerInfos.value[msg.peer.peerId] = msg.peer;
});

PublicEvent.on("peer-left", (event) => {
  let msg: { peerId: string } = (event as CustomEvent).detail;
  console.log("Peer left", msg.peerId);

  if (peerConnecters[msg.peerId]) {
    delete peerConnecters[msg.peerId];
  }
  if (peerInfos.value[msg.peerId]) {
    delete peerInfos.value[msg.peerId];
  }
});

// PublicEvent.on("peers", (event) => {
//   // console.log("Vue:", (message as CustomEvent).detail);
//   selfId.value = (event as CustomEvent).detail.selfId;

//   const newRoom: Record<string, PeerInfo> = (event as CustomEvent).detail
//     .peerInfo;
//   // room.value = newRoom;
//   // let peersLeft = new Set<string>(room.keys());
//   let peersLeft = new Set<string>(Object.keys(room.value));
//   let peersJoin = new Set<string>(Object.keys(newRoom));
//   for (const peerId in newRoom) {
//     peersLeft.delete(peerId);
//   }
//   for (const peerId in room) {
//     peersJoin.delete(peerId);
//   }
//   for (const idLeft of peersLeft) {
//     // room.delete(idLeft);
//     delete room.value[idLeft];
//     delete rtcManager[idLeft];
//   }
//   for (const idJoin of peersJoin) {
//     room.value[idJoin] = newRoom[idJoin];
//     // room.set(idJoin, newRoom[idJoin]);
//     if (idJoin != selfId.value && !rtcManager[idJoin]) {
//       rtcManager[idJoin] = new RtcPeer(server, idJoin);
//     }
//   }

//   // console.log(selfId.value);
//   // displayName.value = room.get(selfId.value)!.displayName;
//   displayName.value = room.value[selfId.value]!.displayName;
// });

PublicEvent.on("signal", (event) => {
  const msg: { from: string } = (event as CustomEvent).detail;
  // console.log("Vue signal", msg);
  console.log("Vue signal", Object.keys(msg));

  if (!peerConnecters[msg.from]) {
    // Create a recipient
    peerConnecters[msg.from] = new RtcPeer(server, null);
  }

  peerConnecters[msg.from].onSignalMessage(msg);
});
</script>

<template>
  <header>
    <div class="wrapper">
      <HelloWorld :msg="displayName" />
    </div>
  </header>

  <main>
    <ul>
      <template v-for="info in peerInfos" :key="info.peerId">
        <li>{{ info.displayName }}: {{ info.deviceName }}</li>
        <!-- <li v-if="info.peerId != selfId">
        <OnePeer :info="info"/>
      </li> -->
      </template>
    </ul>
  </main>
</template>

<style scoped></style>
