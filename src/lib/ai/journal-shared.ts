import * as LedgerService from "../ledger";
import * as tagsDb from "../db/tags";

export interface SimplexJournalRecordingOptions {
  orgId: string;
  userId: string;
  userName: string;
  date: string;
  description: string;
  amount: number;
  fromAccountId: string;
  toAccountId: string;
  tags?: string[];
  prefix?: string;
  ipAddress?: string;
  userAgent?: string;
  toolCallId?: string;
  providedId?: string;
}

/**
 * Single source of truth for recording a "simplex" (From/To/Amount) journal
 * entry from AI/MCP callers.
 *
 * In addition to the core business invariants enforced by LedgerService, this
 * function also validates tags: AI tools must only use pre-existing formal
 * tags (not free text), so we enforce that here before delegating to the service.
 */
export async function recordSimplexJournalEntry({
  orgId,
  userId,
  userName,
  date,
  description,
  amount,
  fromAccountId,
  toAccountId,
  tags,
  prefix = "[AI]",
  ipAddress,
  userAgent,
  toolCallId,
  providedId,
}: SimplexJournalRecordingOptions) {
  // Validate tags against the formal tag list (AI-only requirement)
  if (tags && tags.length > 0) {
    const formalTags = await tagsDb.getTags(orgId);
    const validTagIdentifiers = new Set<string>();
    formalTags.forEach((t) => {
      validTagIdentifiers.add(t.id);
      validTagIdentifiers.add(t.name.toLowerCase());
    });

    for (const tag of tags) {
      if (!validTagIdentifiers.has(tag) && !validTagIdentifiers.has(tag.toLowerCase())) {
        throw new Error(`Tag '${tag}' is not a formal tag. Please create it first or use an existing one.`);
      }
    }
  }

  const ctx: LedgerService.UserContext = { userId, userName, ipAddress, userAgent };

  return LedgerService.journals.record(orgId, {
    date,
    description: prefix ? `${prefix} ${description}` : description,
    amount,
    fromAccountId,
    toAccountId,
    tags,
    id: providedId,
  }, ctx);
}
