# HFK Studio

Local-only publishing admin for Hunting For Kicks.

Run from the repository root:

```bash
npm run admin
```

Open http://127.0.0.1:8787/admin/

The admin writes structured content to `src/_data/hfk.json` and blog drafts to `src/blog/`. It is intentionally bound to localhost and has no public authentication surface.

Instagram media is embedded from the supplied public post URL; images are not downloaded or rehosted.
