import { prisma } from "../prisma";
import { uuidv7 } from "uuidv7";

export interface ChatMessage {
  orgId: string;
  id: string; // msgId
  role: "user" | "assistant";
  content: string;
  userId?: string;
  userName?: string;
  userInitials?: string;
  timestamp: string;
  toolCalls?: any;
  toolResults?: any;
}

export async function saveChatMessage(message: Omit<ChatMessage, "id"> & { id?: string }) {
  const id = message.id || uuidv7();
  await prisma.chatMessage.create({
    data: {
      id,
      orgId: message.orgId,
      userId: message.userId,
      userName: message.userName,
      userInitials: message.userInitials,
      role: message.role,
      content: message.content,
      timestamp: new Date(message.timestamp),
      toolCalls: message.toolCalls,
      toolResults: message.toolResults,
    },
  });
  return { ...message, id };
}

export async function getChatHistory(orgId: string, limit = 50): Promise<ChatMessage[]> {
  const messages = await prisma.chatMessage.findMany({
    where: { orgId },
    orderBy: { timestamp: "desc" },
    take: limit,
  });
  
  // Return in chronological order
  return messages.reverse().map(m => ({
    orgId: m.orgId,
    id: m.id,
    role: m.role as "user" | "assistant",
    content: m.content,
    userId: m.userId || undefined,
    userName: m.userName || undefined,
    userInitials: m.userInitials || undefined,
    timestamp: m.timestamp.toISOString(),
    toolCalls: m.toolCalls,
    toolResults: m.toolResults,
  }));
}

export async function deleteChatMessage(orgId: string, msgId: string, _timestamp: string) {
  await prisma.chatMessage.delete({
    where: { id: msgId, orgId },
  });
}

export async function clearChatHistory(orgId: string) {
  await prisma.chatMessage.deleteMany({
    where: { orgId },
  });
}
