<script setup lang="ts">
import { PublicEvent } from "@/scripts/public_event";
import { ref } from "vue";

const props = defineProps<{
  id_to_name?: (id: string) => string;
}>();

let displayName = ref("");
let text = ref("");

PublicEvent.on("text", (event) => {
  const textMsg: {
    detail: string;
    peerId: string;
  } = (event as CustomEvent).detail;
  text.value = (event as CustomEvent).detail.detail;
  if (props.id_to_name) {
    displayName.value = props.id_to_name(textMsg.peerId);
  } else {
    displayName.value = textMsg.peerId;
  }
});
</script>

<template>
  <div v-if="!displayName">Received Text:</div>
  <div v-if="displayName">From: {{ displayName }}</div>
  <textarea v-model="text"></textarea>
</template>

<style scoped></style>
