import { PublicEvent } from "./public_event";
import type { ServerConnection } from "./connection";

type PeerInfo = {
  peerId: string;
  model: string | undefined;
  os: string | undefined;
  browser: string | undefined;
  type: string | undefined;
  deviceName: string;
  displayName: string;
};

class RTCPeer {
  private serverConnection: ServerConnection;
  readonly peerId: string;
  private isCaller: boolean = false;
  private rtcConn: RTCPeerConnection | null = null;
  private channel: any; // TODO
  static readonly rtcConfig = {
    sdpSemantics: "unified-plan",
    iceServers: [
      {
        urls: "stun:stun.l.google.com:19302",
      },
    ],
  };

  constructor(serverConnection: ServerConnection, peerId: string) {
    this.serverConnection = serverConnection;
    this.peerId = peerId;
    if (!this.peerId) return; // TODO
    this.connect(peerId, true);
  }

  private connect(peerId: string, isCaller: boolean) {
    console.log("Connect WebRTC!");
    if (!this.rtcConn) this.openConnection(peerId, isCaller);

    if (isCaller) {
      this.openChannel();
    } else {
      this.rtcConn!.ondatachannel = (e) => this.onChannelOpened(e);
    }
  }

  private openConnection(peerId: string, isCaller: boolean) {
    this.isCaller = isCaller;
    this.rtcConn = new RTCPeerConnection(RTCPeer.rtcConfig);
    // this.rtcConn.onicecandidate = e => this.onIceCandidate(e);
    // this.rtcConn.onconnectionstatechange = e => this.onConnectionStateChange(e);
    // this.rtcConn.oniceconnectionstatechange = e => this.onIceConnectionStateChange(e);
  }

  private openChannel() {
    // https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createDataChannel
    const channel = this.rtcConn!.createDataChannel("data-channel", {
      // https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/ordered
      ordered: true,
    });
    channel.binaryType = "arraybuffer";
    channel.onopen = (e) => this.onChannelOpened(e);
    // https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createOffer
    this.rtcConn!.createOffer()
      .then((d) => this.onDescription(d))
      .catch((e) => {
        console.error(e);
      });
  }

  private onChannelOpened(event: Event) {
    console.log("RTC: channel opened with", this.peerId);
    const channel = (event as any).channel || event.target;
    console.info(channel); // TODO type!!!!!!!!!!!!!!
    channel.onmessage = (e: { data: string }) => this.onChannelMessage(e.data);
    channel.onclose = () => this.onChannelClosed();
    this.channel = channel;
  }

  private onChannelMessage(msg_str: string) {
    if (typeof msg_str !== "string") {
      // this.onChunkReceived(msg_str);
      return;
    }
    const message = JSON.parse(msg_str);
    console.log("RTC:", message);
    switch (message.type) {
      // case 'header':
      //     this._onFileHeader(message);
      //     break;
      // case 'partition':
      //     this._onReceivedPartitionEnd(message);
      //     break;
      // case 'partition-received':
      //     this._sendNextPartition();
      //     break;
      // case 'progress':
      //     this._onDownloadProgress(message.progress);
      //     break;
      // case 'transfer-complete':
      //     this._onTransferCompleted();
      //     break;
      // case 'text':
      //     this._onTextReceived(message);
      //     break;
      default:
        console.error(`message.type ${message.type} isn't supported.`);
    }
  }

  private onChannelClosed() {
    console.log("RTC: channel closed", this.peerId);
    if (!this.isCaller) return;
    this.connect(this.peerId, true); // reopen the channel
  }

  private onDescription(description: RTCSessionDescriptionInit) {
    this.rtcConn!.setLocalDescription(description)
      .then(() => this.sendSignal({ sdp: description }))
      .catch((e) => {
        console.error(e);
      });
  }

  private sendSignal(signal: {
    sdp: RTCSessionDescriptionInit;
    type?: string;
    to?: string;
  }) {
    signal.type = "signal";
    signal.to = this.peerId;
    this.serverConnection.sendToServer(signal);
  }

  public refresh() {
    if (this.isConnected() || this.isConnecting()) return;
    this.connect(this.peerId, this.isCaller);
  }

  public isConnected() {
    return this.channel && this.channel.readyState === "open";
  }

  public isConnecting() {
    return this.channel && this.channel.readyState === "connecting";
  }
}

export class PeersManager {
  private serverConnection: ServerConnection;
  private peers: Record<string, RTCPeer>;

  constructor(serverConnection: ServerConnection) {
    this.peers = {};
    this.serverConnection = serverConnection;
    PublicEvent.on("existing-peers", (e) =>
      this.onExistingPeers((e as any).detail)
    );
  }

  private onExistingPeers(peers: PeerInfo[]) {
    peers.forEach((peer) => {
      if (this.peers[peer.peerId]) {
        this.peers[peer.peerId].refresh();
      } else {
        this.peers[peer.peerId] = new RTCPeer(
          this.serverConnection,
          peer.peerId
        );
      }
    });
  }
}
