import type { ReactNode } from "react";

import Divider from "@/parts/Divider";
import Footer from "@/parts/Footer";
import Header from "@/parts/Header";
import Navigation from "@/parts/Navigation";
import { usePageSeo } from "@/lib/seo";

export type ShrineImage = {
  src: string;
  alt: string;
  caption: string;
};

export type ShrineDetail = {
  title: string;
  text: string;
};

export type ShrineStat = {
  label: string;
  value: string;
};

export type ShrineQuote = {
  line: string;
  context: string;
};

export type ShrineQuoteGroup = {
  theme: string;
  items: ShrineQuote[];
};

export type ShrineGalleryGroup = {
  title: string;
  note: string;
  items?: ShrineImage[];
};

export type ShrineExtraGroup = {
  title: string;
  items: string[];
};

export type CharacterShrineData = {
  canonical: string;
  structuredDataId: string;
  structuredData: Record<string, unknown>;
  hero: {
    name: string;
    subtitle: string;
    intro: string;
    badges: string[];
    heroImage: ShrineImage;
    supportingImages: ShrineImage[];
  };
  welcome: string[];
  profile: ShrineStat[];
  appearance: ShrineDetail[];
  appearanceImages: ShrineImage[];
  personality: ShrineDetail[];
  lore: {
    spoilerFree: string[];
    spoilers: string[];
    hidden: string[];
  };
  abilities: {
    overview: string;
    items: ShrineDetail[];
  };
  relationships: ShrineDetail[];
  quotes: ShrineQuoteGroup[];
  gallery: ShrineGalleryGroup[];
  personal: string[];
  extras: ShrineExtraGroup[];
  snapshot: string[];
  railImage: ShrineImage;
  sideImage: ShrineImage;
};

type CharacterShrinePageProps = {
  shrine: CharacterShrineData;
};

type SectionCardProps = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
};

type PhotoCardProps = {
  image: ShrineImage;
  className?: string;
  loading?: "eager" | "lazy";
  imageClassName?: string;
};

function PhotoCard({
  image,
  className = "",
  loading = "lazy",
  imageClassName = "h-full w-full rounded-[1.2rem] object-cover object-top",
}: PhotoCardProps) {
  return (
    <figure
      className={`overflow-hidden ${className}`}
    >
      <img
        className={imageClassName}
        src={image.src}
        alt={image.alt}
        loading={loading}
        fetchPriority={loading === "eager" ? "high" : undefined}
        decoding="async"
      />
    </figure>
  );
}

function SectionCard({
  id,
  eyebrow,
  title,
  description,
  children,
}: SectionCardProps) {
  return (
    <section id={id} className="card-border space-y-4 p-4 scroll-mt-24">
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-400">
          {eyebrow}
        </p>
        <h2 className="site-display text-2xl font-bold text-blue-700 lg:text-3xl">
          {title}
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-slate-700">
          {description}
        </p>
      </div>

      {children}
    </section>
  );
}

