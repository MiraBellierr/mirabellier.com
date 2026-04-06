import CharacterShrinePage, {
  type CharacterShrineData,
} from "@/components/CharacterShrinePage";

const shrine: CharacterShrineData = {
  canonical: "https://mirabellier.com/shrine/rossina",
  structuredDataId: "rossina-structured-data",
  structuredData: {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: "Rossina Wulfperl Luppino Shrine",
    description:
      "A long-form Rossina Wulfperl Luppino shrine with profile details, Pack lore, battle notes, quotes, and personal favorites.",
    url: "https://mirabellier.com/shrine/rossina",
    about: {
      "@type": "Thing",
      name: "Rossina Wulfperl Luppino",
      alternateName: "Rossi",
    },
  },
  hero: {
    name: "Rossina Wulfperl Luppino",
    subtitle: "Dedicated to the one and only Rossi",
    intro:
      "Rossi brings exactly the kind of character energy I never get tired of: crimson hood, wolfish poise, family duty, theatrical pride, and a blade-first confidence that can turn a full-name introduction into a battle cry.",
    badges: [
      "future capo",
      "red knight energy",
      "lupo pride",
      "blade-first elegance",
    ],
    heroImage: {
      src: "/rossi1.jpg",
      alt: "Rossina Wulfperl Luppino promotional artwork",
      caption: "The red-hood silhouette that makes a shrine inevitable.",
    },
    supportingImages: [
      {
        src: "/rossi1.jpg",
        alt: "Rossi portrait art with strong red accents",
        caption: "Sharp posture, sharper presence.",
      },
      {
        src: "/rossi2.jpg",
        alt: "Rossi close-up portrait",
        caption: "Every angle reinforces the pack-heir aura.",
      },
    ],
  },
  welcome: [
    "Rossi hooked me the second that red hood, formal name drop, and whole impossible level of poise hit the screen. She feels like a fairy-tale knight pulled through industrial grime and wolf-pack politics without losing any of her elegance.",
    "This shrine exists because I love characters who carry family, ambition, and vulnerability all at once. Rossi can look completely in control while still letting flashes of youth, sincerity, and old hurt show through the armor.",
  ],
  profile: [
    {
      label: "Full Name",
      value: "Rossina Wulfperl Luppino",
    },
    {
      label: "Age / Apparent Age",
      value: "Young adult / exact age not publicly listed",
    },
    {
      label: "Birthday",
      value: "March 10",
    },
    {
      label: "Height / Weight",
      value: "Not publicly listed",
    },
    {
      label: "Species / Race",
      value: "Lupo",
    },
    {
      label: "Origin",
      value: "Arknights: Endfield",
    },
    {
      label: "Voice Actor",
      value: "Rina Hidaka (JP), Giada Sabellico (EN), Wu Zheru (CN)",
    },
    {
      label: "First Appearance",
      value: "Gamescom 2025 Special Trailer / Chapter I Process III",
    },
    {
      label: "Affiliation / Occupation",
      value: "The Pack, Endfield Industries operator, Prima Elite and future Capo candidate",
    },
  ],
  appearance: [
    {
      title: "Silhouette first, details second",
      text: "Rossi lands immediately because the silhouette does so much heavy lifting: hood, cape, sword, long line through the torso, and a posture that says she has been raised to be watched from the moment she enters a room.",
    },
    {
      title: "Color story and symbolism",
      text: "Scarlet is the obvious lead, but the black, steel, and pale accents stop the design from becoming loud. The palette reads like bloodline, pride, danger, and ceremony without ever losing control.",
    },
    {
      title: "Accessories and wolfish identity",
      text: "Her outfit folds fairy-tale red-riding imagery into Pack iconography and combat practicality. The result feels half storybook knight, half clan enforcer, which is exactly why it rules.",
    },
    {
      title: "How the design evolves",
      text: "From early trailer impressions to her full operator release and The Red Knight story framing, Rossi's presentation leans more and more into the idea that she is both a young heir and a legend she is actively trying to become.",
    },
  ],
  appearanceImages: [
    {
      src: "/rossi4.jpg",
      alt: "Rossi side portrait artwork with red hood",
      caption: "The hood does half the storytelling before she even speaks.",
    },
    {
      src: "/rossi5.jpg",
      alt: "Rossi artwork showing a cleaner ceremonial pose",
      caption: "More ceremonial, but still edged like a drawn blade.",
    },
    {
      src: "/rossi2.jpg",
      alt: "Rossi portrait focusing on expression and outfit details",
      caption: "A closer look at the sharp expression work and layered outfit.",
    },
  ],
  personality: [
    {
      title: "Core traits",
      text: "Rossi is proud, composed, deeply loyal, and just theatrical enough to be unforgettable. She clearly enjoys the gravity of her own introduction, but she also works hard to deserve it.",
    },
    {
      title: "Strengths and flaws",
      text: "She is decisive, protective, and willing to shoulder difficult work without complaint. The downside is that duty sits so close to identity for her that stubbornness, self-pressure, and image-consciousness can easily harden into isolation.",
    },
    {
      title: "Growth through the story",
      text: "The more time we spend with her, the clearer it becomes that Rossi is not just playing the role of future Capo. She is trying to grow into it without losing the parts of herself that still believe in stories, courage, and tenderness.",
    },
    {
      title: "Little habits and tells",
      text: "The full-name introduction, the rigid posture, the instinct to frame things in knightly or pack terms, and the way her softer side leaks out around children and trusted allies all make her feel far more human than the title-first image suggests.",
    },
  ],
  lore: {
    spoilerFree: [
      "Rossi is Wulfgard's younger sister and a member of the Pack, a Landbreaker clan partnered with Endfield Industries.",
      "She usually spends her time handling Pack and family matters, which means her story starts with responsibility already sitting heavily on her shoulders.",
      "Her whole character turns on a beautiful tension: she wants to be feared and respected, but she also wants to be heroic in a way that protects people instead of simply commanding them.",
    ],
    spoilers: [
      "Chapter I establishes that Rossi will stay behind and face overwhelming odds if it means the mission and her allies can keep moving, which tells you almost everything about her priorities.",
      "The Red Knight side story lets her lighten up around children, improvise a story to help someone face their fear, and admit that play, courage, and care matter to her more than she usually lets on.",
      "Her legend is something she is actively authoring. The red hood, the title, and the Pack role are not empty style choices; they are the shape she is trying to grow into.",
    ],
    hidden: [
      "A lot of Rossi's appeal is contrast: old-world fairy-tale imagery stitched onto a modern industrial frontier setting.",
      "She is easy to read as all steel at first glance, but her best scenes keep proving that her pride is tied to protection, not just ego.",
      "The Pack identity can look like pure intimidation from the outside, yet Rossi's writing often uses it to explore inheritance, performance, and what leadership costs when you are still young.",
    ],
  },
  abilities: {
    overview:
      "Rossi fights like a disciplined burst-damage operator who wants every opening to matter and every enemy to feel marked by her presence.",
    items: [
      {
        title: "Sword guard pressure",
        text: "As a Physical Guard wielding a sword, she thrives in close range and turns direct engagement into a statement rather than a compromise.",
      },
      {
        title: "Razor Clawmark and follow-up threat",
        text: "Her kit revolves around marking enemies, then exploiting those marks with follow-up damage and pressure that rewards careful setup.",
      },
      {
        title: "Lift, Vulnerable, and team synergy",
        text: "Rossi is not just selfish damage. She helps create windows for allied physical teams by converting afflictions into stronger punishment states for the enemy.",
      },
      {
        title: "Burst with bite",
        text: "Signature moments like Crimson Shadow, Razorclaw Ambush, and her wolf-blood-flavored ultimate language make her combat style feel like a controlled hunt rather than random aggression.",
      },
    ],
  },
  relationships: [
    {
      title: "Wulfgard",
      text: "Her older brother is one of the most important anchors in her story. Their connection gives her authority emotional context instead of leaving it as cool-girl posturing.",
    },
    {
      title: "The Pack",
      text: "This is family, inheritance, political weight, and identity all at once. Rossi loves the Pack enough to carry it like armor, which is exactly why its expectations cut so deep.",
    },
    {
      title: "Endministrator and Endfield allies",
      text: "Her partnership with Endfield brings out her tactical confidence but also her willingness to trust, coordinate, and protect beyond the Pack's own borders.",
    },
    {
      title: "Children and weaker civilians",
      text: "The Red Knight is where the softer truth peeks through: for all the ceremony and sharp edges, Rossi badly wants to be the kind of strong person that frightened people can rely on.",
    },
  ],
  quotes: [
    {
      theme: "pack pride",
      items: [
        {
          line: "\"Remember this well!\"",
          context: "Her signature punctuation mark: dramatic, proud, and completely earned.",
        },
        {
          line: "\"The name of the Pack will echo across the land!\"",
          context: "Victory as family honor, not just personal swagger.",
        },
        {
          line: "\"With me around, victory is a sure thing!\"",
          context: "Confidence that somehow lands as charming instead of hollow.",
        },
      ],
    },
    {
      theme: "battle steel",
      items: [
        {
          line: "\"Hunting time!\"",
          context: "Short, sharp, and exactly as wolf-coded as it needs to be.",
        },
        {
          line: "\"Scorching claws!\"",
          context: "A skill call that sounds like the red hood itself caught fire.",
        },
        {
          line: "\"No escape!\"",
          context: "Pure frontline pressure with zero wasted softness.",
        },
      ],
    },
    {
      theme: "heart under the armor",
      items: [
        {
          line: "\"This little setback means nothing... I, Rossina won't give up!\"",
          context: "Defeat lines tell you who a character really is. Rossi's says: stubbornly hopeful.",
        },
        {
          line: "\"The Pack isn't afraid of more scars!\"",
          context: "Pain is not denial for her; it is proof that survival has a cost.",
        },
        {
          line: "\"I'd like to stay a little longer.\"",
          context: "The Red Knight lets the softer, younger part of her step into the light.",
        },
      ],
    },
  ],
  gallery: [
    {
      title: "Official art and release visuals",
      note: "Where the red hood, sword line, and full Pack identity feel most polished and iconic.",
      items: [
        {
          src: "/rossi-oa1.webp",
          alt: "Rossi key art image",
          caption: "The release-era image that sells the whole character in one glance.",
        },
        {
          src: "/rossi-oa2.webp",
          alt: "Rossi polished portrait artwork",
          caption: "Ceremonial and dangerous in equal measure.",
        },
      ],
    },
    {
      title: "Story and event stills",
      note: "These are the images that make the Red Knight, Pack duty, and softer emotional beats feel connected instead of separate moods.",
      items: [
        {
          src: "/rossi2.jpg",
          alt: "Rossi story still image",
          caption: "A cleaner look at the balance between elegance and threat.",
        },
        {
          src: "/rossi4.jpg",
          alt: "Rossi side still with hood and stance details",
          caption: "The kind of pose that makes future-Capo talk sound believable.",
        },
      ],
    },
    {
      title: "Design details and red-hood studies",
      note: "Cloth shapes, cape movement, pale accents, and wolfish framing all deserve their own appreciation lane.",
      items: [
        {
          src: "/rossi-d1.jpg",
          alt: "Rossi close-up detail art",
          caption: "Expression work, clean lines, and hood framing all doing excellent work.",
        },
                {
          src: "/rossi-d2.jpg",
          alt: "Rossi close-up detail art",
          caption: "Expression work, clean lines, and hood framing all doing excellent work.",
        },
      ],
    },
    {
      title: "Fanart credit queue",
      note: "Here is where I will feature the fan artists.",
      items: [
        {
          src: "/rossi-fa1.jpg",
          alt: "Rossi fanart image",
          caption: "A placeholder for now, but I can't wait to fill this with properly credited fanart.",
        },
        {
          src: "/rossi-fa2.jpg",
          alt: "Rossi fanart image",
          caption: "A placeholder for now, but I can't wait to fill this with properly credited fanart.",
        },
      ],
    },
  ],
  personal: [
    "Rossi works on me because she feels composed from contradictions I always love: she is severe but not empty, proud but not untouchable, theatrical but still sincere. The design grabs first, but the staying power comes from the vulnerability under it.",
    "The scenes that stay with me are the ones where the mask loosens a little: the absolute commitment in battle, the family weight around Wulfgard and the Pack, and especially the Red Knight material where her storybook instincts and softer protectiveness start peeking through.",
    "What she teaches me is that style means more when it is carrying history. The hood, the full name, the posture, the blade, the titles: none of it is random. Rossi feels like someone trying to become worthy of the image she projects, and that is always compelling to me.",
  ],
  extras: [
    {
      title: "playlist",
      items: [
        "\"Red Right Hand\" for the mythic menace.",
        "\"Wolf Like Me\" for the predatory energy and confidence.",
        "\"Howl\" for the full red-hood, pack-blood, dramatic-heart vibe.",
      ],
    },
    {
      title: "moodboard",
      items: [
        "scarlet fabric in low light",
        "steel catching furnace glow",
        "wolf heraldry, old vows, and mine-road dust",
      ],
    },
    {
      title: "updates log",
      items: [
        "April 2026 - rewired the page into a long-form shrine with lore, quotes, and gallery sections.",
        "Next wish - expand this with more Red Knight notes and properly credited fanart.",
      ],
    },
  ],
  snapshot: [
    "Origin: Arknights: Endfield",
    "Core mood: red-hood myth with pack discipline",
    "Current obsession: the future-Capo presence",
  ],
  railImage: {
    src: "/rossi4.jpg",
    alt: "Rossi side rail image",
    caption: "wolfpack blessing on the left rail",
  },
  sideImage: {
    src: "/rossi3.jpg",
    alt: "Rossi sidebar image",
    caption: "the ceremonial red-hood finish on the right side",
  },
};

const Rossina = () => <CharacterShrinePage shrine={shrine} />;

export default Rossina;
