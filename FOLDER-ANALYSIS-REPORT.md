# Family Legacy Folder Analysis Report

Generated: July 3, 2026

## Executive summary

This folder contains a static Family Legacy web platform for the Rowe / Randall family. It is already a working browser app, centered on `index.html`, with seed data in `data/family-legacy-data.js` and an optional Google Sheets persistence backend in `apps-script/Code.gs`.

The project is in a strong prototype / early production shape: the user-facing archive views, contribution forms, admin screens, structured editing, export flow, and Google Sheets API design are present. The biggest remaining work is not basic app creation; it is content completion, real privacy/security, deployment hardening, and maintainability cleanup.

## Folder inventory

| Path | Role | Size / shape |
| --- | --- | --- |
| `index.html` | Main static app: HTML, CSS, JavaScript, UI, routing, admin tools, tree rendering, Google Sheets sync | 6,421 lines, about 216 KB |
| `data/family-legacy-data.js` | Local seed/offline family dataset | 675 lines, about 26 KB |
| `apps-script/Code.gs` | Google Apps Script API for Sheets persistence and contribution review | 258 lines, about 11 KB |
| `README.md` | Project overview, GitHub Pages deployment notes, privacy warning, next-phase notes | 72 lines |
| `DATA-ENTRY-GUIDE.md` | Practical instructions for adding people, branches, events, stories, media, locations, sources | 197 lines |
| `GOOGLE-SHEETS-SCHEMA.md` | Backend schema, API contract, deployment/bootstrap instructions, limitations | 82 lines |
| `.gitattributes` | Git attributes config | Small config file |
| `.git/` | Git repository metadata | Present |
| `.agents/` | Agent/tooling folder | Present, appears empty from top-level listing |

There are no package manager files, build files, test files, or dependency manifests. This is intentionally a no-build static site.

## What the app currently contains

### Public-facing site

The app has these main pages:

- Home
- Tree
- Timeline
- People
- Stories
- Branches
- Contribute
- Search
- Gallery
- Edit Data
- Admin
- Person profile detail views

The UI is contained inside `index.html`, including CSS and JavaScript. It loads:

- Google Fonts from `fonts.googleapis.com`
- D3 v7.8.5 from CDNJS for tree visualization
- Local data from `./data/family-legacy-data.js`

### Core user features

The front end includes:

- Family homepage with stats, stories, events, and anniversaries
- Interactive D3 family tree with branch filtering and pan behavior
- People directory with search/filtering
- Timeline rendering from event data
- Branch pages/detail overlays
- Story listing and person-linked stories
- Gallery/media handling, currently designed around placeholders and future Drive media
- Global search across people, events, and stories
- Person profile pages with relatives, dates, privacy label, events, stories, and media

### Contribution workflow

The Contribute page supports public submissions for:

- New person
- Memory/note
- Event
- Story

Submissions are queued for review when the Google Sheets backend is active. In local/offline mode, the app falls back to seed data and cannot centrally persist admin edits.

### Admin and editing workflow

The app includes:

- Client-side password gate for Super Admin and Family Admin access
- Branch-scoped family admin permissions
- Admin overview dashboard
- Structured record editor for people, branches, events, stories, and media
- Profile type management
- Pending contribution review
- Export updated `family-legacy-data.js`
- Seed Google Sheet from local data

Important: the app itself documents that this is not real security. Password hashes, role checks, and data are all client-side or callable through a public Apps Script endpoint.

## Current data health

The seed dataset currently contains:

| Data type | Count |
| --- | ---: |
| Branches | 6 |
| Persons | 21 |
| Events | 1 |
| Stories | 0 |
| Media | 0 |
| Locations | 0 |
| Sources | 0 |
| Profile types | 5 |
| Family admins | 0 |

### Existing people

The current person records are:

