import PusherServer from "pusher";
import PusherClient from "pusher-js";

// Server-side Pusher client (SDK: pusher)
export const pusherServer = new PusherServer({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.NEXT_PUBLIC_PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
  useTLS: false, // Soketi local usually doesn't use TLS
  host: process.env.NEXT_PUBLIC_PUSHER_HOST || "127.0.0.1",
  port: process.env.NEXT_PUBLIC_PUSHER_PORT || "6001",
});

// Client-side helper (SDK: pusher-js)
// This is a function because we want to initialize it only when needed (on the client)
export const getPusherClient = () => {
  return new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    wsHost: process.env.NEXT_PUBLIC_PUSHER_HOST || "127.0.0.1",
    wsPort: parseInt(process.env.NEXT_PUBLIC_PUSHER_PORT || "6001"),
    forceTLS: false,
    enabledTransports: ["ws", "wss"],
  });
};
