import { QueryCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { db, TABLE_NAME } from "../dynamodb";

export async function clearOrganizationData(orgId: string) {
  const accountPk = `ORG#${orgId}#ACCOUNT`;
  const journalPk = `ORG#${orgId}#JOURNAL`;

  const pks = [accountPk, journalPk];

  for (const pk of pks) {
    let lastEvaluatedKey: Record<string, any> | undefined = undefined;

    do {
      const queryResult: any = await db.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: "PK = :pk",
          ExpressionAttributeValues: {
            ":pk": pk,
          },
          ExclusiveStartKey: lastEvaluatedKey,
          ProjectionExpression: "PK, SK", // Only need keys for deletion
        })
      );

      const items = (queryResult.Items as { PK: string; SK: string }[]) || [];
      if (items.length > 0) {
        // Batch delete items in chunks of 25
        for (let i = 0; i < items.length; i += 25) {
          const chunk = items.slice(i, i + 25);
          await db.send(
            new BatchWriteCommand({
              RequestItems: {
                [TABLE_NAME]: chunk.map((item) => ({
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
}
