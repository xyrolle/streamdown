---
"@streamdown/code": patch
"streamdown": patch
---

fix(code-block): in client renders after hydration, render a highlight result the code plugin already has in the same commit as its code, instead of committing the block unhighlighted first. Code plugins can implement the new optional `getCachedResult(options)`, a lookup that starts no work and doesn't change the plugin's state. Streamdown uses it to seed the block's highlight state while rendering, and a later result from `highlight()` still replaces that seed. `@streamdown/code` implements it without changing cache recency. The `highlight()` request is made from the same effect as before. Without a code plugin, new code also replaces the previous code in the same commit.
