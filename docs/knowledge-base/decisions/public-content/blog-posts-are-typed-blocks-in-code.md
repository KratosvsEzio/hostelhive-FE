# Blog posts are typed blocks shipped in code, never HTML strings

**Status:** Accepted
**Area:** [public-content](../../area/public-content.md)

## Context

The blog exists to be found in search, so it must render fully on the server. There is no CMS. Hostel descriptions elsewhere in the app are stored as HTML and rendered with sanitized `[innerHTML]` + `.hh-rich`; the blog is written by the team, not by users.

## Decision

- The archive is a TypeScript constant (`BLOG_POSTS` in `blog-posts.ts`) shipped with the bundle; `/blog` and `/blog/:slug` are lazy and server-rendered.
- A body is a list of `BlogBlock`s; prose is `BlogText` = a string or an array of `BlogSpan` (`string | { b } | { to, text }`). `BlogRichText` renders spans through `@switch`; nothing in the blog uses `[innerHTML]`.
- Photographs are not in the prose: `blog-figures.ts` attaches each to the heading it opens (`at`), and `withFigures()` weaves them in; an unmatched `at` lands at the end, visibly.
- Prices are stated as ranges, not exact rupee figures.

## Alternatives rejected

- **HTML strings in the post body.** Would have to be trusted into `[innerHTML]`, leaving every author "one paste away from putting markup on a public page nobody reviewed"; typography would also be scattered through prose (`blog-post.model.ts`, `blog-rich-text.ts`).
- **A pipe that returns HTML.** It would have to be sanitised or trusted — "decisions someone can get wrong later" (`blog-rich-text.ts`).
- **Fetch posts from a CMS/API.** None exists; shipped content renders identically on the server (`blog-posts.ts`).
- **Image blocks threaded through the prose.** Every prose edit could strand a picture (`blog-figures.ts`).

## Consequences

- Publishing a post is a code change and a deploy; the sitemap picks it up from `BLOG_POSTS`.
- Links inside prose can only be the closed `{ to, text }` span; anything richer needs a new span type, deliberately.
- Article text is English; only the blog chrome is translated (`blog.ts`).

## Evidence

- `apps/web/src/app/features/public/blog/blog-post.model.ts`, `apps/web/src/app/features/public/blog/blog-posts.ts`, `apps/web/src/app/features/public/blog/blog-figures.ts`, `apps/web/src/app/features/public/blog/blog-article/blog-rich-text.ts`, `apps/web/src/app/features/public/blog/blog.routes.ts`
- Commit `e60bcf1` feat(i18n): translate the chrome, and give the blog its photographs (carries the blog feature); PR #34
