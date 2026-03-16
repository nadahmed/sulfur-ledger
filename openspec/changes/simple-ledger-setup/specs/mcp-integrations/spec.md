## ADDED Requirements

### Requirement: MCP API Integration
The system MUST expose a Model Context Protocol (MCP) server that safely allows LLMs/AI agents to perform read and write operations on behalf of the user.

#### Scenario: AI retrieving account balance
- **WHEN** the user prompts an AI "What is my checking account balance?"
- **THEN** the AI uses the MCP tool to query the balance, executing the request within the user's active Organization context

#### Scenario: AI drafting an entry
- **WHEN** the user prompts an AI "Record a $50 expense for internet bill"
- **THEN** the AI uses the MCP tool to draft a double-entry transaction, balancing the expense and asset accounts accurately
