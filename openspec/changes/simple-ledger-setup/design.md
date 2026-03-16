## Context

The Simple Ledger App is being built to provide a robust double-entry bookkeeping system with multi-tenancy support. The goal is to allow individuals or small organizations to track their financial transactions accurately. The system needs to be reliable, enforce strict accounting rules at the database level, and expose its core functionality via an MCP integration for AI agents.

## Goals / Non-Goals

**Goals:**
- Provide a strict double-entry ledger database schema in DynamoDB.
- Support organization-level multi-tenancy (multiple users can belong to an Organization and view the same ledger).
- Store precise monetary values (paisa/cents) to avoid floating-point errors.
- Build a serverless architecture using Next.js 16 APIs and shadcn UI.
- Secure the application using Auth0 RBAC.
- Provide MCP server capabilities for LLMs.

**Non-Goals:**
- Complex inventory tracking or invoicing systems.
- Multi-currency support (for MVP, we assume a single base currency per organization, treated as cents/paisa).
- Real-time collaborative editing using WebSockets.

## Decisions

- **Framework**: Next.js 16 App Router. *Rationale*: Provides a unified full-stack developer experience, Server Components for performance, and easy deployment to Docker/Render.
- **Database**: DynamoDB. *Rationale*: High scalability, predictable performance. We will use a Single-Table Design pattern to store Organizations, Users, Accounts, and Journal Entries/Lines efficiently.
- **Amounts Storage**: Integer (cents/paisa). *Rationale*: Standard practice in fintech to avoid floating-point precision errors during aggregations.
- **Authentication**: Auth0. *Rationale*: Offloads identity management and securely handles tokens for Next.js and the MCP server.

## Risks / Trade-offs

- [Risk] DynamoDB Single-Table Design complexity -> Mitigation: Carefully design the access patterns (GSI for querying entries by date, account, etc.) in the tasks phase before implementation.
- [Risk] MCP permissions boundary -> Mitigation: Ensure the MCP server strictly inherits the active user's Organization context preventing cross-tenant data access.
