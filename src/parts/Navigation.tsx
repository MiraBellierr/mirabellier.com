import home from "../assets/icons/img1-24.webp";
import about from "../assets/icons/img2-24.webp";
import blog from "../assets/icons/img3-24.webp";
import pics from "../assets/icons/img4-24.webp";
import cats from "../assets/icons/cats-24.webp";
import cursor from "../assets/icons/cursor-24.webp";

import { useLocation, Link } from "react-router-dom";
import ToggleCursor from "./ToggleCursor";
import { useCursor } from "../states/CursorContext";

const Navigation = () => {
    const location = useLocation();
    const { isCustomCursor } = useCursor();

    return (
        <aside className="mb-auto lg:w-[339px] bg-blue-100 border border-blue-300 rounded-xl shadow-md opacity-90">
            <nav className="space-y-2 mb-4">
              <h2 className="text-blue-600 font-bold text-lg text-center p-4">site navigation</h2>
              <div className="">
                <div className="flex justify-center">
                  <img className="h-4 w-4" src={home} alt="home icon"/>
                  <Link className="hover:animate-wiggle hover:underline" to="/">
                    <div className={location.pathname === "/" ? "text-blue-700 pl-1 text-sm text-center font-bold" : "text-blue-500 pl-1 text-sm text-center font-bold"}>home</div>
                  </Link>       
                </div>
                <div className="flex justify-center"> 
                  <img className="h-4 w-4" src={about} alt="about icon"/>
                  <Link className="hover:animate-wiggle hover:underline" to="/about">
                    <div className={location.pathname === "/about" ? "text-blue-700 pl-1 text-sm text-center font-bold" : "text-blue-500 pl-1 text-sm text-center font-bold"}>about</div>
                  </Link>
                </div>
                <div className="flex justify-center">
                  <img className="h-4 w-4" src={blog} alt="blog icon"/>
                  <Link className="hover:animate-wiggle hover:underline" to="/blog">
                    <div className={location.pathname === "/blog" ? "text-blue-700 pl-1 text-sm text-center font-bold" : "text-blue-500 pl-1 text-sm text-center font-bold"}>blog</div>
                  </Link>       
                </div>
                <div className="flex justify-center">
                  <img className="h-4 w-4" src={pics} alt="pics icon"/>
                  <Link className="hover:animate-wiggle hover:underline" to="/pics">
                    <div className={location.pathname === "/pics" ? "text-blue-700 pl-1 text-sm text-center font-bold" : "text-blue-500 pl-1 text-sm text-center font-bold"}>pics</div>
                  </Link>             
                </div>
                <div className="flex justify-center">
                  <img className="h-4 w-4" src={cats} alt="videos icon"/>
                  <Link className="hover:animate-wiggle hover:underline" to="/videos">
                    <div className={location.pathname === "/videos" ? "text-blue-700 pl-1 text-sm text-center font-bold" : "text-blue-500 pl-1 text-sm text-center font-bold"}>videos</div>
                  </Link>             
                </div>
                <div className="text-sm text-center font-bold text-blue-500">another page (maybe)</div>
                <div className="flex justify-center items-center space-x-1">
                    <img className="h-4 w-4" src={cursor} width="16" height="16" alt="cursor icon"/>
                    <ToggleCursor />
                    {!isCustomCursor && (
                      <span className="text-xs text-blue-600 font-semibold animate-pulse ml-2">← click here</span>
                    )}
                </div>
              </div>
            </nav>
          </aside>
    )
}

export default Navigation;