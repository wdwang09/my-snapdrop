import { PublicEvent } from "./public_event";
import type { ServerConnection } from "./connection";

export type PeerInfo = {
  peerId: string;
  model: string | undefined;
  os: string | undefined;
  browser: string | undefined;
  type: string | undefined;
  deviceName: string;
  displayName: string;
};

export class RtcPeer {
  private serverConnection: ServerConnection;
  public readonly peerId: string;
  public readonly isCaller: boolean = false;
  private rtcConn: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  static readonly rtcConfig = {
    sdpSemantics: "unified-plan",
    iceServers: [
      {
        urls: "stun:stun.l.google.com:19302",
      },
    ],
  };

  constructor(serverConnection: ServerConnection, peerIdOrNull: string | null) {
    // console.log("Construct RtcPeer!");
    this.serverConnection = serverConnection;
    if (peerIdOrNull === null) {
      // As WebRTC Recipient
      this.isCaller = false;
      this.peerId = "";
    } else {
      // As WebRTC Caller
      this.isCaller = true;
      this.peerId = peerIdOrNull;
    }
    if (!this.peerId) return;
    this.connectWebRTC();
  }

  private connectWebRTC() {
    console.log("Connect WebRTC! isCaller:", this.isCaller);
    // if (!this.rtcConn) this.openConnection(peerId);
    if (!this.rtcConn) this.createRTCPeerConnection();

    if (this.isCaller) {
      this.callerOpenChannel();
    } else {
      // Don't createDataChannel
      this.rtcConn!.ondatachannel = (e) => this.onChannelOpened(e);
    }
  }

  private createRTCPeerConnection() {
    this.rtcConn = new RTCPeerConnection(RtcPeer.rtcConfig);
    this.rtcConn.onicecandidate = (e) => this.onIceCandidate(e);
    this.rtcConn.onconnectionstatechange = (e) =>
      this.onConnectionStateChange(e);
    this.rtcConn.oniceconnectionstatechange = () =>
      this.onIceConnectionStateChange();
  }

  // https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/icecandidate_event
  private onIceCandidate(event: RTCPeerConnectionIceEvent) {
    if (!event.candidate) return;
    this.sendSignal({ ice: event.candidate });
  }

  // https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/connectionstatechange_event
  private onConnectionStateChange(event: Event) {
    if (this.rtcConn === null) return;
    console.log("RTC: state changed:", this.rtcConn.connectionState);
    switch (this.rtcConn.connectionState) {
      case "disconnected":
        this.onChannelClosed();
        break;
      case "failed":
        this.rtcConn = null;
        this.onChannelClosed();
        break;
    }
  }

  // https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/iceconnectionstatechange_event
  private onIceConnectionStateChange() {
    if (this.rtcConn === null) return;
    switch (this.rtcConn.iceConnectionState) {
      case "failed":
        console.error("ICE Gathering failed");
        break;
      default:
        console.log("ICE Gathering", this.rtcConn.iceConnectionState);
    }
  }

  // https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Connectivity
  private callerOpenChannel() {
    if (this.rtcConn === null) {
      console.error("Impossible");
      return;
    }

    // https://developer.mozilla.org/en-US/docs/Web/API/RtcPeerConnection/createDataChannel
    const channel = this.rtcConn.createDataChannel("data-channel", {
      ordered: true,
    });
    channel.binaryType = "arraybuffer";
    channel.onopen = (e) => this.onChannelOpened(e);
    // https://developer.mozilla.org/en-US/docs/Web/API/RtcPeerConnection/createOffer
    this.rtcConn
      .createOffer()
      .then((d) => this.onDescription(d))
      .catch((e) => {
        console.error(e);
      });
  }

  // Both in caller and recipient
  private onChannelOpened(event: Event) {
    console.log(
      `RTC (isCaller: ${this.isCaller}): channel opened with ${this.peerId}`
    );
    console.log("event.channel", (event as any).channel);
    console.log("event.target", (event as any).target);
    const channel: RTCDataChannel = (event as any).channel || event.target;
    channel.onmessage = (e: { data: string }) => this.onChannelMessage(e.data);
    channel.onclose = () => this.onChannelClosed();
    this.channel = channel;
  }

  private onChannelMessage(msg_str: string) {
    if (typeof msg_str !== "string") {
      console.warn("onChannelMessage:", msg_str);
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
    if (!this.isCaller) return; // No recipient
    console.log("RTC: channel closed", this.peerId);
    this.connectWebRTC(); // Caller reopen the channel
  }

  private onDescription(description: RTCSessionDescriptionInit) {
    // console.log("onDescription", description.type, Date.now());
    // https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/setLocalDescription
    this.rtcConn!.setLocalDescription(description)
      .then(() => this.sendSignal({ sdp: description }))
      .catch((e) => {
        console.error(e);
      });
  }

  public onSignalMessage(message: {
    from: string;
    sdp?: RTCSessionDescriptionInit;
    ice?: RTCIceCandidate;
  }) {
    if (!this.isCaller) {
      // recipient
      this.connectWebRTC();
    }

    if (message.sdp) {
      this.rtcConn!.setRemoteDescription(new RTCSessionDescription(message.sdp))
        .then((_) => {
          if (message.sdp!.type === "offer") {
            return this.rtcConn!.createAnswer().then((d) =>
              this.onDescription(d)
            );
          }
        })
        .catch((e) => console.error(e));
    } else if (message.ice) {
      this.rtcConn!.addIceCandidate(new RTCIceCandidate(message.ice));
    }
  }

  private sendSignal(signal: {
    sdp?: RTCSessionDescriptionInit;
    ice?: RTCIceCandidate;
    to?: string | null;
  }) {
    signal.to = this.peerId;
    const msg = { type: "signal", detail: signal };
    this.serverConnection.sendToServer(msg);
  }

  public send(message: string | object) {
    if (!this.channel) return this.refresh();
    console.log("message:", message);
    this.channel.send(message as any);
  }

  public refresh() {
    if (this.isConnected() || this.isConnecting()) return;
    // if (!this.peerId) return;
    this.connectWebRTC();
  }

  public isConnected() {
    return this.channel && this.channel.readyState === "open";
  }

  public isConnecting() {
    return this.channel && this.channel.readyState === "connecting";
  }
}

// export class PeersManager {
//   private serverConnection: ServerConnection;
//   private peers: Record<string, RtcPeer>;

//   constructor(serverConnection: ServerConnection) {
//     this.peers = {};
//     this.serverConnection = serverConnection;
//     // PublicEvent.on("existing-peers", (e) =>
//     //   this.onExistingPeers((e as CustomEvent).detail)
//     // );
//   }

//   private onExistingPeers(peers: PeerInfo[]) {
//     peers.forEach((peer) => {
//       if (this.peers[peer.peerId]) {
//         this.peers[peer.peerId].refresh();
//       } else {
//         this.peers[peer.peerId] = new RtcPeer(
//           this.serverConnection,
//           peer.peerId
//         );
//       }
//     });
//   }
// }
