import * as express from "express";
import { createServer as createViteServer } from "vite";
import { env } from "process";
import { createServer as createHttpServer } from "http";
import type * as http from "http";
import { Server as WsServer } from "ws";
import type * as ws from "ws";
import * as uaParser from "ua-parser-js";

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
  socket: ws.WebSocket;
  peerId: string;
  info: PeerInfo;
  timerId: NodeJS.Timeout | null;
  lastBeat: number;

  constructor(socket: ws.WebSocket, request: http.IncomingMessage) {
    this.socket = socket;
    this.setPeerId(request);
    this.setInfo(request);
    // for keepalive
    this.timerId = null;
    this.lastBeat = Date.now();

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
  private wss: WsServer<ws.WebSocket>;
  private room: Record<string, Peer>;

  constructor(httpServer: http.Server) {
    this.wss = new WsServer({ server: httpServer });
    this.wss.on("connection", (socket, request) =>
      this.onConnection(new Peer(socket, request))
    );
    this.wss.on("headers", (headers, response) =>
      this.onHeaders(headers, response)
    );

    this.room = {};
  }

  private onConnection(peer: Peer) {
    this.joinRoom(peer);
    peer.socket.on("message", (message) =>
      this.onWsMsgFromClient(peer, message)
    );
    peer.socket.on("error", console.error);
    this.keepAlive(peer);

    // this.send(peer, {
    //   type: "self-info",
    //   message: {
    //     peerId: peer.peerId,
    //     displayName: peer.info.displayName,
    //     deviceName: peer.info.deviceName,
    //   },
    // });
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

    // this.sendPeerListToClient();
  }

  private getAllPeerInfo(): Record<string, PeerInfo> {
    const allPeers: Record<string, PeerInfo> = {};
    for (const peerId in this.room) {
      allPeers[peerId] = this.room[peerId].info;
    }
    return allPeers;
  }

  private onWsMsgFromClient(sender: Peer, message: ws.RawData) {
    let msg: { type: string; detail?: object } = { type: "" };
    try {
      msg = JSON.parse(message as any);
    } catch (e) {
      return;
    }
    // console.log("On Message!", sender.peerId, msg);

    switch (msg.type) {
      case "disconnect":
        console.log("Disconnect:", sender.peerId);
        this.leaveRoom(sender);
        break;
      case "pong":
        sender.lastBeat = Date.now();
        // this.sendPeerListToClient();
        break;
    }

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

  private keepAlive(peer: Peer) {
    this.cancelKeepAlive(peer);
    const timeout_ms = 5000;
    if (!peer.lastBeat) {
      peer.lastBeat = Date.now();
    }
    if (Date.now() - peer.lastBeat > 2 * timeout_ms) {
      this.leaveRoom(peer);
      return;
    }

    this.sendToClient(peer, { type: "ping" });

    peer.timerId = setTimeout(() => this.keepAlive(peer), timeout_ms);
  }

  private leaveRoom(peer: Peer) {
    if (!this.room[peer.peerId]) return;

    this.cancelKeepAlive(this.room[peer.peerId]);

    delete this.room[peer.peerId];

    peer.socket.terminate();

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

    // this.sendPeerListToClient();
  }

  // private sendPeerListToClient() {
  //   for (const peerId in this.room) {
  //     this.send(peerId, {
  //       type: "peers",
  //       message: {
  //         peerInfo: this.getAllPeerInfo(),
  //         selfId: peerId,
  //       },
  //     });
  //   }
  // }

  private sendToClient(
    peerObjectOrId: Peer | string,
    message: { type: string; detail?: object }
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
    if (peer.socket.readyState !== peer.socket.OPEN) return; // TODO to check
    const msg = JSON.stringify(message);
    peer.socket.send(msg, () => "");
  }

  private onHeaders(headers: string[], response: http.IncomingMessage) {
    if (
      response.headers.cookie &&
      response.headers.cookie.indexOf("peerid=") > -1
    ) {
      return;
    }
    response["peerId"] = Peer.uuid();
    headers.push(
      "Set-Cookie: peerid=" + response["peerId"] + "; SameSite=Strict; Secure"
    );
  }

  private cancelKeepAlive(peer: Peer) {
    if (peer.timerId) {
      clearTimeout(peer.timerId);
    }
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
  const server = createHttpServer(app);
  server.listen(port);
  new MyServer(server);
}

createServer(3000);