function GalleryGroup({ group }: { group: ShrineGalleryGroup }) {
  return (
    <article className="p-1">
      <div className="space-y-2">
        <h3 className="text-md font-bold text-blue-700">{group.title}</h3>
        <p className="text-sm leading-6 text-slate-700">{group.note}</p>
      </div>

      {group.items?.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {group.items.map((item, index) => (
            <PhotoCard
              key={`${group.title}-${item.src}`}
              image={item}
              loading={index === 0 ? "eager" : "lazy"}
              imageClassName="h-56 w-full rounded-[1.2rem] object-cover object-top"
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-blue-200 p-4 text-sm leading-6 text-slate-700">
          Waiting for properly credited additions.
        </div>
      )}
    </article>
  );
}

const CharacterShrinePage = ({ shrine }: CharacterShrinePageProps) => {
  usePageSeo({
    canonical: shrine.canonical,
    structuredDataId: shrine.structuredDataId,
    structuredData: shrine.structuredData,
  });

  return (
    <div className="shrine-page min-h-screen flex flex-col font-[sans-serif] text-blue-900">
      <Header />

      <div
        className="flex flex-1 flex-col bg-cover bg-no-repeat bg-scroll"
        style={{ backgroundImage: "var(--page-bg)" }}
      >
        <div className="mx-auto flex w-full max-w-7xl flex-grow flex-col gap-4 p-4 lg:flex-row">
          <div className="left-side-rail flex-grow flex-col">
            <Navigation />

            <div className="mt-3 hidden justify-center lg:flex">
              <PhotoCard
                image={shrine.railImage}
                imageClassName="h-[420px] w-full rounded-[1.2rem] object-cover object-top rounded-[1.5rem] border border-blue-100 p-2 shadow-md"
              />
            </div>
          </div>

          <main className="w-full space-y-4 p-4 lg:w-3/5">
            <section
              id="landing"
              className="card-border space-y-4 p-4 scroll-mt-24"
            >
              <div className="grid gap-5 text-center lg:items-center">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <h1 className="site-display text-3xl font-bold text-blue-700 sm:text-4xl lg:text-5xl">
                      {shrine.hero.name}
                    </h1>
                    <p className="text-base font-semibold leading-7 text-blue-500 lg:text-lg">
                      {shrine.hero.subtitle}
                    </p>
                  </div>

                  <p className="max-w-2xl text-[15px] leading-7 text-slate-700">
                    {shrine.hero.intro}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {shrine.hero.supportingImages.map((image, index) => (
                  <PhotoCard
                    key={image.src}
                    image={image}
                    loading={index === 0 ? "eager" : "lazy"}
                    imageClassName="h-48 w-full rounded-[1.2rem] object-cover object-top"
                  />
                ))}
              </div>
            </section>

            <SectionCard
              id="introduction"
              eyebrow=""
              title="Introduction ⋆˚✿˖°"
              description=""
            >
              <div className="space-y-3">
                {shrine.welcome.map((paragraph) => (
                  <p key={paragraph} className="text-sm leading-6 text-slate-700">
                    {paragraph}
                  </p>
                ))}
              </div>
            </SectionCard>

            <SectionCard
              id="profile"
              eyebrow=""
              title="Character Profile ⋆˚✿˖°"
              description=""
            >
              <dl className="grid gap-3">
                {shrine.profile.map((item, index) => (
                  <div
                    key={item.label}
                    className="p-1"
                  >
                    <dt className="text-md font-bold text-blue-700">
                      {index + 1}. {item.label}
                    </dt>
                    <dd className="text-sm text-slate-700 leading-6">
                      {item.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </SectionCard>

            <SectionCard
              id="appearance"
              eyebrow=""
              title="Appearance ⋆˚✿˖°"
              description=""
            >
              <div className="grid gap-4">
                <div className="grid gap-3">
                  {shrine.appearance.map((item, index) => (
                    <article
                      key={item.title}
                      className="p-1"
                    >
                      <h3 className="text-md font-bold text-blue-700">
                        {index + 1}. {item.title}
                      </h3>
                      <p className=" text-sm text-slate-700 leading-6">
                        {item.text}
                      </p>
                    </article>
                  ))}
                </div>
              </div>
            </SectionCard>

            <SectionCard
              id="personality"
              eyebrow=""
              title="Personality ⋆˚✿˖°"
              description=""
            >
              <div className="grid gap-3">
                {shrine.personality.map((item, index) => (
                  <article
                    key={item.title}
                    className="p-1"
                  >
                    <h3 className="text-md font-bold text-blue-700">
                      {index + 1}. {item.title}
                    </h3>
                    <p className="text-sm text-slate-700 leading-6">
                      {item.text}
                    </p>
                  </article>
                ))}
              </div>
            </SectionCard>

            <SectionCard
              id="lore"
              eyebrow=""
              title="Backstory & Lore ⋆˚✿˖°"
              description=""
            >
              <div className="grid gap-4">
                <article className="p-1">
                  <h3 className="text-md font-bold text-blue-700">
                    Spoiler-free
                  </h3>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700 marker:text-blue-400">
                    {shrine.lore.spoilerFree.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>

                <article className="p-1">
                  <h3 className="text-md font-bold text-blue-700">
                    Spoiler corner
                  </h3>
                  <ul className=" mt-3 list-disc space-y-2 pl-5 text-sm leading-6 marker:text-blue-400 bg-black text-black hover:bg-transparent hover:text-slate-700">
                    {shrine.lore.spoilers.map((item) => (
                      <li className="" key={item}>{item}</li>
                    ))}
                  </ul>
                </article>

                <article className="p-1">
                  <h3 className="text-md font-bold text-blue-700">
                    Hidden lore
                  </h3>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700 marker:text-blue-400">
                    {shrine.lore.hidden.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>
              </div>
            </SectionCard>

            <SectionCard
              id="abilities"
              eyebrow=""
              title="Abilities & Powers ⋆˚✿˖°"
              description=""
            >
              <div className="grid gap-3">
                {shrine.abilities.items.map((item, index) => (
                  <article
                    key={item.title}
                    className="p-1"
                  >
                    <h3 className="text-md font-bold text-blue-700">
                      {index + 1}. {item.title}
                    </h3>
                    <p className="text-sm leading-6 text-slate-700">
                      {item.text}
                    </p>
                  </article>
                ))}
              </div>
            </SectionCard>

            <SectionCard
              id="relationships"
              eyebrow=""
              title="Relationships ⋆˚✿˖°"
              description=""
            >
              <div className="grid gap-3">
                {shrine.relationships.map((item, index) => (
                  <article
                    key={item.title}
                    className="p-1"
                  >
                    <h3 className="text-md font-bold text-blue-700">
                      {index + 1}. {item.title}
                    </h3>
                    <p className="text-sm leading-6 text-slate-700">
                      {item.text}
                    </p>
                  </article>
                ))}
              </div>
            </SectionCard>

            <SectionCard
              id="quotes"
              eyebrow=""
              title="Favorite Quotes ⋆˚✿˖°"
              description=""
            >
              <div className="grid gap-4">
                {shrine.quotes.map((group, index) => (
                  <article
                    key={group.theme}
                    className="p-1"
                  >
                    <h3 className="text-md font-bold capitalize text-blue-700">
                      {index + 1}. {group.theme}
                    </h3>

                    <div className="">
                      {group.items.map((item) => (
                        <blockquote
                          key={item.line}
                          className="p-1"
                        >
                          <p className="ml-2 text-sm leading-6 text-slate-700">
                            ➤ {item.line}
                          </p>
                        </blockquote>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </SectionCard>

            <SectionCard
              id="gallery"
              eyebrow=""
              title="Gallery ⋆˚✿˖°"
              description=""
            >
              <div className="">
                {shrine.gallery.map((group) => (
                  <GalleryGroup key={group.title} group={group} />
                ))}
              </div>
            </SectionCard>

            <SectionCard
              id="personal"
              eyebrow=""
              title="Why I Love Them ⋆˚✿˖°"
              description=""
            >
              <div className="space-y-3">
                {shrine.personal.map((paragraph) => (
                  <p key={paragraph} className="text-[15px] leading-6 text-slate-700">
                    {paragraph}
                  </p>
                ))}
              </div>
            </SectionCard>

            <SectionCard
              id="extras"
              eyebrow=""
              title="Extras ⋆˚✿˖°"
              description=""
            >
              <div className="grid gap-3">
                {shrine.extras.map((group) => (
                  <article
                    key={group.title}
                    className="p-1"
                  >
                    <h3 className="text-md font-bold lowercase text-blue-700">
                      {group.title}
                    </h3>
                    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700 marker:text-blue-400">
                      {group.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </SectionCard>

            <Divider />
          </main>

          <aside className="w-full space-y-4 lg:w-[220px]">
            <div className="hidden lg:block">
              <PhotoCard
                image={shrine.sideImage}
                imageClassName="min-h-[260px] w-full rounded-[1.2rem] object-cover object-top rounded-[1.5rem] border border-blue-100 p-2 shadow-md"
              />
            </div>
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default CharacterShrinePage;
