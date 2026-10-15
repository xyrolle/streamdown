---
"streamdown": patch
---

fix(animate): decide which words are already on screen by comparing the text, not only its length. Replaced text (a regenerated answer, a message streamed again) now fades in instead of appearing at once, words no longer pop in where markdown syntax turns into formatting (`**bold`, `[text](`, lists, math), and shown words no longer fade again when the parser reshapes a table or list.
