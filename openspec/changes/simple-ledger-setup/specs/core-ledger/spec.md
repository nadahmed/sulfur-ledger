## ADDED Requirements

### Requirement: Double-Entry Validation
The system MUST ensure that every journal entry maintains the accounting equation (Total Debits = Total Credits).

#### Scenario: Valid journal entry
- **WHEN** a user submits a journal entry with debits and credits that sum to zero
- **THEN** the system saves the entry successfully

#### Scenario: Invalid journal entry
- **WHEN** a user submits a journal entry with debits and credits that do not sum to zero
- **THEN** the system rejects the entry with a validation error

### Requirement: Chart of Accounts Categories
The system MUST restrict users to categorizing their accounts under the five hardcoded categories: asset, liability, equity, income, or expense.

#### Scenario: Creating a valid account
- **WHEN** a user creates an account named "Checking" under the "asset" category
- **THEN** the system saves the account successfully

#### Scenario: Creating an invalid account category
- **WHEN** a user attempts to create an account with a category "magic"
- **THEN** the system rejects the creation due to an invalid category
