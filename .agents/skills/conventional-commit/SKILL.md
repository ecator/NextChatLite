---
name: conventional-commit
description: 'Generating conventional commit messages'
---

# Conventional Commit Generator

**Follow these steps:**

1. Run `git --no-pager diff --staged --no-color` to inspect **only** the staged changes. **DO NOT** inspect or include changes that have not been added to the staging area (unstaged changes should be ignored).
2. **DO NOT run any tests**. Testing is **NOT** required for generating the commit message.
3. Construct your commit message using the following structure.

**DO NOT RUN `git commit`**, you only print the commit message in a markdown code block unless the user explicitly requests you to run `git commit`.

## Commit Message Structure

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

The commit contains the following structural elements, to communicate intent to the consumers of your library:

- `fix`: a commit of the type `fix` patches a bug in your codebase (this correlates with PATCH in Semantic Versioning).
- `feat`: a commit of the type `feat` introduces a new feature to the codebase (this correlates with MINOR in Semantic Versioning).
- `BREAKING CHANGE`: a commit that has a footer `BREAKING CHANGE`, or appends a `!` after the type/scope, introduces a breaking API change (correlating with MAJOR in Semantic Versioning). A BREAKING CHANGE can be part of commits of any type.
- `types` other than `fix` and `feat`: are allowed, for example:
  - `build`: changes that affect the build system or external dependencies
  - `chore`: changes to the build process or auxiliary tools and libraries such as documentation generation form
  - `ci`: changes to CI configuration files and scripts
  - `docs`: changes to documentation only
  - `style`: changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)
  - `refactor`: a code change that neither fixes a bug nor adds a feature
  - `perf`: a code change that improves performance
  - `test:`: adding missing tests or correcting existing tests
- `footers` other than `BREAKING CHANGE`: `<description>` may be provided and follow a convention similar to git trailer format.

A scope may be provided to a commit's type, to provide additional contextual information and is contained within parenthesis, e.g., `feat(parser): add ability to parse arrays`.


### Examples

Commit message with description and breaking change footer
```
feat: allow provided config object to extend other configs

BREAKING CHANGE: `extends` key in config file is now used for extending other config files
```

Commit message with ! to draw attention to breaking change
```
feat!: send an email to the customer when a product is shipped
```

Commit message with scope and ! to draw attention to breaking change
```
feat(api)!: send an email to the customer when a product is shipped
```

Commit message with both ! and BREAKING CHANGE footer
```
feat!: drop support for Node 6

BREAKING CHANGE: use JavaScript features not available in Node 6.
```

Commit message with no body
```
docs: correct spelling of CHANGELOG
```

Commit message with scope
```
feat(lang): add Polish language
```

Commit message with multi-paragraph body and multiple footers
```
fix: prevent racing of requests

Introduce a request id and a reference to latest request. Dismiss
incoming responses other than from latest request.

Remove timeouts which were used to mitigate the racing issue but are
obsolete now.

Reviewed-by: Z
Refs: #123
```

