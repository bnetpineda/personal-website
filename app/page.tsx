import { Hero } from "@/components/sections/Hero";
import { About } from "@/components/sections/About";
import { Skills } from "@/components/sections/Skills";
import { Projects } from "@/components/sections/Projects";
import { Contact } from "@/components/sections/Contact";
import { Footer } from "@/components/sections/Footer";
import { MarqueeStrip } from "@/components/ui/marquee-strip";
import { MARQUEE_ITEMS } from "@/lib/constants";

export default function Home() {
  return (
    <div className="site">
      <Hero />
      <MarqueeStrip items={MARQUEE_ITEMS} />
      <About />
      <Projects />
      <Skills />
      <Contact />
      <Footer />
    </div>
  );
}
