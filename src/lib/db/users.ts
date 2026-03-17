import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { db, TABLE_NAME } from "../dynamodb";
import { OrgUser } from "./organizations";

export async function getOrgUser(orgId: string, userId: string): Promise<OrgUser | null> {
  const result = await db.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `ORG#${orgId}`,
        SK: `USER#${userId}`,
      },
    })
  );
  return (result.Item as OrgUser) || null;
}
