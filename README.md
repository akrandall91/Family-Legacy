# Family Legacy Platform — Rowe / Randall Family

A private family archive, tree, timeline, and story site for the Rowe / Randall family. Built as a static site so it can be hosted free on GitHub Pages.

## What's in this project

```
family-legacy-platform/
  index.html                    ← the whole site (pages, styles, app logic)
  data/
    family-legacy-data.js       ← YOUR family data lives here
  assets/
    css/                        ← reserved for when you split styles out of index.html
    js/                         ← reserved for when you split app logic out of index.html
    images/                     ← local images, if you don't want to use Google Drive for everything
  README.md                     ← this file
  DATA-ENTRY-GUIDE.md           ← how to add real people, events, stories, media
```

Right now, the CSS and JavaScript app logic both live inside `index.html` in `<style>` and `<script>` tags. That's intentional for v1 — it's simpler to manage one file while the platform is still taking shape. The `assets/css` and `assets/js` folders are there for whenever you want to split things out; nothing breaks if you leave them empty.

The **family data** is the one thing pulled out into its own file: `data/family-legacy-data.js`. `index.html` loads it with:

```html
<script src="./data/family-legacy-data.js"></script>
```

This is the file you'll edit constantly. The app code never needs to change just because you added a person.

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
