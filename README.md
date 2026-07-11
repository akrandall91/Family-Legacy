# Family Legacy Platform — Rowe / Randall Family

A private family archive, tree, timeline, and story site for the Rowe / Randall family. Built as a static site so it can be hosted free on GitHub Pages.

## What's in this project

```
family-legacy-platform/
  index.html                    ← page markup only; loads the CSS/JS below
  assets/
    css/
      styles.css                 ← all site styling
    js/
      data-access.js             ← in-memory data store (D), Google Sheets sync/API, admin-scoped data
      utils.js                   ← small stateless helpers (formatting, lookups)
      render-home.js             ← Home page + Timeline
      render-tree.js             ← D3 interactive family tree
      render-people.js           ← People directory, Stories list, Branches, Search, Gallery
      render-profile.js          ← Person profile page + detail modals
      render-admin.js            ← Admin auth/session, structured record editor, Admin dashboard, exports
      forms.js                   ← public Contribute page forms
      app.js                     ← page routing/navigation, nav wiring, app init (loads LAST)
    images/                       ← local images, if you don't want to use Google Drive for everything
  data/
    family-legacy-data.js        ← YOUR family data lives here
  scripts/
    validate-data.js             ← run locally to check data/family-legacy-data.js for problems
  apps-script/
    Code.gs                      ← optional Google Sheets backend (see GOOGLE-SHEETS-SCHEMA.md)
  README.md                      ← this file
  DATA-ENTRY-GUIDE.md            ← how to add real people, events, stories, media
```

The app was originally a single 6,400+ line `index.html` with the CSS and JavaScript inline. It's since been split into the files above so each page/feature area is easier to find and edit — but the app is still a **no-build static site**: no bundler, no npm install, no compile step. `assets/js/*.js` are loaded as plain `<script>` tags in `index.html`, in a specific order (`data-access.js` first because it depends on `data/family-legacy-data.js`, `app.js` last because it triggers the initial render). If you add a new script file, add its `<script src="...">` tag in `index.html` in the right spot, keeping `app.js` last.

The **family data** lives in its own file: `data/family-legacy-data.js`. `index.html` loads it with:

```html
<script src="./data/family-legacy-data.js"></script>
```

This is the file you'll edit constantly. The app code never needs to change just because you added a person. Run `node scripts/validate-data.js` after editing it — see "Validating your data" below.

## Hosting on GitHub Pages

1. Create a new GitHub repository (private or public — see the privacy section below before choosing public).
2. Push this whole folder's contents to the repo root, so `index.html` sits at the top level.
3. In the repo, go to **Settings → Pages**.
4. Under "Build and deployment," set **Source** to "Deploy from a branch."
5. Pick the branch (usually `main`) and folder `/ (root)`.
6. Save. GitHub will give you a URL like `https://yourusername.github.io/family-legacy-platform/`.
7. Wait 1–2 minutes for the first deploy, then visit the URL.

Every time you push a change to `data/family-legacy-data.js` (or anything else), GitHub Pages automatically redeploys within a minute or two. No build step, no server, nothing to install.

### Using a custom domain (optional)

If you want something like `family.yourdomain.com` instead of the github.io URL, add a `CNAME` file at the repo root with just your domain in it, and point a DNS CNAME record at `yourusername.github.io`. GitHub's Pages docs cover the exact DNS records if you go this route.

## Validating your data

Before committing changes to `data/family-legacy-data.js`, run the local validator:

```
node scripts/validate-data.js
```

It requires nothing but Node (no npm install) and checks for:

- Duplicate person/branch/event/story/media ids
- Broken parent, child, and spouse references, and missing reciprocal links (e.g. a parent that doesn't list the child back)
- Branch references that point to a branch that doesn't exist
- Events, stories, and media that reference a missing person, branch, media, or location
- Missing required fields per record type
- Invalid `privacy` values
- Exact birthdates or other sensitive fields (address, phone, email, etc.) recorded on a *living* person — see the privacy warning below

It exits with a non-zero status if it finds errors (warnings alone don't fail the run), so you can wire it into a pre-commit hook or CI check later if you want.

## ⚠️ Privacy — read this before making the repo public

GitHub Pages serves **static files**, which means anyone can view the full contents of `data/family-legacy-data.js` just by opening it in a browser or right-clicking → View Source. There is currently no login wall. Treat anything you put in that file as **public information**, full stop — regardless of what you set the `privacy` field to.

The `privacy` field on every record (`public`, `family`, `private`, `admin`) is a **flag for your own future use**, not an access control. It does nothing to hide data today. It's there so that:

- You have a consistent way to mark intent now.
- When you eventually add real authentication (Google Sign-In + a backend), the app can start actually filtering on this field.

**Until that backend exists:**
- Keep exact birthdates, addresses, phone numbers, and other sensitive details for *living* people out of this file, or replace them with vague/partial info (e.g. birth year only, or nothing at all).
- If you want a private repo as an extra layer of caution, you still can — GitHub lets you make Pages sites from private repos visible only to people you invite, or you can keep the repo private and pay for GitHub Pages on a private repo (available on paid plans), or just keep the site itself unlisted and only share the URL with family.
- Treat "the repo is private" as a speed bump, not a wall — anyone with repo access still sees raw data.

## Next phase (not built yet, schema is ready for it)

The data schema already has optional fields reserved for:

- **Google Drive** — `media` records support a `storage` field that can hold a `drive_file_id` and URLs once you wire in real Drive-hosted files instead of color placeholders.
- **Google Calendar** — `events` records have a `google_calendar: { calendar_id, event_id, sync_status }` field ready for two-way sync.
- **Google Photos Picker** — `media` records support a `google_photos: { picker_session_id, media_item_id, imported_at }` field for when family members can sign in and pick photos directly.
- **Google Sign-In + real privacy enforcement** — once you add auth, the `privacy` field can finally do real work (hide `family`/`private` records from anonymous visitors).

None of this needs to happen before you start using the site. Add real people and stories first.

See `DATA-ENTRY-GUIDE.md` for how to actually fill in the data file.
# Genealogy model (v2)

Family Legacy uses one governing rule: children attach to individual parents; couples, unions, households, sibling groups, and branches are derived views. Legacy string references remain supported and normalize in memory without changing the source file. Rich relationships record their type, evidence status, sources, notes, visibility, and effect on branch descent.

The archive supports multiple ancestral roots and unlinked research branches. `home_branch_id` is a presentation anchor, not a claim about the earliest ancestor. Run `node scripts/validate-data.js` before publishing; living-person data in this public repository must remain non-sensitive.

Administrators now have dedicated Relationships, Unions, Households, and Diagnostics workspaces. See [ADMIN-GENEALOGY-GUIDE.md](ADMIN-GENEALOGY-GUIDE.md) for entry, migration, deployment, verification, and rollback instructions. Run `node scripts/test-relationships.js` for the 26-scenario relationship regression suite.
