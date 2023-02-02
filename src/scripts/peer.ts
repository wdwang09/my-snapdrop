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

  constructor(
    serverConnection: ServerConnection,
    peerId: string,
    isCallerOrRecipient: boolean
  ) {
    // console.log("Construct RtcPeer!");
    this.serverConnection = serverConnection;
    this.isCaller = isCallerOrRecipient;
    this.peerId = peerId;
    if (isCallerOrRecipient) {
      // As WebRTC Caller
      this.connectWebRTC();
    } else {
      // As WebRTC Recipient
    }
  }

  private onRtcChannelMessage(msgStr: string) {
    const message = JSON.parse(msgStr);
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
      case "text":
        console.log(`RTC Text: "${message.detail}" from ${this.peerId}`);
        PublicEvent.fire("text", {
          peerId: this.peerId,
          detail: message.detail,
        });
        break;
      default:
        console.log("RTC:", message);
        console.warn(`message type "${message.type}" isn't supported.`);
    }
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
    this.rtcConn.onconnectionstatechange = () => this.onConnectionStateChange();
    this.rtcConn.oniceconnectionstatechange = () =>
      this.onIceConnectionStateChange();
  }

  // https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/icecandidate_event
  private onIceCandidate(event: RTCPeerConnectionIceEvent) {
    // console.log("onIceCandidate");
    if (!event.candidate) return;
    this.sendSignal({ ice: event.candidate });
  }

  // https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/connectionstatechange_event
  private onConnectionStateChange(/*_event: Event*/) {
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
      default:
        // console.log("connectionState", this.rtcConn.connectionState);
        break;
    }
  }

  // https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/iceconnectionstatechange_event
  private onIceConnectionStateChange() {
    // console.log("onIceConnectionStateChange");
    if (this.rtcConn === null) {
      console.error("this.rtcConn is null");
      return;
    }
    switch (this.rtcConn.iceConnectionState) {
      case "failed":
        console.error("ICE Gathering failed");
        break;
      default:
        console.log(
          "onIceConnectionStateChange: ICE Gathering:",
          this.rtcConn.iceConnectionState
        );
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
    // channel should be RTCDataChannel rather than RTCPeerConnection
    const channel: RTCDataChannel = (event as any).channel || event.target;
    if (!channel) {
      console.error("No RTCDataChannel");
      return;
    }
    channel.onmessage = (e: { data: string }) =>
      this.onRtcChannelMessage(e.data);
    channel.onclose = () => this.onChannelClosed();
    this.channel = channel;
    console.log(
      `RTC (${this.isCaller ? "caller" : "recipient"}): channel opened.`
    );
  }

  private onChannelClosed() {
    if (!this.isCaller) return; // No recipient
    console.log("RTC: channel closed", this.peerId);
    this.connectWebRTC(); // Caller reopen the channel
  }

  public closeWebRTC() {
    this.channel?.close();
    this.rtcConn?.close();
  }

  private onDescription(description: RTCSessionDescriptionInit) {
    // console.log("onDescription", description.type, Date.now());
    // https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/setLocalDescription
    // console.log("description", description);
    this.rtcConn!.setLocalDescription(description)
      .then(() => {
        // console.log("description", description);
        this.sendSignal({ sdp: description });
      })
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
      console.log("Receive SDP", message.sdp);
      if (this.rtcConn === null) {
        console.error("rtcConn shouldn't be null.");
      }
      const rtcSessionDescription = new RTCSessionDescription(message.sdp);
      console.log("RTCSessionDescription(message.sdp)", rtcSessionDescription);
      const setRemoteDescriptionAsync = this.rtcConn!.setRemoteDescription(
        rtcSessionDescription
      );
      setRemoteDescriptionAsync
        .then(() => {
          console.log("After setRemoteDescription", rtcSessionDescription.type);
          if (rtcSessionDescription.type === "offer") {
            return this.rtcConn!.createAnswer().then((d) => {
              // console.log("After create answer.", d);
              this.onDescription(d);
            });
          } else if (rtcSessionDescription.type === "answer") {
            // console.log();
          }
        })
        .catch((e) => console.error(e));
    } else if (message.ice) {
      console.log("Receive ICE");
      this.rtcConn!.addIceCandidate(new RTCIceCandidate(message.ice));
    }
  }

  private sendSignal(signal: {
    sdp?: RTCSessionDescriptionInit;
    ice?: RTCIceCandidate;
    to?: string | null;
  }) {
    signal.to = this.peerId; // TODO: to is ""
    const msg = { type: "signal", detail: signal };
    console.log("sendSignal", msg.detail);
    this.serverConnection.sendToServer(msg);
  }

  public sendText(msgStr: string): boolean {
    const msg = {
      type: "text",
      detail: msgStr,
    };
    return this.sendToPeer(msg);
  }

  private sendToPeer(msgObj: object): boolean {
    const msg = JSON.stringify(msgObj);
    if (!this.isConnected()) {
      // console.warn("this.channel.readyState", this.channel, this.channel!.readyState);
      this.refresh();
      console.warn("Send Fail:", msg);
      return false;
    }
    console.log("msg sent to peer:", msg);
    this.channel!.send(msg);
    return true;
  }

  private refresh() {
    if (this.isConnected() || this.isConnecting()) return;
    // if (!this.peerId) return;
    this.connectWebRTC();
  }

  public isConnected() {
    // console.warn("channel.readyState", this.channel!, this.channel!.readyState);
    return this.channel && this.channel.readyState === "open";
  }

  public isConnecting() {
    return this.channel && this.channel.readyState === "connecting";
  }
}
