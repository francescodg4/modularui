# AI Reference Files

These bundled files provide context to the Appsmith AI Assistant, helping it give more accurate, Appsmith-specific responses. They are loaded from the classpath at startup and cached in memory.

## Files

| File | Purpose | Used When |
|------|---------|-----------|
| `javascript-reference.md` | JS patterns, bindings, async, global APIs | JavaScript editor |
| `sql-reference.md` | SQL patterns, parameterization, DB tips | SQL query editors |
| `graphql-reference.md` | GraphQL queries, mutations, pagination | GraphQL editor |
| `common-issues.md` | Troubleshooting gotchas | All editors (appended), except the Block modes |
| `block_generate-reference.md` | Block widget contract and JSON output format | Generating a Block widget from its description |
| `block_agent-reference.md` | Block widget contract and change format | The agent chat of a Block widget |

## How It Works

`AIReferenceServiceCE` loads these files with a two-tier fallback:

1. **Bundled classpath resource** — the `.md` files in this directory, shipped inside the JAR
2. **Inline fallback** — a short hardcoded prompt per mode, used only if the bundled file is missing

The content is cached in memory at startup (`@PostConstruct`) so no file I/O occurs on the request path.

## Adding a New Mode

1. Create `{mode}-reference.md` in this directory
2. Optionally add an inline fallback in `AIReferenceServiceCEImpl.INLINE_FALLBACKS`
3. Add the mode to `AIReferenceServiceCEImpl.SUPPORTED_MODES`
4. The mode string must match what the client sends in `AIEditorContextDTO.mode`

The Block modes reply with JSON that the client parses, so `AIAssistantServiceCEImpl` builds their prompts separately: it leaves out `common-issues.md` and the markdown formatting rules.

## Editing Existing References

Edit the `.md` files directly and rebuild. Changes take effect on next deploy.
