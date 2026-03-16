## Why

We need a foundational structure for the Simple Ledger App to allow users (and AI agents via MCP) to record and track financial transactions. By establishing the core double-entry bookkeeping system, Chart of Accounts, and organization-scoped multi-tenancy, we enable precise financial reporting (Trial Balance, Balance Sheet, Income Statement) and secure data management.

## What Changes

- **Next.js 16 Setup**: Initialize the core full-stack application with shadcn for UI components.
- **Auth0 Integration**: Implement authentication and organization-based multi-tenancy.
- **DynamoDB Schema**: Design and provision the database schema for Organizations, Users, Accounts, and Journal Entries.
- **Chart of Accounts**: Implement hardcoded categories (asset, liability, equity, income, expense) and the ability for users to create custom accounts under these.
- **Journal System**: Build the recording interface and backend logic to strictly enforce double-entry bookkeeping (debits = credits) and handle currency conversions (stored in paisa/cents, displayed in taka/dollar).
- **Reporting Engine**: Create filterable views for Trial Balance, Balance Sheet, and Income Statement based on date ranges.
- **MCP Tooling**: Expose core ledger operations to AI/LLMs via MCP tool integrations.

## Capabilities

### New Capabilities
- `core-ledger`: The fundamental double-entry bookkeeping engine, including journal entries and Chart of Accounts management.
- `multi-tenancy-auth`: Organization-scoped data access and user authentication using Auth0.
- `financial-reporting`: Date-filterable financial reports (Trial Balance, Balance Sheet, Income Statement) and charts.
- `mcp-integrations`: AI/LLM interfaces for drafting entries, reading reports, and natural language queries.

### Modified Capabilities

## Impact

- **Database**: New DynamoDB tables/indexes for multi-tenant financial data.
- **Frontend**: New Next.js routes for journals, reports, and settings (shadcn UI).
- **Backend API**: Serverless Next.js API routes with strict double-entry validation logic.
- **Security**: Auth0 RBAC and Organization scoping enforced at the API layer.
- **Extensibility**: MCP server implementation to safely expose ledger operations to LLMs.
