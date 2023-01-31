class Events {
  static fire(type: string, detail: Object) {
    // https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/dispatchEvent
    window.dispatchEvent(new CustomEvent(type, { detail: detail }));
  }

  static on(type: string, callback: EventListenerOrEventListenerObject) {
    return window.addEventListener(type, callback, false);
  }
}

export class ServerConnection {
  private reconnectTimer: number | undefined;
  private socket: WebSocket | null;

  constructor() {
    this.socket = null;
    this.connect();
    Events.on("beforeunload", () => this.disconnect());
    Events.on("pagehide", () => this.disconnect());
    document.addEventListener("visibilitychange", () =>
      this.onVisibilityChange()
    );
  }

  private connect() {
    clearTimeout(this.reconnectTimer);
    if (this.isConnected() || this.isConnecting()) return;
    const ws = new WebSocket(this.endpoint());
    ws.binaryType = "arraybuffer";
    ws.onopen = () => {
      console.log("WS: server connected.");
    };
    ws.onmessage = (event) => this.onMessage(event.data);
    ws.onclose = () => this.onDisconnect();
    ws.onerror = (e) => console.error(e);
    this.socket = ws;
  }

  private onMessage(msgStr: string) {
    const msg = JSON.parse(msgStr);
    console.log("WS receive message:", msgStr);
    switch (msg.type as string) {
      case "peers":
        Events.fire("peers", msg.peers);
        break;
      case "peer-joined":
        Events.fire("peer-joined", msg.peer);
        break;
      case "peer-left":
        Events.fire("peer-left", msg.peerId);
        break;
      case "signal":
        Events.fire("signal", msg);
        break;
      case "ping":
        this.sendToServer({ type: "pong" });
        break;
      case "display-name":
        Events.fire("display-name", msg);
        break;
      default:
        console.error("WS: unknown message type", msg);
    }
  }

  private sendToServer(message: Object) {
    if (!this.isConnected()) return;
    this.socket!.send(JSON.stringify(message));
  }

  private endpoint() {
    const protocol = location.protocol.startsWith("https") ? "wss" : "ws";
    const url = protocol + "://" + location.host + location.pathname;
    return url;
  }

  private disconnect() {
    if (this.socket === null) return;
    this.sendToServer({ type: "disconnect" });
    this.socket.onclose = null;
    this.socket.close();
  }

  private onDisconnect() {
    console.log("WS: server disconnected");
    Events.fire("notify-user", "Connection lost. Retry in 5 seconds...");
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), 5000);
  }

  private onVisibilityChange() {
    if (document.hidden) return;
    this.connect();
  }

  public isConnected() {
    return this.socket && this.socket.readyState === this.socket.OPEN;
  }

  public isConnecting() {
    return this.socket && this.socket.readyState === this.socket.CONNECTING;
  }
}
