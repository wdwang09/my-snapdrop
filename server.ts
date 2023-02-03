import * as express from "express";
import { Server as SioServer } from "socket.io";
import type { Socket as SioSocket } from "socket.io";
import * as uaParser from "ua-parser-js";
import { createServer as createViteServer } from "vite";
import { createServer as createHttpServer } from "http";
import type * as http from "http";
import { env } from "process";

type PeerInfo = {
  peerId: string;
  model: string | undefined;
  os: string | undefined;
  browser: string | undefined;
  type: string | undefined;
  deviceName: string;
  displayName: string;
};

class Peer {
  socket: SioSocket;
  peerId: string;
  info: PeerInfo;

  constructor(socket: SioSocket, request: http.IncomingMessage) {
    this.socket = socket;
    this.setPeerId(request);
    this.setInfo(request);

    // console.log("===");
    // console.log("peer:", this.peerId);
    // console.log("name:", this.name);
    // console.log("===");
  }

  private setPeerId(request: http.IncomingMessage) {
    if (request["peerId"]) {
      this.peerId = request["peerId"];
    } else {
      this.peerId = (request.headers.cookie ?? "").replace("peerid=", "");
    }
  }

  private setInfo(req: http.IncomingMessage) {
    const ua = uaParser(req.headers["user-agent"]);

    let deviceName = "";

    if (ua.os && ua.os.name) {
      deviceName = ua.os.name.replace("Mac OS", "Mac") + " ";
    }

    if (ua.device.model) {
      deviceName += ua.device.model;
    } else {
      deviceName += ua.browser.name;
    }

    if (!deviceName) deviceName = "Unknown Device";

    const displayName = this.peerId.slice(0, 4);

    this.info = {
      peerId: this.peerId,
      model: ua.device.model,
      os: ua.os.name,
      browser: ua.browser.name,
      type: ua.device.type,
      deviceName,
      displayName,
    };
  }

  static uuid() {
    let uuid = "";
    for (let ii = 0; ii < 32; ii += 1) {
      switch (ii) {
        case 8:
        case 20:
          uuid += "-";
          uuid += ((Math.random() * 16) | 0).toString(16);
          break;
        case 12:
          uuid += "-";
          uuid += "4";
          break;
        case 16:
          uuid += "-";
          uuid += ((Math.random() * 4) | 8).toString(16);
          break;
        default:
          uuid += ((Math.random() * 16) | 0).toString(16);
      }
    }
    return uuid;
  }
}

class MyServer {
  private sioServer: SioServer;
  private room: Record<string, Peer>;

  constructor(sioServer: SioServer) {
    this.sioServer = sioServer;
    this.sioServer.on("connection", (socket) => {
      const peer = new Peer(socket, socket.request);
      this.joinRoom(peer);
      // this.onConnection();

      socket.on("message", (message: { type: string; detail: object }) =>
        this.onWsMsgFromClient(peer, message)
      );

      socket.on("disconnect", () => {
        console.log("Disconnect:", peer.peerId);
        this.leaveRoom(peer);
      });
    });

    this.sioServer.engine.on(
      "headers",
      (headers: string[], response: http.IncomingMessage) => {
        this.onHeaders(headers, response);
      }
    );

    this.room = {};
  }

  private joinRoom(newPeer: Peer) {
    for (const otherPeerId in this.room) {
      const otherPeer = this.room[otherPeerId];
      // notify other peer that somebody joins (As WebRTC recipient)
      this.sendToClient(otherPeer, {
        type: "peer-joined",
        detail: { peer: newPeer.info },
      });
    }

    // send existing peer-list to current peer (As WebRTC caller)
    const otherPeers: Record<string, PeerInfo> = {};
    for (const otherPeerId in this.room) {
      otherPeers[otherPeerId] = this.room[otherPeerId].info;
    }
    this.sendToClient(newPeer, {
      type: "existing-peers",
      detail: {
        peers: otherPeers,
        self: newPeer.info,
      },
    });

    // join room
    this.room[newPeer.peerId] = newPeer;
  }

  private getAllPeerInfo(): Record<string, PeerInfo> {
    const allPeers: Record<string, PeerInfo> = {};
    for (const peerId in this.room) {
      allPeers[peerId] = this.room[peerId].info;
    }
    return allPeers;
  }

  private onWsMsgFromClient(
    sender: Peer,
    msg: { type: string; detail: object }
  ) {
    // console.log("On Message!", sender.peerId, msg);

    // relay message to recipient, including signal
    if (msg.detail && msg.detail["to"]) {
      const recipientId: string = msg.detail["to"];
      const recipient = this.room[recipientId];
      delete msg.detail["to"];
      msg.detail["from"] = sender.peerId;
      // console.log("Details:", msg.detail);
      this.sendToClient(recipient, msg);
      return;
    }
  }

  private leaveRoom(peer: Peer) {
    if (!this.room[peer.peerId]) return;

    delete this.room[peer.peerId];

    peer.socket.disconnect();

    // console.log(Object.keys(this.room));
    for (const otherPeerId in this.room) {
      const otherPeer = this.room[otherPeerId];
      this.sendToClient(otherPeer, {
        type: "peer-left",
        detail: {
          peerId: peer.peerId,
        },
      });
    }
  }

  private sendToClient(
    peerObjectOrId: Peer | string,
    message: { type: string; detail: object }
  ) {
    let peer: Peer | null = null;
    if (typeof peerObjectOrId === "string") {
      peer = this.room[peerObjectOrId];
    } else {
      peer = peerObjectOrId;
    }
    if (!peer) {
      console.error("Send: Peer doesn't exists.");
      return;
    }
    peer.socket.emit("message", message);
  }

  private onHeaders(headers: object, response: http.IncomingMessage) {
    if (
      response.headers.cookie &&
      response.headers.cookie.indexOf("peerid=") > -1
    ) {
      return;
    }
    response["peerId"] = Peer.uuid();
    headers["Set-Cookie"] =
      "peerid=" + response["peerId"] + "; SameSite=Strict; Secure";
  }
}

// ===

async function createServer(port = 3000) {
  const productionRootPath = "dist";
  const isProductionMode = env.NODE_ENV === "production";

  const app = express();

  if (!isProductionMode) {
    console.log("> Development Mode with Vite Support");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("> Production Mode");
    app.use(express.static(productionRootPath));
  }

  console.log(`> Server is ready on http://localhost:${port}`);
  const httpServer = createHttpServer(app);
  const io = new SioServer(httpServer);
  new MyServer(io);
  httpServer.listen(port);
}

createServer(3000);
