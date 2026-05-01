import { useEffect, useState, type CSSProperties } from "react";

import Navigation from "../parts/Navigation";
import Header from "../parts/Header";
import Footer from "../parts/Footer";
import github from "../assets/github.webp";
import patreon from "../assets/patreon.webp";
import kofi from "../assets/kofi.webp";
import Divider from "../parts/Divider";
import kannaWink from "@/assets/anime/kanna-wink.webp";
import { fetchGuestbookEntries, type GuestbookEntry } from "@/lib/guestbook-api";
import { usePageSeo } from "@/lib/seo";

const handwrittenStyle: CSSProperties = {
  fontFamily: '"Comic Sans MS", "Segoe Print", "Bradley Hand", cursive',
};

const graphColors = [
  { fill: "#dbeafe", stroke: "#60a5fa" },
  { fill: "#fce7f3", stroke: "#f472b6" },
  { fill: "#dcfce7", stroke: "#34d399" },
  { fill: "#fef3c7", stroke: "#f59e0b" },
  { fill: "#ede9fe", stroke: "#8b5cf6" },
  { fill: "#cffafe", stroke: "#06b6d4" },
];

const chartHeight = 132;
const chartBottomY = 194;
const maxYAxisTicks = 10;

type NoteGraphStat = {
  dateKey: string;
  label: string;
  value: number;
  fill: string;
  stroke: string;
};

function getDateKey(createdAt: string) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function formatDateLabel(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function createFallbackDateKeys(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (count - 1 - index));
    return date.toISOString().slice(0, 10);
  });
}

function getNiceTickStep(maxValue: number) {
  if (maxValue <= maxYAxisTicks) {
    return 1;
  }

  const rawStep = Math.ceil(maxValue / maxYAxisTicks);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalizedStep = rawStep / magnitude;

  if (normalizedStep <= 1) {
    return magnitude;
  }

  if (normalizedStep <= 2) {
    return magnitude * 2;
  }

  if (normalizedStep <= 5) {
    return magnitude * 5;
  }

  return magnitude * 10;
}

function buildYAxis(maxValue: number) {
  const step = getNiceTickStep(maxValue);
  const chartMaxValue = Math.max(step, Math.ceil(maxValue / step) * step);
  const ticks = Array.from(
    { length: Math.ceil(chartMaxValue / step) },
    (_, index) => (index + 1) * step,
  );

  return {
    chartMaxValue,
    ticks,
  };
}

