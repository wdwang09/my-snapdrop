<script setup lang="ts">
import HelloWorld from "./components/HelloWorld.vue";
// import TheWelcome from "./components/TheWelcome.vue";
import { ServerConnection } from "./scripts/connection";
// import { PeersManager } from "./scripts/peer";
import { PublicEvent } from "./scripts/public_event";
import type { PeerInfo } from "./scripts/peer";
import { ref } from "vue";
import type { Ref } from "vue";

// let room = new Map<string, PeerInfo>();
let room: Ref<Record<string, PeerInfo>> = ref({});
let selfId = ref("");
let displayName = ref("");

new ServerConnection();
// const server = new ServerConnection();
// new PeersManager(server);

PublicEvent.on("peers", (message) => {
  // console.log("Vue:", (message as CustomEvent).detail);
  selfId.value = (message as CustomEvent).detail.selfId;

  const newRoom: Record<string, PeerInfo> = (message as CustomEvent).detail
    .peerInfo;
  // room.value = newRoom;
  // let peersLeft = new Set<string>(room.keys());
  let peersLeft = new Set<string>(Object.keys(room.value));
  let peersJoin = new Set<string>(Object.keys(newRoom));
  for (const peerId in newRoom) {
    peersLeft.delete(peerId);
  }
  for (const peerId in room) {
    peersJoin.delete(peerId);
  }
  for (const idLeft of peersLeft) {
    // room.delete(idLeft);
    delete room.value[idLeft];
  }
  for (const idJoin of peersJoin) {
    console.log("idJoin", idJoin);
    room.value[idJoin] = newRoom[idJoin];
    // room.set(idJoin, newRoom[idJoin]);
  }

  // console.log(selfId.value);
  // displayName.value = room.get(selfId.value)!.displayName;
  displayName.value = room.value[selfId.value]!.displayName;
});
</script>

<template>
  <header>
    <div class="wrapper">
      <HelloWorld :msg="displayName" />
    </div>
  </header>

  <main>
    <li v-for="value in room" :key="value.peerId">
      {{ value.displayName }}: {{ value.deviceName }}
    </li>
    <!-- <TheWelcome /> -->
  </main>
</template>

<style scoped></style>
