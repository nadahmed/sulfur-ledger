## 1. Project Initialization & Auth Setup

- [ ] 1.1 Scaffold Next.js 16 app with shadcn UI
- [ ] 1.2 Setup Auth0 provider and API route protection
- [ ] 1.3 Implement Organization-level context provider and middleware

## 2. Database & Data Models

- [ ] 2.1 Provision DynamoDB table and configure single-table design indexes
- [ ] 2.2 Create database utility functions for Organization and User CRUD
- [ ] 2.3 Create database utility functions for Chart of Accounts (Asset, Liability, Equity, Income, Expense)
- [ ] 2.4 Create database utility functions for Journal Entries and Line Items

## 3. Core Ledger Logic

- [ ] 3.1 Implement double-entry validation logic (Total Debits = Total Credits)
- [ ] 3.2 Build API routes for creating and fetching accounts
- [ ] 3.3 Build API routes for submitting and fetching journal entries (with amount conversion helpers)

## 4. UI Implementation

- [ ] 4.1 Build Chart of Accounts list and creation forms
- [ ] 4.2 Build Journal Entry recording form (multi-line debits/credits)
- [ ] 4.3 Build Paginated Journal Entry history view

## 5. Financial Reporting

- [ ] 5.1 Implement Trial Balance aggregation service and UI
- [ ] 5.2 Implement Balance Sheet aggregation service and UI
- [ ] 5.3 Implement Income Statement aggregation service and UI

## 6. MCP Integration

- [ ] 6.1 Initialize the MCP server infrastructure
- [ ] 6.2 Expose read-only tools for querying balances and reports
- [ ] 6.3 Expose write tools for drafting journal entries
