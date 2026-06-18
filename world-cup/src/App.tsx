import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Nav } from "./components/Nav";
import { Footer } from "./components/Footer";

// Reset scroll to the top on every route change so navigating via the top nav
// (or to a detail page) always lands at the top rather than the previous page's
// scroll position.
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <div className="pitch-stripe" />
      <Nav />
      <main className="container">
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
