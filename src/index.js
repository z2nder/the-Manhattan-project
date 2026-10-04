import { DurableObject } from "cloudflare:workers";

// One SyncRoom per room name. It remembers the latest slide and
// forwards every update to all other connected devices.
export class SyncRoom extends DurableObject {
  async fetch(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    const last = await this.ctx.storage.get("last");
    if (last) server.send(JSON.stringify(last));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    let d;
    try { d = JSON.parse(message); } catch { return; }
    if (typeof d.i !== "number" || typeof d.v !== "number") return;
    const last = await this.ctx.storage.get("last");
    if (!last || d.v >= last.v) await this.ctx.storage.put("last", { i: d.i, v: d.v });
    const out = JSON.stringify({ i: d.i, v: d.v });
    for (const s of this.ctx.getWebSockets()) if (s !== ws) s.send(out);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/sync") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected a WebSocket", { status: 426 });
      }
      const room = (url.searchParams.get("room") || "talk").slice(0, 64);
      return env.ROOM.get(env.ROOM.idFromName(room)).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