const About = () => {
  const [guestbookEntries, setGuestbookEntries] = useState<GuestbookEntry[]>(
    [],
  );
  const [guestbookLoading, setGuestbookLoading] = useState(true);

  usePageSeo({
    canonical: "https://mirabellier.com/about",
    structuredDataId: "about-structured-data",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "AboutPage",
      name: "About Mirabellier",
      description:
        "Full Stack Developer with 3 years of experience in React and NodeJS",
      url: "https://mirabellier.com/about",
      mainEntity: {
        "@type": "Person",
        name: "Mirabellier",
        jobTitle: "Full Stack Developer",
        knowsAbout: [
          "JavaScript",
          "NodeJS",
          "TypeScript",
          "React",
          "React Native",
        ],
        url: "https://mirabellier.com",
        sameAs: [
          "https://github.com/MiraBellierr",
          "https://www.patreon.com/c/jasminebot/",
          "https://ko-fi.com/mirabellier",
        ],
      },
    },
  });

  useEffect(() => {
    let cancelled = false;

    const loadGuestbookStats = async () => {
      try {
        const entries = await fetchGuestbookEntries();
        if (!cancelled) {
          setGuestbookEntries(entries);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load guestbook entries:", error);
        }
      } finally {
        if (!cancelled) {
          setGuestbookLoading(false);
        }
      }
    };

    void loadGuestbookStats();

    return () => {
      cancelled = true;
    };
  }, []);

  const noteCountsByDate = guestbookEntries.reduce((map, entry) => {
    const key = getDateKey(entry.createdAt);
    if (!key) {
      return map;
    }

    map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map<string, number>());

  const sortedDateCounts = Array.from(noteCountsByDate.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  const dateBuckets =
    sortedDateCounts.length > 0
      ? sortedDateCounts.slice(-6)
      : createFallbackDateKeys(6).map(
          (dateKey) => [dateKey, 0] as [string, number],
        );

  const dateGraphStats: NoteGraphStat[] = dateBuckets.map(
    ([dateKey, value], index) => ({
      dateKey,
      label: formatDateLabel(dateKey),
      value,
      ...graphColors[index % graphColors.length],
    }),
  );

  const maxDateValue = Math.max(
    ...dateGraphStats.map((section) => section.value),
    1,
  );
  const { chartMaxValue, ticks: yAxisTicks } = buildYAxis(maxDateValue);

  const latestNoteDate =
    sortedDateCounts.length > 0
      ? formatDateLabel(sortedDateCounts[sortedDateCounts.length - 1][0])
      : "--";

  return (
    <div className="min-h-screen text-blue-900 font-[sans-serif] flex flex-col">
      <Header />

      <div
        className="flex flex-1 flex-col bg-cover bg-no-repeat bg-scroll"
        style={{ backgroundImage: "var(--page-bg)" }}
      >
        <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full">
          <div className="left-side-rail flex-grow flex-col">
            <Navigation />
            <div className="mt-3 flex justify-center overflow-hidden rounded-lg border shadow-md">
              <iframe
                className="hidden h-[575px] rounded-lg md:block lg:w-[339px]"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                src="https://ko-fi.com/mirabellier/?hidefeed=true&widget=true&embed=true&preview=true"
              ></iframe>
            </div>
          </div>

          <main className="w-full lg:w-3/5 space-y-2 p-4">
            <div className="space-y-1 p-2 card-border">
              <h2 className="mb-2 text-xl font-bold text-blue-700">
                ___🖊️ Introduction
              </h2>
              <div className="space-y-2">
                <p>
                  I&apos;m a Full Stack Developer with 3 years of experience in
                  web development using React and NodeJS.
                </p>
                <p>
                  I have worked on websites, APIs, bots, and mobile apps. My
                  goal is to keep improving, stay current with the stack, and
                  keep shipping things that are useful.
                </p>
                <p>
                  I can also help when people get stuck with React or NodeJS.
                  I want the skills I have picked up to be practical for other
                  people too.
                </p>
                <p>
                  Next step, I want to keep turning that work into bigger and
                  better opportunities.
                </p>
              </div>
            </div>

            <Divider variant="image" />

            <section className="card-border p-3">
              <div>
                <div className="space-y-2">
                  <h2 className="mb-2 text-xl font-bold text-blue-700">
                    📊 Visitor Graph (˶ᵔ ᵕ ᵔ˶)
                  </h2>

                  <p
                    className="max-w-2xl text-[15px] leading-7 text-slate-700"
                    style={handwrittenStyle}
                  >
                    If you sign your attendance in the guestbook, the visitor graph will change! ^-^
                  </p>
                </div>

                <div className="mt-6 rounded-[1.5rem] border-2 border-dashed border-blue-200 bg-white/75 p-4 shadow-sm">
                  <div
                    className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold text-blue-600"
                    style={handwrittenStyle}
                  >
                    <span>graph: visitors by date</span>
                    <span>last visitor on: {guestbookLoading ? "..." : latestNoteDate}</span>
                  </div>

                  <svg
                    viewBox="0 0 420 250"
                    className="mt-3 w-full"
                    role="img"
                    aria-label="Hand-drawn style bar graph of guestbook notes by date"
                  >
                    <path
                      d="M42 24 Q34 116 44 202"
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="4"
                      strokeLinecap="round"
                    />
                    <path
                      d="M36 196 Q214 206 394 190"
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="4"
                      strokeLinecap="round"
                    />

                    {yAxisTicks.map((stepValue) => {
                      const y =
                        chartBottomY - (stepValue / chartMaxValue) * chartHeight;

                      return (
                        <g key={stepValue}>
                          <path
                            d={`M42 ${y} Q212 ${y + 5} 388 ${y - 1}`}
                            fill="none"
                            stroke="#bfdbfe"
                            strokeWidth="2"
                            strokeDasharray="5 8"
                            strokeLinecap="round"
                          />
                          <text
                            x="28"
                            y={y}
                            fill="#60a5fa"
                            fontSize="12"
                            textAnchor="end"
                            dominantBaseline="middle"
                            style={handwrittenStyle}
                          >
                            {stepValue}
                          </text>
                        </g>
                      );
                    })}

                    {dateGraphStats.map((section, index) => {
                      const barHeight =
                        (section.value / chartMaxValue) * chartHeight || 0;
                      const visibleHeight = guestbookLoading
                        ? 18
                        : Math.max(barHeight, section.value > 0 ? 24 : 10);
                      const x =
                        64 +
                        index *
                          (dateGraphStats.length > 1
                            ? 280 / (dateGraphStats.length - 1)
                            : 0);
                      const y = chartBottomY - visibleHeight;
                      const rotate = index % 2 === 0 ? -1.4 : 1.4;

                      return (
                        <g key={section.dateKey}>
                          <rect
                            x={x}
                            y={y}
                            width="34"
                            height={visibleHeight}
                            rx="14"
                            fill={section.fill}
                            stroke={section.stroke}
                            strokeWidth="3"
                            transform={`rotate(${rotate} ${x + 17} ${y + visibleHeight / 2})`}
                          />
                          <path
                            d={`M${x + 4} ${y + 12} Q${x + 16} ${y + 2} ${x + 30} ${y + 10}`}
                            fill="none"
                            stroke={section.stroke}
                            strokeWidth="2.5"
                            strokeLinecap="round"
                          />
                          <text
                            x={x + 10}
                            y={y - 8}
                            fill={section.stroke}
                            fontSize="15"
                            fontWeight="700"
                            style={handwrittenStyle}
                          >
                            {guestbookLoading ? "?" : section.value}
                          </text>
                          <text
                            x={x - 10}
                            y="224"
                            fill="#2563eb"
                            fontSize="12"
                            style={handwrittenStyle}
                          >
                            {section.label}
                          </text>
                        </g>
                      );
                    })}

                    <text
                      x="12"
                      y="18"
                      fill="#2563eb"
                      fontSize="14"
                      style={handwrittenStyle}
                    >
                      notes
                    </text>
                    <text
                      x="344"
                      y="245"
                      fill="#2563eb"
                      fontSize="14"
                      style={handwrittenStyle}
                    >
                      dates
                    </text>
                  </svg>

                  <div
                    className="mt-4 flex flex-wrap gap-2 text-sm text-blue-600"
                    style={handwrittenStyle}
                  >
                  </div>
                </div>
              </div>
            </section>
          </main>

          <div className="flex-col space-y-4">
            <aside className="right-side-panel w-full lg:w-[200px] mb-auto bg-blue-100 border border-blue-300 rounded-xl shadow-md p-4 opacity-90">
              <div className="space-y-2 text-sm text-center font-bold">
                <h2 className="text-blue-600 font-bold text-lg">Skills</h2>
                <p className="text-blue-500">1. JavaScript</p>
                <p className="text-blue-500">2. NodeJS</p>
                <p className="text-blue-500">3. TypeScript</p>
                <p className="text-blue-500">4. React</p>
                <p className="text-blue-500">5. React Native</p>
              </div>
            </aside>

            <div className="mt-3 mb-auto flex justify-center lg:w-[200px]">
              <img
                className="h-101 rounded-2xl"
                src={kannaWink}
                width="300"
                height="404"
                alt="kanna gif"
              />
            </div>

            <aside className="right-side-panel w-full lg:w-[200px] mb-auto bg-blue-100 border border-blue-300 rounded-xl shadow-md p-4 opacity-90">
              <div className="space-y-2 text-sm text-center font-bold">
                <h2 className="text-blue-600 font-bold text-lg">
                  Support me!!
                </h2>
                <a
                  href="https://github.com/MiraBellierr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-row justify-center space-x-1 hover:animate-wiggle"
                >
                  <img
                    src={github}
                    alt="GitHub"
                    className="h-4 w-4 rounded-full"
                  />
                  <p className="text-blue-500">Github</p>
                </a>
                <a
                  href="https://www.patreon.com/c/jasminebot/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-row justify-center space-x-1 hover:animate-wiggle"
                >
                  <img
                    src={patreon}
                    alt="Patreon"
                    className="h-4 w-4 rounded-full"
                  />
                  <p className="text-blue-500">Patreon</p>
                </a>
                <a
                  href="https://ko-fi.com/mirabellier"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-row justify-center space-x-1 hover:animate-wiggle"
                >
                  <img
                    src={kofi}
                    alt="Ko-fi"
                    className="h-4 w-4 rounded-full"
                  />
                  <p className="text-blue-500">Ko-fi</p>
                </a>
              </div>
            </aside>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default About;
