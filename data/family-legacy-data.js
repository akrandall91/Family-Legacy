// ============================================================
// FAMILY LEGACY PLATFORM — Family Data
// Rowe / Randall Family
// ============================================================
//
// ⚠️  PRIVACY WARNING — READ BEFORE EDITING  ⚠️
// This file is loaded by index.html on GitHub Pages, which is a
// PUBLIC static site. ANYONE can view this file's full contents
// by opening it directly or using "View Source" / browser dev
// tools — there is no login wall yet.
//
// DO NOT put in this file, until real authentication + a private
// backend exist:
//   - Exact birth dates for LIVING people
//   - Home addresses, phone numbers, emails
//   - Sensitive medical, legal, or financial details
//   - Anything a living relative hasn't agreed to make public
//
// Use the `privacy` field on every record to mark intent:
//   "public"  -> safe to publish openly, right now, on this site
//   "family"  -> for family eyes only, requires login (not built yet)
//   "private" -> sensitive, keep out of any public repo
//   "admin"   -> admin-only records (submission queue, review notes)
//
// IMPORTANT: setting privacy to "family" or "private" does NOT
// hide the data from this public file today — the engine doesn't
// yet filter by privacy on the static site. It's a flag for YOU,
// for the future login-gated version. Until then, treat "family"
// and "private" as "do not actually type sensitive details here."
// Living people below are intentionally light on personal data —
// keep it that way until you have the auth layer in place.
// ============================================================

