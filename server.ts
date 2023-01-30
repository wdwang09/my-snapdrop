import * as express from "express";
import { createServer as createViteServer } from "vite";

async function createServer(port = 3000) {
  const app = express();

  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });

  app.use(vite.middlewares);

  console.log(`> Server is ready on http://localhost:${port}`);
  app.listen(port);
}

createServer(3000);
