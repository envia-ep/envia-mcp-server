## Implementation

- Every function must include the corresponding JSDoc
- When updating functions, update documentation if needed.
- New code must comply with CUPID principles
- Unit testing must be included for new or updated code

## Code style
- Use single quotes for strings
- 4 spaces indentation (no tabs)
- Trailing commas (ES5)
- Print width: 130 characters
- Semicolons required
- Arrow function parentheses: always
- Promise handling required (promise plugin)
- Security best practices enforced
- Import validation
- No unused variables (warn level)

## naming
- Files use kebab-case
- Classes use PascalCase
- Functions/variables use camelCase
- All code, comments, and documentation must be in English

## testing

### framework
- Framework: Vitest 3.x
- Coverage: Focus on critical business logic and database operations
        
### best_practices:
- "AAA Pattern: Separate each test into Arrange (setup data/mocks), Act (execute), Assert (verify). Keep sections visually distinct."
- "Test Behavior, Not Implementation: Assert on public outputs and side effects. Never assert on private methods or internals — tests must survive refactors."
- "Full Isolation (Mocking): Every test must be independent. Mock all external dependencies (DB, APIs, filesystem) to ensure speed and determinism."
- "One Logical Assertion per Test: Each test verifies a single concept or execution path. Avoid unrelated assertions in the same test."
- "Descriptive Naming: Use the pattern should [expected_result] when [state/condition]. The name must read as a sentence."
- "No Control Flow in Tests: Tests must not contain if, for, while, or try/catch. If you need complex logic, the test or test utility is poorly designed."
- "Determinism: Eliminate randomness. Use fixed dates, seed randoms, and always mock Date.now() or similar time-dependent calls."
- "Factories over Fixtures: Prefer minimal, inline data creation (factories) over large static JSON files (fixtures) that obscure context."
- "Edge Case Coverage: Go beyond the happy path. Write explicit tests for nulls, empty arrays, invalid inputs, and numeric boundaries."
- "DAMP over DRY: Favor Descriptive And Meaningful Phrases — repeat code for clarity rather than over-abstracting and losing readability."