const FamilyData = {

  // --------------------------------------------------------
  // META — top-level info about the site/family
  // --------------------------------------------------------
  meta: {
    family_name: "The Rowe Family",
    tagline: "One root. Many branches.",
    founded: "2024",
    root_branch_id: "branch_root", // legacy alias
    home_branch_id: "branch_root",
    root_branch_ids: ["branch_root"],
    default_exploration_mode: "home",
    show_unlinked_research_branches: true,
    show_uncertain_relationships: true,
    show_household_connections_in_tree: false
  },

  unions: [],
  households: [],

  // --------------------------------------------------------
  // BRANCHES
  // One entry per family line. root_person_id is the person
  // this branch is "anchored" to. parent_branch_id links branches
  // into the larger tree. child_branch_ids lists branches that
  // descend from this one.
  // --------------------------------------------------------
  branches: [
    {
      id: "branch_root",
      name: "Rowe Family",
      root_person_id: "p_christine",
      parent_branch_id: null,
      child_branch_ids: ["branch_rowe_trevor", "branch_english", "branch_josephs", "branch_hutchinson", "branch_randall_brenda"],
      color: "#8b6914",
      description: "The Rowe family, rooted in Christine and Kenneth Rowe."
    },
    {
      id: "branch_rowe_trevor",
      name: "Trevor Rowe Line",
      root_person_id: "p_trevor",
      parent_branch_id: "branch_root",
      child_branch_ids: [],
      color: "#3a5c38",
      description: "Trevor Rowe's line."
    },
    {
      id: "branch_english",
      name: "English / Hale Line",
      root_person_id: "p_fiona",
      parent_branch_id: "branch_root",
      child_branch_ids: [],
      color: "#7a3018",
      description: "Fiona English's line. Michelle and Chris Hale II are from Fiona's first marriage."
    },
    {
      id: "branch_josephs",
      name: "Josephs Line",
      root_person_id: "p_lois",
      parent_branch_id: "branch_root",
      child_branch_ids: [],
      color: "#3a4a6a",
      description: "Lois and Fred Josephs' line."
    },
    {
      id: "branch_hutchinson",
      name: "Hutchinson / Barnes Line",
      root_person_id: "p_sandra",
      parent_branch_id: "branch_root",
      child_branch_ids: [],
      color: "#5a3a6a",
      description: "Sandra Hutchinson's line. Tiffany and Trey Barnes carry it forward."
    },
    {
      id: "branch_randall_brenda",
      name: "Randall Line",
      root_person_id: "p_brenda",
      parent_branch_id: "branch_root",
      child_branch_ids: [],
      color: "#6a3a1a",
      description: "Brenda and Marvin Randall's line."
    }
  ],

  // --------------------------------------------------------
  // PERSONS
  // birth / death: { date: "YYYY-MM-DD" or null, display: "human text",
  //                   certainty: "exact" | "estimated" | "unknown",
  //                   location_id: "loc_xxx" or null }
  // Use date: null + display: "" when you don't know the date yet —
  // do NOT guess a date just to fill the field.
  // confidence: 0–1, how sure you are this record is accurate/complete.
  // privacy: see warning at top of file.
  // --------------------------------------------------------
  persons: [
    {
      id: "p_christine",
      name: { first: "Christine", middle: "", last: "Rowe", maiden: null, nicknames: [], display: "Christine Rowe" },
      birth: null,
      death: null,
      gender: "female",
      is_living: true,
      relationships: {
        parents: [],
        spouses: [{ person_id: "p_kenneth", relationship_id: "rel_rowe_root" }],
        children: ["p_trevor", "p_fiona", "p_lois", "p_sandra", "p_brenda"]
      },
      branch_ids: ["branch_root"],
      bio: "Grandmother and root ancestor of the Rowe family.",
      cover_media_id: null,
      tags: ["grandmother", "root-ancestor"],
      confidence: 0.6,
      sources: [],
      privacy: "family"
    },
    {
      id: "p_kenneth",
      name: { first: "Kenneth", middle: "", last: "Rowe", maiden: null, nicknames: [], display: "Kenneth Rowe" },
      birth: null,
      death: null,
      gender: "male",
      is_living: true,
      relationships: {
        parents: [],
        spouses: [{ person_id: "p_christine", relationship_id: "rel_rowe_root" }],
        children: ["p_trevor", "p_fiona", "p_lois", "p_sandra", "p_brenda"]
      },
      branch_ids: ["branch_root"],
      bio: "Grandfather of the Rowe family and founding partner of Christine Rowe.",
      cover_media_id: null,
      tags: ["grandfather", "root-ancestor"],
      confidence: 0.6,
      sources: [],
      privacy: "family"
    },
    {
      id: "p_trevor",
      name: { first: "Trevor", middle: "", last: "Rowe", maiden: null, nicknames: [], display: "Trevor Rowe" },
      birth: null,
      death: null,
      gender: "male",
      is_living: true,
      relationships: { parents: ["p_christine", "p_kenneth"], spouses: [], children: [] },
      branch_ids: ["branch_root", "branch_rowe_trevor"],
      bio: "Christine and Kenneth's son. Trevor anchors his own Rowe branch.",
      cover_media_id: null,
      tags: ["uncle"],
      confidence: 0.6,
      sources: [],
      privacy: "family"
    },
    {
      id: "p_fiona",
      name: { first: "Fiona", middle: "", last: "English", maiden: null, nicknames: [], display: "Fiona English" },
      birth: null,
      death: null,
      gender: "female",
      is_living: true,
      relationships: { parents: ["p_christine", "p_kenneth"], spouses: [], children: ["p_michelle", "p_chris_hale"] },
      branch_ids: ["branch_root", "branch_english"],
      bio: "Christine and Kenneth's daughter. English is Fiona's second married name; Michelle and Chris are from her first marriage.",
      cover_media_id: null,
      tags: ["english-line"],
      confidence: 0.6,
      sources: [],
      privacy: "family"
    },
    {
      id: "p_lois",
      name: { first: "Lois", middle: "", last: "Josephs", maiden: null, nicknames: [], display: "Lois Josephs" },
      birth: null,
      death: null,
      gender: "female",
      is_living: true,
      relationships: { parents: ["p_christine", "p_kenneth"], spouses: [{ person_id: "p_fred", relationship_id: "rel_josephs" }], children: ["p_danielle", "p_lawrence"] },
      branch_ids: ["branch_root", "branch_josephs"],
      bio: "Christine and Kenneth's daughter. Lois and Fred Josephs are the roots of the Josephs line.",
      cover_media_id: null,
      tags: ["josephs-line"],
      confidence: 0.6,
      sources: [],
      privacy: "family"
    },
    {
      id: "p_fred",
      name: { first: "Fred", middle: "", last: "Josephs", maiden: null, nicknames: [], display: "Fred Josephs" },
      birth: null,
      death: null,
      gender: "male",
      is_living: true,
      relationships: { parents: [], spouses: [{ person_id: "p_lois", relationship_id: "rel_josephs" }], children: ["p_danielle", "p_lawrence"] },
      branch_ids: ["branch_josephs"],
      bio: "Lois Josephs' spouse and parent in the Josephs branch.",
      cover_media_id: null,
      tags: ["josephs-line"],
      confidence: 0.6,
      sources: [],
      privacy: "family"
    },
    {
      id: "p_sandra",
      name: { first: "Sandra", middle: "", last: "Hutchinson", maiden: null, nicknames: [], display: "Sandra Hutchinson" },
      birth: null,
      death: null,
      gender: "female",
      is_living: true,
      relationships: { parents: ["p_christine", "p_kenneth"], spouses: [], children: ["p_tiffany"] },
      branch_ids: ["branch_root", "branch_hutchinson"],
      bio: "Christine and Kenneth's daughter. Sandra anchors the Hutchinson / Barnes line.",
      cover_media_id: null,
      tags: ["hutchinson-line"],
      confidence: 0.6,
      sources: [],
      privacy: "family"
    },
    {
      id: "p_brenda",
      name: { first: "Brenda", middle: "", last: "Randall", maiden: "Rowe", nicknames: [], display: "Brenda Randall" },
      birth: null,
      death: null,
      gender: "female",
      is_living: true,
      relationships: { parents: ["p_christine", "p_kenneth"], spouses: [{ person_id: "p_marvin", relationship_id: "rel_randall" }], children: ["p_andrew", "p_marcus"] },
      branch_ids: ["branch_root", "branch_randall_brenda"],
      bio: "Born Brenda Rowe and married Marvin Randall. Their branch includes Andrew and Marcus.",
      cover_media_id: null,
      tags: ["randall-line"],
      confidence: 0.6,
      sources: [],
      privacy: "family"
    },
    {
      id: "p_marvin",
      name: { first: "Marvin", middle: "", last: "Randall", maiden: null, nicknames: [], display: "Marvin Randall" },
      birth: null,
      death: null,
      gender: "male",
      is_living: true,
      relationships: { parents: [], spouses: [{ person_id: "p_brenda", relationship_id: "rel_randall" }], children: ["p_andrew", "p_marcus"] },
      branch_ids: ["branch_randall_brenda"],
      bio: "Brenda Randall's spouse and parent in the Randall branch.",
      cover_media_id: null,
      tags: ["randall-line"],
      confidence: 0.6,
      sources: [],
      privacy: "family"
    },
    {
      id: "p_andrew",
      name: { first: "Andrew", middle: "", last: "Randall", maiden: null, nicknames: [], display: "Andrew Randall" },
      birth: null,
      death: null,
      gender: "male",
      is_living: true,
      relationships: { parents: ["p_brenda", "p_marvin"], spouses: [], children: [] },
      branch_ids: ["branch_randall_brenda"],
      bio: "Child of Brenda and Marvin Randall.",
      cover_media_id: null,
      tags: ["randall-line"],
      confidence: 0.6,
      sources: [],
      privacy: "family"
    },
    {
      id: "p_marcus",
      name: { first: "Marcus", middle: "", last: "Randall", maiden: null, nicknames: [], display: "Marcus Randall" },
      birth: null,
      death: null,
      gender: "male",
      is_living: true,
      relationships: { parents: ["p_brenda", "p_marvin"], spouses: [], children: [] },
      branch_ids: ["branch_randall_brenda"],
      bio: "Child of Brenda and Marvin Randall.",
      cover_media_id: null,
      tags: ["randall-line"],
      confidence: 0.6,
      sources: [],
      privacy: "family"
    },
    {
      id: "p_danielle",
      name: { first: "Danielle", middle: "", last: "Josephs", maiden: null, nicknames: [], display: "Danielle Josephs" },
      birth: null,
      death: null,
      gender: "female",
      is_living: true,
      relationships: { parents: ["p_lois", "p_fred"], spouses: [], children: [] },
      branch_ids: ["branch_josephs"],
      bio: "Child of Lois and Fred Josephs.",
      cover_media_id: null,
      tags: ["josephs-line"],
      confidence: 0.6,
      sources: [],
      privacy: "family"
    },
    {
      id: "p_lawrence",
      name: { first: "Lawrence", middle: "", last: "Josephs", maiden: null, nicknames: [], display: "Lawrence Josephs" },
      birth: null,
      death: null,
      gender: "male",
      is_living: true,
      relationships: { parents: ["p_lois", "p_fred"], spouses: [], children: [] },
      branch_ids: ["branch_josephs"],
      bio: "Child of Lois and Fred Josephs.",
      cover_media_id: null,
      tags: ["josephs-line"],
      confidence: 0.6,
      sources: [],
      privacy: "family"
    },
    {
      id: "p_tiffany",
      name: { first: "Tiffany", middle: "", last: "Barnes", maiden: "Hutchinson", nicknames: [], display: "Tiffany Barnes" },
      birth: null,
      death: null,
      gender: "female",
      is_living: true,
      relationships: { parents: ["p_sandra"], spouses: [{ person_id: "p_trey", relationship_id: "rel_barnes" }], children: ["p_zoey", "p_zora"] },
      branch_ids: ["branch_hutchinson"],
      bio: "Born Tiffany Hutchinson. Tiffany and Trey Barnes are parents of Zoey and Zora.",
      cover_media_id: null,
      tags: ["barnes-line"],
      confidence: 0.6,
      sources: [],
      privacy: "family"
    },
    {
      id: "p_trey",
      name: { first: "Trey", middle: "", last: "Barnes", maiden: null, nicknames: [], display: "Trey Barnes" },
      birth: null,
      death: null,
      gender: "male",
      is_living: true,
      relationships: { parents: [], spouses: [{ person_id: "p_tiffany", relationship_id: "rel_barnes" }], children: ["p_zoey", "p_zora"] },
      branch_ids: ["branch_hutchinson"],
      bio: "Tiffany Barnes' spouse and parent of Zoey and Zora.",
      cover_media_id: null,
      tags: ["barnes-line"],
      confidence: 0.6,
      sources: [],
      privacy: "family"
    },
    {
      id: "p_zoey",
      name: { first: "Zoey", middle: "", last: "Barnes", maiden: null, nicknames: [], display: "Zoey Barnes" },
      birth: null,
      death: null,
      gender: "female",
      is_living: true,
      relationships: { parents: ["p_tiffany", "p_trey"], spouses: [], children: [] },
      branch_ids: ["branch_hutchinson"],
      bio: "Child of Tiffany and Trey Barnes.",
      cover_media_id: null,
      tags: ["barnes-line"],
      confidence: 0.6,
      sources: [],
      privacy: "family"
    },
    {
      id: "p_zora",
      name: { first: "Zora", middle: "", last: "Barnes", maiden: null, nicknames: [], display: "Zora Barnes" },
      birth: null,
      death: null,
      gender: "female",
      is_living: true,
      relationships: { parents: ["p_tiffany", "p_trey"], spouses: [], children: [] },
      branch_ids: ["branch_hutchinson"],
      bio: "Child of Tiffany and Trey Barnes.",
      cover_media_id: null,
      tags: ["barnes-line"],
      confidence: 0.6,
      sources: [],
      privacy: "family"
    },
    {
      id: "p_michelle",
      name: { first: "Michelle", middle: "", last: "Hale", maiden: null, nicknames: [], display: "Michelle Hale" },
      birth: null,
      death: null,
      gender: "female",
      is_living: true,
      relationships: { parents: ["p_fiona"], spouses: [], children: ["p_braylon"] },
      branch_ids: ["branch_english"],
      bio: "Fiona English's child from her first marriage and parent of Braylon.",
      cover_media_id: null,
      tags: ["hale-line"],
      confidence: 0.6,
      sources: [],
      privacy: "family"
    },
    {
      id: "p_chris_hale",
      name: { first: "Chris", middle: "", last: "Hale II", maiden: null, nicknames: [], display: "Chris Hale II" },
      birth: null,
      death: null,
      gender: "male",
      is_living: true,
      relationships: { parents: ["p_fiona"], spouses: [{ person_id: "p_khloe", relationship_id: "rel_hale" }], children: [] },
      branch_ids: ["branch_english"],
      bio: "Fiona English's child from her first marriage and brother of Michelle Hale.",
      cover_media_id: null,
      tags: ["hale-line"],
      confidence: 0.6,
      sources: [],
      privacy: "family"
    },
    {
      id: "p_khloe",
      name: { first: "Khloe", middle: "", last: "Hale", maiden: null, nicknames: [], display: "Khloe Hale" },
      birth: null,
      death: null,
      gender: "female",
      is_living: true,
      relationships: { parents: [], spouses: [{ person_id: "p_chris_hale", relationship_id: "rel_hale" }], children: [] },
      branch_ids: ["branch_english"],
      bio: "Chris Hale II's spouse.",
      cover_media_id: null,
      tags: ["hale-line"],
      confidence: 0.6,
      sources: [],
      privacy: "family"
    },
    {
      id: "p_braylon",
      name: { first: "Braylon", middle: "", last: "", maiden: null, nicknames: [], display: "Braylon" },
      birth: null,
      death: null,
      gender: "unknown",
      is_living: true,
      relationships: { parents: ["p_michelle"], spouses: [], children: [] },
      branch_ids: ["branch_english"],
      bio: "Child of Michelle Hale. Last name not yet recorded.",
      cover_media_id: null,
      tags: ["hale-line"],
      confidence: 0.5,
      sources: [],
      privacy: "family"
    }
  ],

  // --------------------------------------------------------
  // EVENTS
  // type: birth | death | wedding | reunion | military | graduation |
  //       migration | church | homegoing | milestone | other
  // recurrence: { type: "none" } or { type: "annual", month: M, day: D }
  // --------------------------------------------------------
  events: [
    {
      id: "evt_rowe_family_root",
      type: "milestone",
      title: "Rowe Family Root",
      description: "Christine and Kenneth Rowe are the founding couple at the root of the family tree.",
      date: { start: "0000-00-00", display: "Date unknown", certainty: "unknown", end: null },
      recurrence: { type: "none" },
      people: [{ person_id: "p_christine", role: "founder" }, { person_id: "p_kenneth", role: "founder" }],
      branch_ids: ["branch_root"],
      location_id: null,
      media_ids: [],
      cover_media_id: null,
      tags: ["family-root", "milestone"],
      sources: [],
      submitted_by: "system",
      privacy: "family",
      // Optional — fill in once you connect Google Calendar (Phase 2)
      google_calendar: { calendar_id: "", event_id: "", sync_status: "not_synced" }
    }

    // --------------------------------------------------------
    // PLACEHOLDER EXAMPLE — copy this shape for new events, then delete it.
    // --------------------------------------------------------
    // {
    //   id: "evt_PLACEHOLDER",
    //   type: "wedding",
    //   title: "PLACEHOLDER — Replace with real event title",
    //   description: "PLACEHOLDER — short description of what happened",
    //   date: { start: "YYYY-MM-DD", display: "Month Day, Year", certainty: "exact", end: null },
    //   recurrence: { type: "annual", month: 6, day: 1 },
    //   people: [{ person_id: "p_xxx", role: "subject" }],
    //   branch_ids: ["branch_xxx"],
    //   location_id: "loc_xxx",
    //   media_ids: [],
    //   cover_media_id: null,
    //   tags: [],
    //   sources: [],
    //   submitted_by: "admin",
    //   privacy: "family",
    //   google_calendar: { calendar_id: "", event_id: "", sync_status: "not_synced" }
    // }
  ],

  // --------------------------------------------------------
  // STORIES
  // status: draft | submitted | approved | archived | published
  // --------------------------------------------------------
  stories: [
    // --------------------------------------------------------
    // PLACEHOLDER EXAMPLE — copy this shape, fill in a real story, then delete it.
    // --------------------------------------------------------
    // {
    //   id: "story_PLACEHOLDER",
    //   type: "written",
    //   title: "PLACEHOLDER — Story title",
    //   body: "PLACEHOLDER — the actual story text, in the family member's own words where possible.",
    //   people_ids: ["p_xxx"],
    //   event_ids: [],
    //   era: "1990s",
    //   told_by: "p_xxx",
    //   told_date: "YYYY-MM-00",
    //   media_id: null,
    //   tags: [],
    //   submitted_by: "admin",
    //   status: "draft",
    //   privacy: "family"
    // }
  ],

  // --------------------------------------------------------
  // MEDIA
  // type: photo | video | audio | document
  // storage: for now use { type: "placeholder", url: null, color: "#hex" }
  //   for a colored placeholder tile. Once Google Drive is wired in,
  //   switch to { type: "drive", drive_file_id: "...", url: "...",
  //   thumbnail_url: "..." }.
  // --------------------------------------------------------
  media: [
    // --------------------------------------------------------
    // PLACEHOLDER EXAMPLE — copy this shape for a real photo/doc, then delete it.
    // --------------------------------------------------------
    // {
    //   id: "m_PLACEHOLDER",
    //   type: "photo",
    //   title: "PLACEHOLDER — Photo title",
    //   description: "PLACEHOLDER — what/who is in this photo, and when/where",
    //   storage: { type: "placeholder", url: null, color: "#5c4a2a" },
    //   // Once on Google Drive, replace storage above with:
    //   // storage: { type: "drive", drive_file_id: "", url: "", thumbnail_url: "" },
    //   date: { value: "YYYY-MM-DD", certainty: "estimated", display: "circa Year" },
    //   people_ids: ["p_xxx"],
    //   event_ids: [],
    //   branch_ids: ["branch_xxx"],
    //   location_id: null,
    //   tags: [],
    //   submitted_by: "admin",
    //   privacy: "family",
    //   // Optional — fill in once Google Photos Picker is connected (Phase 2)
    //   google_photos: { picker_session_id: "", media_item_id: "", imported_at: "" }
    // }
  ],

  // --------------------------------------------------------
  // LOCATIONS
  // NOTE: this is an OBJECT keyed by id (not an array), matching
  // what the existing front-end engine expects (getLoc() does
  // D.locations[id]). Add real places as you confirm them.
  // --------------------------------------------------------
  locations: {
    // loc_PLACEHOLDER: { name: "City, State", short: "City, ST" }
  },

  // --------------------------------------------------------
  // SOURCES
  // Not yet rendered by the front end, but the schema is ready.
  // type: census | family_bible | obituary | birth_certificate |
  //       death_certificate | marriage_record | interview | photo |
  //       document | other
  // --------------------------------------------------------
  sources: [
    // {
    //   id: "src_PLACEHOLDER",
    //   title: "PLACEHOLDER — e.g. 'Obituary, Greensboro News & Record'",
    //   type: "obituary",
    //   date: "YYYY-MM-DD",
    //   location: "loc_xxx",
    //   drive_file_id: "",
    //   notes: "",
    //   reliability: 0.8
    // }
  ],

  // --------------------------------------------------------
  // SETTINGS
  // Site-wide configuration for lightweight admin tools and the
  // guided contribution flow.
  // --------------------------------------------------------
  settings: {
    // WARNING: these hashes are only casual-visitor deterrents. This is a
    // public static site, so anyone can inspect the source and gate logic.
    admin_password_hash: "aa57e3f0",
    family_admins: [],
    profile_types: [
      {
        id: "elder",
        label: "Elder",
        description: "A family elder preserving first-hand memories and earlier generations.",
        prompts: [
          "What family tradition do you most want younger generations to remember?",
          "Who shaped your childhood, and what were they like?",
          "What story has been told in the family for as long as you can remember?"
        ],
        show_fields: ["bio", "story", "event", "photo"]
      },
      {
        id: "parent_aunt_uncle",
        label: "Parent / Aunt / Uncle",
        description: "A bridge between generations with stories about siblings, parents, and children.",
        prompts: [
          "What is a favorite memory of growing up with your siblings or cousins?",
          "What lesson from your parents has stayed with you?",
          "Which family gathering still makes you smile?"
        ],
        show_fields: ["bio", "story", "event", "photo"]
      },
      {
        id: "grandchild_younger",
        label: "Grandchild / Younger Family",
        description: "A younger family member adding present-day memories and questions.",
        prompts: [
          "What is something an older relative taught you?",
          "Which family story would you like to know more about?",
          "What recent memory should become part of the family archive?"
        ],
        show_fields: ["bio", "story", "photo"]
      },
      {
        id: "in_law",
        label: "In-law",
        description: "A family member by marriage sharing an outside-in view of family life.",
        prompts: [
          "What first made you feel welcomed into the family?",
          "Which tradition or family personality stood out to you?",
          "What memory best captures this family from your point of view?"
        ],
        show_fields: ["bio", "story", "event", "photo"]
      },
      {
        id: "other",
        label: "Other / Not Sure",
        description: "A friend, researcher, or family member who is not sure which category fits.",
        prompts: [
          "What connection do you have to the Rowe family?",
          "What person, place, or event would you like to add?",
          "What detail do you think the family archive should preserve?"
        ],
        show_fields: ["bio", "story", "event", "photo"]
      }
    ]
  }
};
