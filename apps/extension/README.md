# LLM Wiki Capture extension

This is a desktop Chromium extension built with WXT. It is intentionally an **explicit-capture** tool: it has no broad browsing permission and sends only the selected page text, current page title/URL, and visible links from the main page area.

## Local development

1. Start the LLM Wiki API on `http://localhost:3001` and sign in to the dashboard.
2. Open **Research Inbox** and generate a pairing code.
3. Run `bun run --filter @llm-wiki/extension dev`.
4. Load the development build in a desktop browser, open the extension, and paste the code.

For a production unpacked build, run `bun run --filter @llm-wiki/extension build`, then load `apps/extension/.output/chrome-mv3/` in Chromium's extension developer mode.

Mobile browser extensions are intentionally out of scope for this first slice. Android capture should be added later through the system share sheet/PWA path, using the same local capture API.
