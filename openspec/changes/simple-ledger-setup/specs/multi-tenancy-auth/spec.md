## ADDED Requirements

### Requirement: Organization Scoping
The system MUST isolate all financial data (accounts, journals, reports) to the user's active Organization.

#### Scenario: Fetching chart of accounts
- **WHEN** User A in Organization X attempts to fetch the Chart of Accounts
- **THEN** the system only returns accounts belonging to Organization X

#### Scenario: Cross-tenant access attempt
- **WHEN** User A in Organization X attempts to fetch journal entries belonging to Organization Y
- **THEN** the system returns an access denied or 404 error

### Requirement: Auth0 Authentication
The system MUST require users to be authenticated via Auth0 before accessing any protected routes or data.

#### Scenario: Unauthenticated access
- **WHEN** an unauthenticated visitor tries to access the dashboard
- **THEN** they are redirected to the Auth0 login page
