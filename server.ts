import * as express from "express";
import { createServer as createViteServer } from "vite";
import { env } from "process";
import { createServer as createHttpServer } from "http";
import type * as http from "http";
import { Server as WsServer } from "ws";
import type * as ws from "ws";
import * as uaParser from "ua-parser-js";

class Peer {
  socket: ws.WebSocket;
  peerId: string;
  name: {
    model: string | undefined;
    os: string | undefined;
    browser: string | undefined;
    type: string | undefined;
    deviceName: string;
    displayName: string;
  };
  timerId: NodeJS.Timeout | null;
  lastBeat: number;

  constructor(socket: ws.WebSocket, request: http.IncomingMessage) {
    this.socket = socket;
    this.setPeerId(request);
    this.setName(request);
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

  private setName(req: http.IncomingMessage) {
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

    const displayName = this.peerId.slice(0, 8);

    this.name = {
      model: ua.device.model,
      os: ua.os.name,
      browser: ua.browser.name,
      type: ua.device.type,
      deviceName,
      displayName,
    };
  }

  public getInfo() {
    return {
      id: this.peerId,
      name: this.name,
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
    peer.socket.on("message", (message) => this.onMessage(peer, message));
    peer.socket.on("error", console.error);
    this.keepAlive(peer);

    this.send(peer, {
      type: "display-name",
      message: {
        displayName: peer.name.displayName,
        deviceName: peer.name.deviceName,
      },
    });
  }

  private joinRoom(peer: Peer) {
    for (const otherPeerId in this.room) {
      const otherPeer = this.room[otherPeerId];
      // notify other peer that somebody joins
      this.send(otherPeer, {
        type: "peer-joined",
        peer: peer.getInfo(),
      });
    }

    // send present peer-list to current peer
    const otherPeers: unknown[] = [];
    for (const otherPeerId in this.room) {
      otherPeers.push(this.room[otherPeerId].getInfo());
    }
    this.send(peer, {
      type: "peers",
      peers: otherPeers,
    });

    // join room
    this.room[peer.peerId] = peer;
  }

  private onMessage(sender: Peer, message: ws.RawData) {
    let msg = {};
    try {
      msg = JSON.parse(message as any);
    } catch (e) {
      return;
    }

    switch (msg["type"]) {
      case "disconnect":
        this.leaveRoom(sender);
        break;
      case "pong":
        sender.lastBeat = Date.now();
        break;
    }

    // relay message to recipient
    if (msg["to"]) {
      const recipientId: string = msg["to"];
      const recipient = this.room[recipientId];
      delete msg["to"];
      msg["sender"] = sender.peerId;
      this.send(recipient, msg);
      return;
    }
  }

  private keepAlive(peer: Peer) {
    this.cancelKeepAlive(peer);
    const timeout_ms = 30000;
    if (!peer.lastBeat) {
      peer.lastBeat = Date.now();
    }
    if (Date.now() - peer.lastBeat > 2 * timeout_ms) {
      this.leaveRoom(peer);
      return;
    }

    this.send(peer, { type: "ping" });

    peer.timerId = setTimeout(() => this.keepAlive(peer), timeout_ms);
  }

  private leaveRoom(peer: Peer) {
    if (!this.room[peer.peerId]) return;
    this.cancelKeepAlive(this.room[peer.peerId]);

    delete this.room[peer.peerId];

    peer.socket.terminate();

    for (const otherPeerId in this.room) {
      const otherPeer = this.room[otherPeerId];
      this.send(otherPeer, {
        type: "peer-left",
        peerId: peer.peerId,
      });
    }
  }

  private send(peer: Peer, message: Object) {
    // if (!peer) return;  // TODO
    if (peer.socket.readyState !== peer.socket.OPEN) return; // TODO
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
    // if (peer)  // TODO
    if (peer.timerId) {
      clearTimeout(peer.timerId);
    }
  }
}

async function createServer(port = 3000) {
  const productionRootPath = "dist";
  const isProductionMode = env.NODE_ENV === "production";

  const app = express();

  if (!isProductionMode) {
    console.log("> Development Mode");
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
