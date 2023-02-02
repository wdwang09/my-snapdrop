<script setup lang="ts">
import { ServerConnection } from "./scripts/connection";
import { PublicEvent } from "./scripts/public_event";
import { RtcPeer } from "./scripts/peer";
import type { PeerInfo } from "./scripts/peer";
import { ref } from "vue";
import type { Ref } from "vue";
import ReceivedText from "./components/ReceivedText.vue";
import OnePeer from "./components/OnePeer.vue";

// let room = new Map<string, PeerInfo>();
let peerInfos: Ref<Record<string, PeerInfo>> = ref({});
let peerConnecters: Record<string, RtcPeer> = {};

// let selfId = ref("");
let displayName = ref("");
let textToSend = ref("");

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

// Receive WebRTC Signal
PublicEvent.on("signal", (event) => {
  const msg: { from: string } = (event as CustomEvent).detail;
  // console.log("Vue signal", Object.keys(msg));

  if (!peerConnecters[msg.from]) {
    // Create a recipient
    peerConnecters[msg.from] = new RtcPeer(server, msg.from, false);
  }

  peerConnecters[msg.from].onSignalMessage(msg);
});

function sendText(peerId: string): boolean {
  if (textToSend.value && peerConnecters[peerId]) {
    return peerConnecters[peerId].sendText(textToSend.value);
  }
  return false;
}

function sendFiles(peerId: string, fileList: FileList): void {
  if (peerConnecters[peerId]) {
    return peerConnecters[peerId].sendFiles(fileList);
  }
}

function peerIdToName(peerId: string): string {
  if (peerInfos.value[peerId] && peerInfos.value[peerId].displayName) {
    return peerInfos.value[peerId].displayName;
  } else {
    return peerId;
  }
}
</script>

<template>
  <h1>{{ displayName }}</h1>

  <main>
    <ul>
      <template v-for="info in peerInfos" :key="info.peerId">
        <OnePeer :send-text="sendText" :send-files="sendFiles" :info="info" />
      </template>
    </ul>

    <div>Write text here:</div>
    <textarea v-model="textToSend" />
    <ReceivedText :id-to-name="peerIdToName" />
  </main>
</template>

<style scoped></style>
