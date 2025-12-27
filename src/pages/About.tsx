import Navigation from "../parts/Navigation";
import Header from "../parts/Header";
import Footer from "../parts/Footer";

import github from "../assets/github.webp";
import patreon from "../assets/patreon.webp";
import kofi from "../assets/kofi.webp";
import Divider from "../parts/Divider";

const About = () => {
  return (
    <div className="min-h-screen text-blue-900 font-[sans-serif] flex flex-col">
      <Header />
 
      <div className="min-h-screen flex flex-col bg-cover bg-no-repeat bg-scroll" style={{ backgroundImage: 'var(--page-bg)' }}>
        <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full">
          
          <div className="flex-grow flex-col">
            <Navigation />
            <div className="flex border shadow-md mt-3 rounded-lg overflow-hidden justify-center">
              <iframe className="lg:w-[339px] h-[575px] rounded-lg scrollbar-hide hidden md:block" src="https://ko-fi.com/mirabellier/?hidefeed=true&widget=true&embed=true&preview=true"></iframe>
            </div>
          </div>
    

          <main className="w-full lg:w-3/5 space-y-2 p-4">
            
            <div className="space-y-1 p-2 card-border">
              <h2 className="text-xl font-bold text-blue-700 mb-2">___🖊️Introduction</h2>
              <div className="space-y-2">
                <p>I am a software developer with over 3 years of experience using Node.js and JavaScript. I have a strong foundation in web development, with familiarity of React.JS.</p>
                <p>I have worked on a wide range of projects, including web applications, React Native mobile apps, and APIs. My Node.js skills have enabled me to efficiently develop scalable and maintainable solutions. I am constantly learning and keeping up with the latest technologies in order to improve my skills and provide the best results for my clients.</p>
                <p>In addition to my technical abilities, I am a team player who enjoys working with others to develop creative solutions to complex problems. I am committed to producing high-quality work and constantly learning and improving my skills.</p>
                <p>I am eager to continue my career in software development and am confident in my ability to contribute to any team.</p>
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
              <img className="h-101 rounded-2xl" src="https://media1.tenor.com/m/8o3YhF-eByUAAAAC/kanna-kamui.gif"/>
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