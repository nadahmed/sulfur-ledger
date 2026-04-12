import PusherServer from "pusher";
import PusherClient from "pusher-js";

// Server-side Pusher client (SDK: pusher)
export const pusherServer = new PusherServer({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.NEXT_PUBLIC_PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
  useTLS: process.env.NEXT_PUBLIC_PUSHER_TLS === "true",
  ...(process.env.NEXT_PUBLIC_PUSHER_HOST ? {
    host: process.env.NEXT_PUBLIC_PUSHER_HOST,
    port: process.env.NEXT_PUBLIC_PUSHER_PORT,
  } : {}),
});

// Client-side helper (SDK: pusher-js)
let pusherClient: PusherClient | null = null;

export const getPusherClient = () => {
  if (pusherClient) return pusherClient;

  pusherClient = new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    forceTLS: process.env.NEXT_PUBLIC_PUSHER_TLS === "true",
    enabledTransports: ["ws", "wss"],
    ...(process.env.NEXT_PUBLIC_PUSHER_HOST ? {
      wsHost: process.env.NEXT_PUBLIC_PUSHER_HOST,
      wsPort: parseInt(process.env.NEXT_PUBLIC_PUSHER_PORT || "6001"),
    } : {}),
  });

  return pusherClient;
};

// Helper to reset the client (useful for organization changes or logout)
export const resetPusherClient = () => {
  if (pusherClient) {
    pusherClient.disconnect();
    pusherClient = null;
  }
};
