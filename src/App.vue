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
    peerConnecters[peerId] = new RtcPeer(server, peerId, true);
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
    peerConnecters[msg.peerId].closeWebRTC();
    delete peerConnecters[msg.peerId];
  }
  if (peerInfos.value[msg.peerId]) {
    delete peerInfos.value[msg.peerId];
  }
});

PublicEvent.on("signal", (event) => {
  const msg: { from: string } = (event as CustomEvent).detail;
  // console.log("Vue signal", Object.keys(msg));

  if (!peerConnecters[msg.from]) {
    // Create a recipient
    peerConnecters[msg.from] = new RtcPeer(server, msg.from, false);
  }

  peerConnecters[msg.from].onSignalMessage(msg);
});

function sendTextDemo(peerId: string) {
  if (peerConnecters[peerId]) {
    peerConnecters[peerId].sendToPeer({ type: "text", message: "123" });
  }
}
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
        <li>
          {{ info.displayName }}: {{ info.deviceName }}
          <button @click="sendTextDemo(info.peerId)">123</button>
        </li>
        <!-- <li v-if="info.peerId != selfId">
        <OnePeer :info="info"/>
      </li> -->
      </template>
    </ul>
  </main>
</template>

<style scoped></style>
