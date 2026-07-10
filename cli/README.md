# placeholder-name

CLI for the PLACEHOLDER_NAME hosted media-generation API. Built for agents:
progress goes to stderr, output URLs go to stdout, exit codes are meaningful.

```sh
npm i -g placeholder-name        # or: npx placeholder-name <command>

placeholder-name login --key <your-api-key>
placeholder-name tools
placeholder-name run make_video --prompt "A barista holds a latte and says: try our new oat flat white" --quality pro --aspect-ratio 9:16 --captions
placeholder-name run make_image --prompt "studio shot of a ceramic mug" --count 2
placeholder-name run caption_video --video-url https://…/video.mp4 --style tiktok
placeholder-name list --search "flat white"
placeholder-name balance
placeholder-name history
```

- Credentials live at `~/.placeholder-name/credentials.json` (chmod 600).
- API base: `--api-url` flag > `PLACEHOLDER_NAME_API_URL` env > stored value >
  `https://localhost:3000`; all requests hit `<base>/api/v1/…`.
- Reference images (`--ref`, repeatable) require `--owns-references`: you attest
  you own, or have the rights to use, the likeness of every person appearing in
  the referenced images.
- Everything deterministically checkable is validated locally against the
  schemas served by `GET /v1/tools` (cached 1h) **before** any run is
  submitted: consent, prompt length caps, enum values, ranges, and
  `nano-banana-2` (edit-only) without references.

Develop: `npm run build` (emits `dist/`), `npx vitest run`, `npx tsc --noEmit`.
