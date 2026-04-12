import { PutCommand, QueryCommand, DeleteCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { db, TABLE_NAME } from "../dynamodb";
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
  await db.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `ORG#${message.orgId}#CHAT`,
        SK: `MSG#${message.timestamp}#${id}`,
        Type: "ChatMessage",
        id,
        ...message,
      },
    })
  );
  return { ...message, id };
}

export async function getChatHistory(orgId: string, limit = 50): Promise<ChatMessage[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": `ORG#${orgId}#CHAT`,
        ":skPrefix": "MSG#",
      },
      ScanIndexForward: false, // Latest first
      Limit: limit,
    })
  );
  
  const messages = (result.Items as ChatMessage[]) || [];
  // Return in chronological order
  return messages.reverse();
}

export async function deleteChatMessage(orgId: string, msgId: string, timestamp: string) {
  await db.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `ORG#${orgId}#CHAT`,
        SK: `MSG#${timestamp}#${msgId}`,
      },
    })
  );
}

export async function clearChatHistory(orgId: string) {
  let lastEvaluatedKey: Record<string, any> | undefined = undefined;

  do {
    const queryResult: any = await db.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
        ExpressionAttributeValues: {
          ":pk": `ORG#${orgId}#CHAT`,
          ":skPrefix": "MSG#",
        },
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );

    const items = queryResult.Items || [];
    if (items.length > 0) {
      for (let i = 0; i < items.length; i += 25) {
        const chunk = items.slice(i, i + 25);
        await db.send(
          new BatchWriteCommand({
            RequestItems: {
              [TABLE_NAME]: chunk.map((item: any) => ({
                DeleteRequest: {
                  Key: {
                    PK: item.PK,
                    SK: item.SK,
                  },
                },
              })),
            },
          })
        );
      }
    }
    lastEvaluatedKey = queryResult.LastEvaluatedKey;
  } while (lastEvaluatedKey);
}
