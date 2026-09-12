---
cards-deck: Flashcards V2 issue 231
tags:
  - flashcards-v2-issue-231
---

# Remote media (issue #231, item 3)

Before the fix, the three cards below that reference an `http(s)` URL were
**silently dropped** from the sync plan: `extractMedia` classified the URL as
media by its extension, `resolveMedia` failed to find it in the vault
(`not-found`), and `dropCardsWithUnresolvedMedia` removed the card, leaving
only a `logger.warn`.

Expected now: all five cards sync. `extractMedia` ignores remote targets, so
the Markdown renderer emits a plain `<img src="https://…">` that Anki loads
when online. Nothing is downloaded into the Anki media folder.

The local-image control card and the no-media control card must always sync.
If they don't, the problem is not remote media.

## Controls

What syncs with a vault-local image? ![[diagram.png]]::This card must always be created.

What syncs with no media at all?::This card must always be created.

## Remote markdown image

What does the plugin logo look like? ![](https://raw.githubusercontent.com/reuseman/flashcards-obsidian/main/logo.png)::The plugin logo.

## Remote markdown image with alt text

Logo with alt text ![logo](https://raw.githubusercontent.com/reuseman/flashcards-obsidian/main/logo.png)::Alt text must not change the outcome.

## Remote image inside a cloze

The {{c1::logo}} lives at ![](https://raw.githubusercontent.com/reuseman/flashcards-obsidian/main/logo.png) in the repo root.

## How to check

1. Run **Flashcards: Update Anki from current note**.
2. Count the created cards in Anki against the five cards above — all five.
3. Open one remote card in the Anki browser's HTML editor: the field must hold
   `<img src="https://raw.githubusercontent.com/…/logo.png">`, and the image
   must render in the reviewer while online.
4. The console must no longer log `card dropped: unresolved media`.
