<script setup lang="ts">
import type { PeerInfo } from "@/scripts/peer";

const props = defineProps<{
  info: PeerInfo;
  sendText: (peerId: string) => void;
  sendFiles: (peerId: string, fileList: FileList) => void;
}>();

function onFilesChanged(event: Event) {
  const $input: any = event.target!;
  const files: FileList = $input.files;
  props.sendFiles(props.info.peerId, files);
}
</script>

<template>
  <li>
    {{ info.displayName }}: {{ info.deviceName }}
    <button @click="sendText(info.peerId)">Text</button>
    <br />
    <input type="file" @change="onFilesChanged" />
    <!-- <input type="file" multiple @change="onFilesChanged" /> -->
    <!-- Currently don't support multiple files. -->
  </li>
</template>

<style scoped></style>
