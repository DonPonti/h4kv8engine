# HFK Studio

HFK Studio is the web admin at `/admin/`. See `HFK-ADMIN-SETUP.md` for setup.

Architecture: Browser -> Netlify Function (`netlify/functions/hfk.js`) -> GitHub -> Netlify build -> public site.

Files that make up the admin:

- `src/admin/index.html`: page shell (loads the two scripts below)
- `src/admin/app-secure.js`: the studio UI
- `src/admin/fixes.js`: look-photo upload and Instagram URL fixes
- `src/admin/admin.css`: styles
- `netlify/functions/hfk.js`: authenticated GitHub proxy

The function only reads and writes `src/_data/hfk.json`, `src/blog/<slug>.md` and `src/_img/looks/<name>.(jpg|png|webp|gif)`.

Check data integrity before publishing: `npm run hfk:check`.
