import CharacterShrinePage, {
  type CharacterShrineData,
} from "@/components/CharacterShrinePage";

const shrine: CharacterShrineData = {
  canonical: "https://mirabellier.com/shrine/kanna",
  structuredDataId: "kanna-structured-data",
  structuredData: {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: "Kanna Kamui Shrine",
    description:
      "A long-form Kanna Kamui shrine with profile notes, lore, favorite line memories, and a personal gallery.",
    url: "https://mirabellier.com/shrine/kanna",
    about: {
      "@type": "Thing",
      name: "Kanna Kamui",
      alternateName: "Kobayashi Kanna",
    },
  },
  hero: {
    name: "Kanna Kamui",
    subtitle: "My Eternal Shrine to Kanna Kamui",
    intro:
      "Small, sleepy, electric, and impossible not to adore, Kanna brings the exact kind of quiet warmth that can make even the softest scene feel unforgettable.",
    badges: [
      "quiet thunder",
      "dragon daughter comfort",
      "third-grade icon",
      "pancake-certified",
    ],
    heroImage: {
      src: "/kanna-kobayashi-poster.webp",
      alt: "Kanna Kamui key visual art",
      caption: "The soft, serious little face that started all of this.",
    },
    supportingImages: [
      {
        src: "/kanna1.jpg",
        alt: "Kanna Kamui smiling in a soft shrine image",
        caption: "",
      },
      {
        src: "/kanna2.jpg",
        alt: "Kanna Kamui portrait with cool tones",
        caption: "The tiny-dragon stare that can win any room instantly.",
      },
    ],
  },
  welcome: [
    "Ever since Kanna padded into Kobayashi's apartment with that unreadable little face, she has felt like the embodiment of comfort. She is funny without trying, powerful without posturing, and tender in a way that sneaks up on you after the joke lands.",
    "This shrine is my way of holding onto the scenes where she softens the whole world just by existing inside it: the sleepy glances, the blunt honesty, the moments where a child starving for love slowly learns what home, praise, and safety can feel like.",
  ],
  profile: [
    {
      label: "Full Name",
      value: "Kanna Kamui / Kobayashi Kanna at school",
    },
    {
      label: "Age / Apparent Age",
      value: "Ancient dragon, appears about elementary-school age in human form",
    },
    {
      label: "Birthday",
      value: "December 12 in profile listings",
    },
    {
      label: "Height / Weight",
      value: "120 cm in human-form profile listings / weight not publicly listed",
    },
    {
      label: "Species / Race",
      value: "Dragon",
    },
    {
      label: "Origin",
      value: "Miss Kobayashi's Dragon Maid (manga, anime, film)",
    },
    {
      label: "Voice Actor",
      value: "Maria Naganawa (JP), Jad Saxton (EN)",
    },
    {
      label: "First Appearance",
      value: "Manga chapter \"Tohru and Shopping\" / anime episode 1",
    },
    {
      label: "Affiliation / Occupation",
      value: "Kobayashi household, Oborozuka Elementary student",
    },
  ],
  appearance: [
    {
      title: "Silhouette and design language",
      text: "Kanna's design works because it is instantly readable: short stature, rounded shapes, tiny horns, oversized sleeves, and that feather-soft capelet shape that makes her look both mythical and huggable at once.",
    },
    {
      title: "Color symbolism",
      text: "The white, lavender, navy, and soft gold palette makes her feel like winter light and storm clouds at the same time. Even before she uses electricity, the look already whispers thunder without making her harsh.",
    },
    {
      title: "Clothing and cultural texture",
      text: "Her outfit borrows from Ainu-inspired visual cues, which gives the costume more identity than a generic cute fantasy dress. It helps her feel rooted in folklore, not just moe design.",
    },
    {
      title: "How the design evolves",
      text: "The manga keeps her sharp and quietly funny, the anime smooths her into a softer emotional shape, and the 2025 film gives her expressions even more weight when the story turns toward loneliness, family, and wanting to be praised.",
    },
  ],
  appearanceImages: [
    {
      src: "/kanna3.jpg",
      alt: "Kanna Kamui standing in a soft blue-toned image",
      caption: "Classic Kanna calm: small frame, huge presence.",
    },
    {
      src: "/kanna2.jpg",
      alt: "Kanna Kamui portrait showing her gentle expression",
      caption: "The sleepy gaze that makes the whole design work.",
    },
    {
      src: "/kanna1.jpg",
      alt: "Kanna Kamui image with brighter expression",
      caption: "A brighter look that still keeps her reserved aura.",
    },
  ],
  personality: [
    {
      title: "Core traits",
      text: "Kanna is observant, deadpan, curious, and quietly affectionate. She rarely performs her feelings loudly, which makes the moments where she reaches out or lights up feel twice as precious.",
    },
    {
      title: "Strengths and flaws",
      text: "Her biggest strengths are steadiness, loyalty, and emotional intuition. Her sharpest flaws come from insecurity: she can get jealous, test boundaries, or retreat behind pranks when she is scared of being unwanted.",
    },
    {
      title: "Growth through the story",
      text: "Early Kanna feels exiled and emotionally underfed. School, friendship, and life with Kobayashi gradually teach her that she is allowed to want comfort instead of merely enduring life.",
    },
    {
      title: "Little habits and quirks",
      text: "The tail-plug charging gag, the tiny \"Ohh\" moments, the pancake devotion, the way she evaluates chaos with one flat sentence, and the total ease with which she naps anywhere all make her feel lived-in instead of manufactured cute.",
    },
  ],
  lore: {
    spoilerFree: [
      "Kanna arrives in the human world after being pushed away from home, then slowly finds a new family inside Kobayashi's ordinary apartment life.",
      "Her story balances comedy and melancholy: one minute she is a tiny chaos gremlin, the next she is the quietest portrait of loneliness in the cast.",
      "School becomes a major part of her healing because it lets her experience childhood as something playful instead of political or performative.",
    ],
    spoilers: [
      "The deeper her bond with Kobayashi and Tohru grows, the clearer it becomes that home is not simply where she was born but where she is cherished without conditions.",
      "The 2025 film pushes directly into her relationship with Kimun Kamui, showing how badly she wants parental recognition and how painful that ache still is under her usual composure.",
      "Kanna's powers also mature alongside her heart: curiosity, science lessons, and human-world experiences all reshape how she understands and uses her draconic strength.",
    ],
    hidden: [
      "Her name and look pull from Ainu mythology and design references, which gives her thunder motif a folklore backbone rather than a random element pick.",
      "A lot of her acting happens in tiny facial changes. Kanna works because the animators trust stillness instead of forcing constant exaggeration.",
      "She is one of the clearest examples in the series that tenderness is not weakness. The softer her life becomes, the more fully herself she can be.",
    ],
  },
  abilities: {
    overview:
      "Kanna is strongest when the story lets sleepy cuteness flip, without warning, into genuine dragon force.",
    items: [
      {
        title: "Electricity absorption and discharge",
        text: "She can recharge herself with electricity and convert that energy into devastating blasts, making her powers feel playful in concept and frightening in practice.",
      },
      {
        title: "Dragon form and flight",
        text: "Even though her human form is tiny, her dragon form and aerial mobility remind you immediately that she belongs to an overwhelmingly powerful species.",
      },
      {
        title: "Thunder-based offense",
        text: "Kanna's lightning attacks are iconic because they arrive with almost no wasted motion. Her combat style feels efficient, direct, and very unlike flashy shonen posing.",
      },
      {
        title: "Protective instinct",
        text: "Her most satisfying power moments are usually tied to care. When she steps in to protect someone she loves, the contrast between her soft demeanor and raw force hits perfectly.",
      },
    ],
  },
  relationships: [
    {
      title: "Kobayashi",
      text: "The emotional center of Kanna's life. Kobayashi gives her food, routine, patience, and the everyday kind of love that slowly teaches Kanna she does not have to earn her place first.",
    },
    {
      title: "Tohru",
      text: "Tohru brings her into the human world, fusses over her like an older sister, and helps create the family structure Kanna never fully had before.",
    },
    {
      title: "Riko Saikawa",
      text: "One of the funniest and sweetest school dynamics in the series. Kanna treats Saikawa's dramatic devotion with dry honesty, but there is real affection underneath the deadpan humor.",
    },
    {
      title: "Kimun Kamui and the dragon world",
      text: "Her father and old world represent the wound at the center of her story: the longing to be seen, praised, and chosen by the people who should have loved her first.",
    },
  ],
  quotes: [
    {
      theme: "soft little line memories",
      items: [
        {
          line: "\"I'm home, Kobayashi.\"",
          context: "The kind of line that turns an apartment into a real family space.",
        },
        {
          line: "\"I like it here.\"",
          context: "Simple, quiet, and devastating because it means she finally feels safe.",
        },
        {
          line: "\"Food tastes better together.\"",
          context: "Kanna is at her cutest when meals become a love language.",
        },
      ],
    },
    {
      theme: "funny deadpan hits",
      items: [
        {
          line: "\"Saikawa is weird.\"",
          context: "Possibly the cleanest summary of that entire school dynamic.",
        },
        {
          line: "\"I'm full.\"",
          context: "Usually delivered after impossible levels of pancake destruction.",
        },
        {
          line: "\"Ohh.\"",
          context: "Peak Kanna communication: one tiny syllable, maximum emotional value.",
        },
      ],
    },
    {
      theme: "protective and honest",
      items: [
        {
          line: "\"Stop fighting.\"",
          context: "Her calm voice lands hardest when everyone else has already escalated.",
        },
        {
          line: "\"I'll do it.\"",
          context: "The moment sleepy softness turns into dragon resolve.",
        },
        {
          line: "\"I want to stay.\"",
          context: "The line memory underneath almost every part of her arc.",
        },
      ],
    },
  ],
  gallery: [
    {
      title: "Official art",
      note: "Key visuals and polished promo-style pieces that let the costume and palette breathe.",
      items: [
        {
          src: "/kanna-oa1.jpg",
          alt: "Kanna Kamui poster art",
          caption: "Poster-style art with the full soft-thunder vibe intact.",
        },
        {
          src: "/kanna-oa2.jpg",
          alt: "Kanna Kamui key art style image",
          caption: "A bright character image that feels instantly shrine-worthy.",
        },
      ],
    },
    {
      title: "Anime stills and close-ups",
      note: "The sleepy eyes, tiny smiles, and little changes in posture are where so much of her charm actually lives.",
      items: [
        {
          src: "/kanna-cu1.jpg",
          alt: "Kanna Kamui close-up still",
          caption: "Reserved, observant, and cute enough to stop time.",
        },
        {
          src: "/kanna-cu2.jpg",
          alt: "Kanna Kamui still image with softer blue lighting",
          caption: "The quiet, clouded mood that fits her perfectly.",
        },
      ],
    },
    {
      title: "Fanart credit queue",
      note: "A growing collection of fanart that captures the spirit of Kanna's design and personality.",
      items: [
        {
          src: "/kanna-fa1.jpg",
          alt: "Kanna Kamui close-up still",
          caption: "Reserved, observant, and cute enough to stop time.",
        },
        {
          src: "/kanna-fa2.jpg",
          alt: "Kanna Kamui still image with softer blue lighting",
          caption: "The quiet, clouded mood that fits her perfectly.",
        },
      ],
    },
  ],
  personal: [
    "Kanna means a lot to me because she captures a kind of softness that never feels flimsy. She can be quiet, hungry, stubborn, funny, and deeply wounded all at once, and somehow the story never lets those qualities cancel each other out.",
    "The scenes that live rent-free in my head are always the little ones: her first days at school, the way she sinks into everyday routines like she is trying not to ask for too much, the deadpan one-liners that somehow hit harder than speeches, and the moments where a tiny smile feels like a miracle.",
    "What she teaches me, over and over, is that gentleness is not a lesser form of strength. Wanting warmth, praise, and a place to belong does not make someone weak. It just makes them alive.",
  ],
  extras: [
    {
      title: "playlist",
      items: [
        "\"Aozora no Rhapsody\" for the house-full-of-chaos joy.",
        "\"Ishukan Communication\" for the sweet, silly found-family energy.",
        "\"Namida no Parade\" for the gentler movie-era ache around Kanna.",
      ],
    },
    {
      title: "moodboard",
      items: [
        "winter classroom sunlight",
        "wall outlets and static sparks",
        "lavender sleeves, syrup shine, soft clouds",
      ],
    },
    {
      title: "updates log",
      items: [
        "April 2026 - rebuilt this page into a full projects-style shrine layout.",
        "Next wish - add a properly credited fanart wall and more film-era notes.",
      ],
    },
  ],
  snapshot: [
    "Origin: Miss Kobayashi's Dragon Maid",
    "Best mood: quiet thunder with pancakes nearby",
    "Home base: Kobayashi's apartment and school life",
  ],
  railImage: {
    src: "/kanna3.jpg",
    alt: "Kanna Kamui side rail art",
    caption: "quiet guardian of the left rail",
  },
  sideImage: {
    src: "/kanna-kobayashi-poster.webp",
    alt: "Kanna Kamui poster art for sidebar",
    caption: "the blessing image that absolutely had to stay",
  },
};

const Kanna = () => <CharacterShrinePage shrine={shrine} />;

export default Kanna;
