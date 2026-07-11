# Data Entry Guide

Everything in this guide is about one file: `data/family-legacy-data.js`. Open it in any text editor (VS Code is what you already use for everything else).

The file is one big JavaScript object called `FamilyData`, broken into sections: `meta`, `branches`, `persons`, `events`, `stories`, `media`, `locations`, `sources`, `settings`. You only ever add entries inside the `[ ]` arrays (or `{ }` for `locations`) in each section — you never need to touch the engine code in `index.html`.

A general rule: **copy an existing real entry as your template, rather than typing one from scratch.** The placeholder comments in each section also show the exact shape, but a real example already in the file is the safest thing to copy because you know it works.

---

## Adding a person

Find the `persons: [` array. Add a new object inside the brackets, comma-separated from the one before it:

```js
{
  id: "p_uniqueid",                 // lowercase, no spaces, must be unique across all persons
  name: {
    first: "FirstName",
    middle: "MiddleName",           // use "" if none
    last: "LastName",
    maiden: null,                   // maiden name if applicable, else null
    nicknames: ["Nickname"],        // array, can be empty []
    display: "FirstName LastName"   // how their name shows on cards/headers
  },
  birth: {
    date: "1985-04-12",             // YYYY-MM-DD, or null if unknown
    display: "April 12, 1985",      // human-readable version shown on the page
    certainty: "exact",             // "exact" | "estimated" | "unknown"
    location_id: "loc_xxx"          // matches a key in the locations section, or null
  },
  death: null,                      // null if living, otherwise same shape as birth
  gender: "female",                 // "male" | "female" | "unknown"
  is_living: true,
  relationships: {
    parents: ["p_id1", "p_id2"],    // person ids, can be empty []
    spouses: [{ person_id: "p_id3", relationship_id: "rel_xxx" }],
    children: ["p_id4"]
  },
  branch_ids: ["branch_xxx"],       // which branch(es) this person belongs to
  bio: "A sentence or two about them.",
  cover_media_id: null,             // a media id once you have a profile photo for them
  tags: ["tag1", "tag2"],
  confidence: 0.8,                  // 0 to 1 — how sure you are this record is accurate
  sources: [],                      // free-text source notes, or source ids later
  privacy: "family"                 // see the privacy warning in README.md
}
```

**Important:** if this person has a parent, also go to that parent's record and add the new person's id into the parent's `relationships.children` array. The schema doesn't auto-link both directions — you set both ends by hand. Same goes for spouses: both people's `relationships.spouses` should point at each other with the same `relationship_id`.

If you're not sure of an exact birthdate, don't guess — use `date: null` and either leave `display: ""` or use something honest like `"date unknown"`, with `certainty: "unknown"`.

## Adding a branch

Branches group people into family lines for the Branches and Tree pages.

```js
{
  id: "branch_xxx",
  name: "Smith Line",
  root_person_id: "p_xxx",          // the person this branch is anchored to
  parent_branch_id: "branch_root",  // or null if this is a top-level branch
  child_branch_ids: [],             // branches that descend from this one
  color: "#4a3a6a",                 // any hex color, used for visual coding on the tree
  description: "Short description of this branch."
}
```

If this new branch descends from an existing branch, also add its id into that parent branch's `child_branch_ids` array.

## Adding an event

```js
{
  id: "evt_xxx",
  type: "wedding",                  // birth | death | wedding | reunion | military |
                                     // graduation | migration | church | homegoing |
                                     // milestone | other
  title: "Short title",
  description: "A sentence or two about what happened.",
  date: { start: "1995-06-10", display: "June 10, 1995", certainty: "exact", end: null },
  recurrence: { type: "none" },     // or { type: "annual", month: 6, day: 10 } for birthdays etc.
  people: [{ person_id: "p_xxx", role: "subject" }],  // role can be anything descriptive
  branch_ids: ["branch_xxx"],
  location_id: "loc_xxx",           // or null
  media_ids: [],                    // media ids tied to this event
  cover_media_id: null,
  tags: [],
  sources: [],
  submitted_by: "admin",
  privacy: "family",
  google_calendar: { calendar_id: "", event_id: "", sync_status: "not_synced" }  // leave blank for now
}
```

## Adding a story

```js
{
  id: "story_xxx",
  type: "written",                  // written | audio | video (audio/video need a media_id)
  title: "Story title",
  body: "The full story text.",
  people_ids: ["p_xxx"],            // who the story is about
  event_ids: [],                    // optional link to an event
  era: "1990s",
  told_by: "p_xxx",                 // person id of who told/wrote it
  told_date: "2020-00-00",          // when it was recorded/written, "00" for unknown month/day
  media_id: null,                   // a photo/audio/video to go with the story
  tags: [],
  submitted_by: "admin",
  status: "draft",                  // draft | submitted | approved | archived | published
  privacy: "family"
}
```

