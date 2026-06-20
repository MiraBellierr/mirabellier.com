import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="site-display grid gap-3 border-b-2 border-blue-300 bg-blue-50 p-4 text-sm font-bold text-blue-600 shadow-sm dark:border-purple-500/30 dark:bg-gradient-to-r dark:from-purple-900/40 dark:to-pink-900/30 dark:text-purple-200 sm:grid-cols-3 sm:items-center">
      <span className="tracking-tight text-left">
        Made with love ❤️ by mirabellier
      </span>
      <nav
        aria-label="Legal"
        className="flex items-center justify-center gap-3"
      >
        <Link className="underline underline-offset-4 hover:text-pink-600" to="/privacy">
          Privacy
        </Link>
        <span aria-hidden="true">✿</span>
        <Link className="underline underline-offset-4 hover:text-pink-600" to="/terms">
          Terms
        </Link>
      </nav>
      <p className="tracking-tight text-left sm:text-right">I love ya!! ❤️</p>
    </footer>
  );
};

export default Footer;
