import { useEffect } from "react";
import Navigation from "../parts/Navigation";
import Header from "../parts/Header";
import Footer from "../parts/Footer";

import github from "../assets/github.webp";
import patreon from "../assets/patreon.webp";
import kofi from "../assets/kofi.webp";
import Divider from "../parts/Divider";
import kannaWink from '@/assets/anime/kanna-wink.webp'

const About = () => {
  useEffect(() => {
    // Update canonical URL to point to the About page
    const canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (canonicalLink) {
      canonicalLink.href = 'https://mirabellier.com/about';
    }

    // Add structured data for rich results
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'about-structured-data';
    script.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "AboutPage",
      "name": "About Mirabellier",
      "description": "Full Stack Developer with 3 years of experience in React and NodeJS",
      "url": "https://mirabellier.com/about",
      "mainEntity": {
        "@type": "Person",
        "name": "Mirabellier",
        "jobTitle": "Full Stack Developer",
        "knowsAbout": ["JavaScript", "NodeJS", "TypeScript", "React", "React Native"],
        "url": "https://mirabellier.com",
        "sameAs": [
          "https://github.com/MiraBellierr",
          "https://www.patreon.com/c/jasminebot/",
          "https://ko-fi.com/mirabellier"
        ]
      }
    });
    document.head.appendChild(script);

    // Cleanup: restore homepage canonical when unmounting
    return () => {
      const canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
      if (canonicalLink) {
        canonicalLink.href = 'https://mirabellier.com/';
      }
      const oldScript = document.getElementById('about-structured-data');
      if (oldScript) oldScript.remove();
    };
  }, []);

  return (
    <div className="min-h-screen text-blue-900 font-[sans-serif] flex flex-col">
      <Header />
 
      <div className="min-h-screen flex flex-col bg-cover bg-no-repeat bg-scroll" style={{ backgroundImage: 'var(--page-bg)' }}>
        <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full">
          
          <div className="flex-grow flex-col">
            <Navigation />
            <div className="flex border shadow-md mt-3 rounded-lg overflow-hidden justify-center">
              <iframe className="lg:w-[339px] h-[575px] rounded-lg hidden md:block" style={{scrollbarWidth: 'none', msOverflowStyle: 'none'}} src="https://ko-fi.com/mirabellier/?hidefeed=true&widget=true&embed=true&preview=true"></iframe>
            </div>
          </div>
    

          <main className="w-full lg:w-3/5 space-y-2 p-4">
            
            <div className="space-y-1 p-2 card-border">
              <h2 className="text-xl font-bold text-blue-700 mb-2">___🖊️Introduction</h2>
              <div className="space-y-2">
                <p>I'm a Full Stack Developer with just 3 years of experience. I'm good in web development using React and NodeJS.</p>
                <p>I also have worked on many projects, web apps, React Native mobile apps, and APIs. My skills have moved me forward. I want to learn more and keep up with the technologies so i can improve my skills.</p>
                <p>Plus, I able to help if you guys are having problems with React or NodeJS. I hope my skills are useful to you guys.</p>
                <p>Next step, I hope i can use my skills to find a <del>job</del>.</p>
              </div>
            </div>

            <Divider />

            <div className="space-y-2 p-2 card-border">
              <h2 className="text-xl font-bold text-blue-700 mb-2">📂 Projects</h2>
              <div className="space-y-2 pt-2">
                <h3 className="font-bold text-blue-300">1. Jasmine (<a className="underline hover:animate-wiggle" href="https://github.com/MiraBellierr/jasmine">Github</a>)</h3>
                <p className="text-sm">A Discord bot I casually developed to keep me learning NodeJS and the fundamentals of REST APIs. The algorithms and the fundamentals of RPG games in turn-based games, the item system, economy system, critical attacks, and luck-based games are strongly used in this project.</p>
              </div>
              <div className="space-y-2 pt-2">
                <h3 className="font-bold text-blue-300">2. Appointment Mobile Application</h3>
                <p className="text-sm">A mobile application for my Final Year Project. The development include using NodeJS, Appwrite, and React Native. The features include a login and sign-up system, notification system, and calendar system.</p>
              </div>
              <div className="space-y-2 pt-2">
                <h3 className="font-bold text-blue-300">3. Conference - Attendance Based Mobile Application</h3>
                <p className="text-sm">This is a client project. It's a mobile application developed using React Native and Firebase. The features include an import system from spreadsheet, QR scanning for attendance, and the announcement system.</p>
              </div>
            </div>

          </main>

          <div className="flex-col space-y-4">
            <aside className="w-full lg:w-[200px] mb-auto bg-blue-100 border border-blue-300 rounded-xl shadow-md p-4 opacity-90">
              <div className="space-y-2 text-sm text-center font-bold">
                <h2 className="text-blue-600 font-bold text-lg">Skills</h2>
                <p className="text-blue-500">1. Javascript</p>
                <p className="text-blue-500">2. NodeJS</p>
                <p className="text-blue-500">3. TypeScript</p>
                <p className="text-blue-500">4. React</p>
                <p className="text-blue-500">5. React Native</p>
      
              </div>
            </aside>

            <div className=" mt-3 mb-auto lg:w-[200px] flex justify-center">
              <img className="h-101 rounded-2xl" src={kannaWink} width="300" height="404" alt="kanna gif" />
            </div>

            <aside className="w-full lg:w-[200px] mb-auto bg-blue-100 border border-blue-300 rounded-xl shadow-md p-4 opacity-90">
              <div className="space-y-2 text-sm text-center font-bold">
                <h2 className="text-blue-600 font-bold text-lg">Support me!!</h2>
                  <a href="https://github.com/MiraBellierr" target="_blank" rel="noopener noreferrer" className="flex flex-row space-x-1 justify-center hover:animate-wiggle">
                    <img src={github} alt="GitHub" className="h-4 w-4 rounded-full" />
                    <p className="text-blue-500">Github</p>
                  </a>
                  <a href="https://www.patreon.com/c/jasminebot/" target="_blank" rel="noopener noreferrer" className="flex flex-row space-x-1 justify-center hover:animate-wiggle">
                    <img src={patreon} alt="GitHub" className="h-4 w-4 rounded-full" />
                    <p className="text-blue-500">Patreon</p>
                  </a>
                  <a href="https://ko-fi.com/mirabellier" target="_blank" rel="noopener noreferrer" className="flex flex-row space-x-1 justify-center hover:animate-wiggle">
                    <img src={kofi} alt="GitHub" className="h-4 w-4 rounded-full" />
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
}

export default About;