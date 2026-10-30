import { useEffect, useState } from "react";
import { socket } from "./socket";

/** Connects and joins a campaign room; returns whether we're in. */
export function useCampaign(campaignId: string) {
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    const join = async () => {
      const res = await socket.emitWithAck("campaign:join", { campaignId });
      setJoined(res.ok);
    };
    const onDisconnect = () => setJoined(false);

    socket.on("connect", join);
    socket.on("disconnect", onDisconnect);
    if (socket.connected) void join();
    else socket.connect();

    return () => {
      socket.off("connect", join);
      socket.off("disconnect", onDisconnect);
    };
  }, [campaignId]);

  return joined;
}
