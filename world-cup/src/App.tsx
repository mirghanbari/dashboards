import { Outlet } from "react-router-dom";
import { Nav } from "./components/Nav";
import { Footer } from "./components/Footer";

export default function App() {
  return (
    <>
      <div className="pitch-stripe" />
      <Nav />
      <main className="container">
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