- Christine Rowe
- Kenneth Rowe
- Trevor Rowe
- Fiona English
- Lois Josephs
- Fred Josephs
- Sandra Hutchinson
- Brenda Randall
- Marvin Randall
- Andrew Randall
- Marcus Randall
- Danielle Josephs
- Lawrence Josephs
- Tiffany Barnes
- Trey Barnes
- Zoey Barnes
- Zora Barnes
- Michelle Hale
- Chris Hale II
- Khloe Hale
- Braylon

### Existing branches

The current branches are:

- Rowe Family
- Trevor Rowe Line
- English / Hale Line
- Josephs Line
- Hutchinson / Barnes Line
- Randall Line

### Integrity checks

I checked the current dataset for:

- Duplicate person IDs
- Broken parent references
- Broken spouse references
- Broken child references
- Branch references pointing to missing branches
- Branch roots pointing to missing people
- Event references pointing to missing people/branches/media/locations
- Story references pointing to missing people/events/media
- Media references pointing to missing people/events/branches/locations

Result: no broken cross-references were found in the current seed data.

## Google Sheets backend

`apps-script/Code.gs` is a Google Apps Script web app backend. It creates and manages these tabs:

- Persons
- Branches
- Events
- Stories
- Media
- Locations
- Sources
- PendingSubmissions
- Settings

The backend stores complete records as JSON in a `record_json` column. That is a practical choice for this project because family records have nested relationships, tags, sources, dates, media links, and future fields that would be awkward to flatten into many spreadsheet columns.

Supported API actions include:

- `ping`
- `getAll`
- `saveRecord`
- `deleteRecord`
- `submitContribution`
- `approveSubmission`
- `rejectSubmission`
- `seedFromInitialData`

The docs say the web app should be deployed as:

- Execute as: Me
- Who has access: Anyone

This makes the API easy for a static GitHub Pages front end to call, but it also means real authorization is not present yet.

## What is working or mostly built

- Static site architecture suitable for GitHub Pages
- Centralized seed data file
- Clear data entry documentation
- Data schema already planned for future Google Drive, Google Calendar, Google Photos Picker, and auth work
- Public browsing experience
- Contribution intake flow
- Admin/editing interface
- Export workflow for updating the local data file
- Google Sheets persistence API
- Contribution review model
- Branch-scoped admin concept
- Basic data validation through structured forms and consistent schemas

## Main gaps and risks

### 1. Privacy and security are not real yet

This is the most important issue.

The repo repeatedly warns that privacy labels are descriptive only. Anyone who can load the site or inspect source files can see `family-legacy-data.js`. The client-side admin password gate is only a deterrent, not access control. The public Apps Script endpoint also has no real server-side identity or authorization.

Impact:

- Do not store exact birthdates, addresses, emails, phone numbers, sensitive notes, legal/medical/financial info, or private living-person details here yet.
- Treat all committed data as public.

### 2. Content is still sparse

The app shell is much more complete than the archive content.

Current content gaps:

- 0 stories
- 0 media records
- 0 locations
- 0 sources
- Only 1 event
- Many people have placeholder bios and no dates

The next meaningful improvement is likely adding family content, not adding more UI.

### 3. Google Sheets deployment status is unknown

The code and docs are ready for a Sheets-backed setup, but from the folder alone I cannot confirm whether:

- The Apps Script project has been updated with this exact `Code.gs`
- The deployed `/exec` URL still points to the current script version
- The Sheet has been seeded
- The live API returns initialized data
- Admin edits are persisting centrally

This should be verified in browser/runtime testing.

### 4. The app is hard to maintain as one huge HTML file

`index.html` is 6,421 lines and contains markup, CSS, and JavaScript. That was a good v1 choice, and the README says it was intentional. But the app has grown enough that future work will be safer if it is split.

Suggested future split:

- `assets/css/styles.css`
- `assets/js/data-access.js`
- `assets/js/render-home.js`
- `assets/js/render-tree.js`
- `assets/js/render-admin.js`
- `assets/js/forms.js`
- `assets/js/utils.js`

