# HFK Studio setup

HFK Studio is now a web admin at **/admin/**. The public site remains Eleventy/static. GitHub is the source of truth.

## Netlify environment variables

Create these two site environment variables in Netlify:

- `HFK_GITHUB_TOKEN`: a fine-grained GitHub personal access token restricted to `DonPonti/h4kv8engine`, with **Contents: Read and write**.
- `HFK_ADMIN_PASSWORD`: a strong private password for HFK Studio.

Do not put either value in this repository.

## Open the admin

After the Netlify deploy finishes, open:

`https://huntingforkicks.com/admin/`

Enter the HFK Studio admin password.

## What the Studio manages

- Dashboard
- 100+ celebrities
- Fashion looks / Instagram sightings
- Shoe catalog
- Brands
- Affiliate offers by market
- Blog posts
- Search
- Backup download
- GitHub-backed publishing

Every save updates the relevant GitHub file and creates a normal Git commit. The GitHub token stays inside the Netlify Function and is never sent to the browser.

## Local development

The old localhost admin has been retired. The production architecture is:

Browser → Netlify Function → GitHub → Netlify build → public HFK site.

For local function testing, use Netlify Dev with the two environment variables configured locally.
