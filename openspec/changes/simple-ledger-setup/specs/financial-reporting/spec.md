## ADDED Requirements

### Requirement: Date-filterable Reporting
The system MUST provide Trial Balance, Balance Sheet, and Income Statement reports that can be filtered by a specific start and end date.

#### Scenario: Generating Income Statement
- **WHEN** a user requests an Income Statement for the period of Jan 1 to Jan 31
- **THEN** the system calculates revenue and expenses only from journal entries posted within that date range

#### Scenario: Trial Balance Validation
- **WHEN** a user views a Trial Balance for any period
- **THEN** the total debits MUST equal total credits across all accounts in the report
