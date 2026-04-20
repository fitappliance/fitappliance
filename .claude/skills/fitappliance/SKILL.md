```markdown
# fitappliance Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches you the core development patterns and conventions used in the `fitappliance` JavaScript codebase. You'll learn how to structure files, write imports/exports, follow commit message guidelines, and understand the project's testing approach. While no specific framework is used, the repository emphasizes clarity and consistency in its code style and workflow.

## Coding Conventions

### File Naming
- Use **kebab-case** for all file names.
  - Example:  
    ```
    user-profile.js
    data-fetcher.test.js
    ```

### Import Style
- Use **absolute imports** rather than relative paths.
  - Example:
    ```js
    import { fetchData } from 'utils/data-fetcher';
    ```

### Export Style
- Use **named exports** in modules.
  - Example:
    ```js
    // In utils/data-fetcher.js
    export function fetchData() { ... }
    ```

### Commit Messages
- Follow **Conventional Commits** with the `feat` prefix for new features.
- Keep commit messages concise (average ~51 characters).
  - Example:
    ```
    feat: add user authentication middleware
    ```

## Workflows

### Feature Development
**Trigger:** When adding a new feature  
**Command:** `/feature-development`

1. Create a new JavaScript file using kebab-case.
2. Implement the feature using named exports.
3. Use absolute imports for dependencies.
4. Write corresponding test files as `*.test.js`.
5. Commit changes with a message starting with `feat:`.

### Testing
**Trigger:** When verifying code correctness  
**Command:** `/run-tests`

1. Identify or create test files matching `*.test.js`.
2. Run tests using the project's preferred method (framework not specified).
3. Ensure all tests pass before committing.

### Code Review
**Trigger:** Before merging code  
**Command:** `/code-review`

1. Check that all file names use kebab-case.
2. Verify imports are absolute and exports are named.
3. Ensure commit messages follow the conventional format.
4. Confirm tests exist and pass for new/changed code.

## Testing Patterns

- Test files follow the pattern `*.test.js`.
- The testing framework is not specified; adapt to your team's tool.
- Example test file:
  ```js
  // user-profile.test.js
  import { getUserProfile } from 'services/user-profile';

  describe('getUserProfile', () => {
    it('returns user data for valid ID', () => {
      // test implementation
    });
  });
  ```

## Commands
| Command              | Purpose                                    |
|----------------------|--------------------------------------------|
| /feature-development | Start a new feature using repo conventions |
| /run-tests           | Run all test files                         |
| /code-review         | Review code for style and test compliance  |
```