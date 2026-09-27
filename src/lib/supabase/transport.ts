import WebSocket from "ws";

// supabase-js constructs a realtime client eagerly and needs a WebSocket implementation.
// Node 22+ has one built in; on Node 20 we hand it `ws`. Realtime itself is unused server-side.
export const realtimeOptions = {
  realtime: {
    transport: (globalThis.WebSocket ?? WebSocket) as unknown as typeof globalThis.WebSocket,
  },
};