This is not urgent if the app is stable, but it will matter as features continue.

### 5. No automated tests or validation scripts

There is no test suite, linter, formatter, or standalone validation script. Because this is family-data heavy, a lightweight validator would be very valuable.

Useful checks:

- Duplicate IDs
- Broken references
- Missing reciprocal parent/child/spouse links
- Invalid date shapes
- Unknown branch IDs
- Missing required fields
- Living people with exact sensitive data
- Invalid privacy values

### 6. External CDN dependence

The tree page depends on D3 from CDNJS, and typography depends on Google Fonts. That is normal for a static site, but if a visitor is offline or blocked by privacy/network settings, the site may look different or the tree may fail.

### 7. Encoding display should be checked

Some command-line output displayed characters like arrows and warning symbols incorrectly. This may be a PowerShell console encoding issue rather than corrupt files, but the Markdown docs should be opened in the editor/browser to confirm symbols render correctly.

## Recommended priorities

### Priority 1: Protect privacy before adding sensitive data

Before adding private family details:

- Decide whether this site is public, unlisted, or private.
- Keep sensitive living-person details out of `family-legacy-data.js`.
- Do not rely on the `privacy` field for hiding anything.
- Do not rely on the Admin password gate as security.

Best next security direction:

- Add real Google Sign-In or another auth provider.
- Move sensitive data access behind a server-side permission check.
- Enforce privacy server-side before records are returned to the browser.

### Priority 2: Verify the live Google Sheets pipeline

Recommended checklist:

- Deploy the current `apps-script/Code.gs` to Apps Script.
- Confirm `GET ?action=ping` returns OK.
- Confirm `GET ?action=getAll` returns initialized data.
- Use the app's Super Admin flow to seed Google Sheets.
- Submit a test contribution.
- Approve/reject that contribution.
- Confirm the front end reloads the changed central dataset.

### Priority 3: Fill the archive content

Highest-value content additions:

- Add locations for known homes, cities, churches, schools, hospitals, and cemeteries.
- Add key life events: births, weddings, homegoings, graduations, reunions, migrations, military service, church milestones.
- Add at least 5 to 10 stories so the Stories page becomes meaningful.
- Add placeholder media records for important photos/documents, even before Drive is fully connected.
- Add source records for obituaries, certificates, interviews, photos, and family documents.

### Priority 4: Add a validation script

Create a small local script such as `scripts/validate-data.js` that loads `data/family-legacy-data.js` and reports issues. This would prevent broken data from silently damaging the tree, profiles, timeline, or admin screens.

### Priority 5: Runtime QA pass

Open the app locally and test:

- Home renders correctly
- Tree renders and pans
- Branch filters work
- People search works
- Person profile pages open
- Contribute forms submit or show correct offline behavior
- Admin password gate works
- Edit Data export works
- Mobile layout works
- No console errors

### Priority 6: Split files when feature work resumes

Once the next feature push begins, split `index.html` into separate CSS and JavaScript files. This will make future changes easier to review, test, and debug.

## Suggested near-term work plan

1. Confirm whether the project should stay static/public or become private/login-gated.
2. Verify the current Google Apps Script deployment and Google Sheet state.
3. Add a data validation script.
4. Add real locations and source records.
5. Add the first batch of stories and media placeholders.
6. Do a full browser QA pass on desktop and mobile.
7. Only after the app is stable with real content, split the large HTML file into maintainable modules.

## Bottom line

This folder already contains a substantial working family archive platform. The foundation is good: static hosting, clear schema, admin tools, contribution review, and a Sheets-backed persistence plan are all present.

What needs to be done next is mostly operational and content-focused: protect private data, verify the backend deployment, populate the archive, add validation, and test the full workflow. The main engineering risk is that privacy/security is currently only advisory, while the main product gap is that the platform is built but the archive is still lightly populated.
