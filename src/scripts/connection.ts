import { PublicEvent } from "./public_event";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";

export class ServerConnection {
  private socket: Socket;

  constructor() {
    this.socket = io();
    this.registerSocketIoEvent();
    // this.connectToServer();
    // PublicEvent.on("beforeunload", () => this.disconnect());
    // PublicEvent.on("pagehide", () => this.disconnect());
    // document.addEventListener("visibilitychange", () =>
    //   this.onVisibilityChange());
  }

  private registerSocketIoEvent() {
    this.socket.on("message", (msg: { type: string; detail: object }) => {
      switch (msg.type) {
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
        case "signal": // webRTC
          // console.log("WS signal:", msg.detail);
          PublicEvent.fire("signal", msg.detail);
          break;
        default:
          console.error("WS: unknown message", msg);
      }
    });
  }

  public sendToServer(message: { type: string; detail: object }) {
    this.socket.emit("message", message);
  }

  // private onDisconnect() {
  //   console.log("WS: server disconnected");
  //   PublicEvent.fire("notify-user", "Connection lost. Retry in 5 seconds...");
  // }
}
