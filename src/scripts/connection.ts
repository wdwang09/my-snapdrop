import { PublicEvent } from "./public_event";

export class ServerConnection {
  private reconnectTimer: number | undefined;
  private socket: WebSocket | null;

  constructor() {
    this.socket = null;
    this.connectToServer();
    PublicEvent.on("beforeunload", () => this.disconnect());
    PublicEvent.on("pagehide", () => this.disconnect());
    document.addEventListener("visibilitychange", () =>
      this.onVisibilityChange()
    );
  }

  private connectToServer() {
    clearTimeout(this.reconnectTimer);
    if (this.isConnected() || this.isConnecting()) return;
    const ws = new WebSocket(this.webSocketUrl());
    ws.binaryType = "arraybuffer";
    ws.onopen = () => {
      console.log("WS: server connected.");
    };
    ws.onmessage = (event) => this.changeWsMsgToEvent(event.data);
    ws.onclose = () => this.onDisconnect();
    ws.onerror = (e) => console.error(e);
    this.socket = ws;
  }

  private changeWsMsgToEvent(msgStr: string) {
    // Change ws message to public event. Decoupled with other parts.
    const msg = JSON.parse(msgStr);
    // console.log("WS receive message:", msgStr);
    switch (msg.type as string) {
      // case "peers":
      //   PublicEvent.fire("peers", msg.detail.message);
      //   // console.log("WS peers:", Object.keys(msg.message.peerInfo));
      //   // console.log("WS selfInfo:", msg.message.peerInfo[msg.message.selfId]);
      //   break;
      case "existing-peers":
        console.log("WS existing-peers", msg.detail);
        PublicEvent.fire("existing-peers", msg.detail);
        break;
      case "peer-joined":
        PublicEvent.fire("peer-joined", msg.detail);
        break;
      case "peer-left":
        PublicEvent.fire("peer-left", msg.detail);
        break;
      // case "self-info":
      //   PublicEvent.fire("self-info", msg);
      //   console.log("WS self-info:", msg.message);
      //   break;
      case "signal": // webRTC
        // console.log("WS signal:", msg.detail.from);
        PublicEvent.fire("signal", msg.detail);
        break;
      case "ping":
        this.sendToServer({ type: "pong" });
        break;
      default:
        console.error("WS: unknown message type", msg);
    }
  }

  public sendToServer(message: { type: string; detail?: object }) {
    if (!this.isConnected()) return;
    this.socket!.send(JSON.stringify(message));
  }

  private webSocketUrl() {
    // https://developer.mozilla.org/en-US/docs/Web/API/Location
    const protocol = location.protocol.startsWith("https") ? "wss" : "ws";
    const url = protocol + "://" + location.host + location.pathname;
    return url;
  }

  private disconnect() {
    this.sendToServer({ type: "disconnect" });
    if (this.socket === null) return;
    this.socket.onclose = null;
    this.socket.close();
  }

  private onDisconnect() {
    console.log("WS: server disconnected");
    PublicEvent.fire("notify-user", "Connection lost. Retry in 5 seconds...");
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connectToServer(), 5000);
  }

  private onVisibilityChange() {
    if (document.hidden) return;
    this.connectToServer();
  }

  public isConnected() {
    return this.socket && this.socket.readyState === this.socket.OPEN;
  }

  public isConnecting() {
    return this.socket && this.socket.readyState === this.socket.CONNECTING;
  }
}