## Adding media (photos, videos, documents, audio)

For now, before Google Drive is wired in, every media item is a colored placeholder tile:

```js
{
  id: "m_xxx",
  type: "photo",                    // photo | video | audio | document
  title: "Photo title",
  description: "Who/what/when/where.",
  storage: { type: "placeholder", url: null, color: "#5c4a2a" },
  date: { value: "1998-07-04", certainty: "exact", display: "July 4, 1998" },
  people_ids: ["p_xxx"],
  event_ids: [],
  branch_ids: ["branch_xxx"],
  location_id: null,
  tags: [],
  submitted_by: "admin",
  privacy: "family",
  google_photos: { picker_session_id: "", media_item_id: "", imported_at: "" }  // leave blank for now
}
```

Once you start uploading real files to Google Drive, swap the `storage` field for:

```js
storage: { type: "drive", drive_file_id: "1AbCxyz...", url: "https://drive.google.com/...", thumbnail_url: "" }
```

(That part needs a small front-end update first — see "Next phase" in README.md — but the data shape is ready now so you can start cataloging media immediately.)

## Adding a location

Locations are a bit different — it's an *object* keyed by id, not an array:

```js
locations: {
  loc_greensboro: { name: "Greensboro, NC", short: "Greensboro, NC" },
  loc_xxx: { name: "Full City, State", short: "Short label" }
}
```

Add your new location as another key inside the existing `{ }`.

## Adding a source

```js
{
  id: "src_xxx",
  title: "Obituary, Greensboro News & Record",
  type: "obituary",                 // census | family_bible | obituary | birth_certificate |
                                     // death_certificate | marriage_record | interview |
                                     // photo | document | other
  date: "2010-03-01",
  location: "loc_xxx",
  drive_file_id: "",                // once scanned and uploaded to Drive
  notes: "",
  reliability: 0.9                  // 0 to 1
}
```

## Suggested order of work

1. Fill in real birth/death info and bios for the people already in the file (Christine, Kenneth, and the rest) as you confirm details.
2. Add any missing relatives — spouses, in-laws, more grandchildren — using the person template above.
3. Add a couple of locations (hometowns, churches, hospitals) so birth/death/event records can point somewhere.
4. Add a few key events (weddings, reunions, milestones) once people and locations exist to link them to.
5. Add stories — these are often the easiest, richest content and don't require dates to be nailed down first.
6. Add media last, once you've decided whether to start with placeholder tiles or jump straight into Google Drive linking.

## Checking your work

After editing, open `index.html` in a browser (just double-click the file, or use a local server) and click through Home, Tree, People, Branches, Timeline, and the person's own profile page. If something looks wrong — a person missing, a relationship not showing — it's almost always one of:

- A typo in an `id` that doesn't match what's referenced elsewhere (e.g. `p_andrew` vs `p_Andrew`).
- A missing comma between two objects in an array.
- Forgetting to add the relationship on *both* people (parent → child, and child → parent's `children` array).

The Admin → Edit Data page in the running site also has an **Export All Data as JSON** button, which dumps the live in-memory dataset. That's a good way to sanity-check what the app currently thinks the data looks like, separate from what's written in the file.

Before you commit, also run the validator from the project root:

```
node scripts/validate-data.js
```

It catches the most common mistakes automatically — duplicate ids, broken references, missing reciprocal relationships, missing required fields, invalid `privacy` values, and living people with exact birthdates or other sensitive fields recorded. Fix anything under "ERRORS" before committing; "WARNINGS" are worth a look but won't block you.
# Blended families and evidence

Children are connected to individual parents, never automatically to both adults in a couple. A legacy value such as `parents: ["p_one"]` remains valid and is read as a confirmed biological relationship. New entries may use `{ person_id, relationship_type, status, source_ids, notes, public, establishes_branch_descent }`.

- One known parent: add only that parent; do not invent an unknown second parent.
- Previous relationship: connect the child to their documented parent(s), then associate the child with the correct union only when known.
- Step-parent, foster parent, or guardian: use that relationship type; it does not establish biological descent.
- Adoption: use `adoptive`; it participates in family-line and sibling views while remaining clearly labeled.
- Evidence: choose confirmed, probable, possible, oral-history, disputed, or unknown. Add source IDs and a concise note.

Full siblings share two biological parents; half-siblings share one; adoptive siblings share an adoptive parent. Step-siblings require a supported parent union or household and are never guessed from display placement.

`home_branch_id` controls where the experience opens. `root_branch_ids` lists the earliest known lines, including unconnected research branches. Adding older ancestors never requires moving the familiar home anchor.
