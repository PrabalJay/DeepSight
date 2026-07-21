import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import Features from "./components/Features";
import Upload from "./pages/Upload";

function Home() {
  return (
    <>
      <Navbar />
      <Hero />
      <Features />
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/upload" element={<Upload />} />
    </Routes>
  );
}