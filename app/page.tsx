import { Hero } from "@/components/sections/Hero";
import { About } from "@/components/sections/About";
import { Skills } from "@/components/sections/Skills";
import { Projects } from "@/components/sections/Projects";
import { Contact } from "@/components/sections/Contact";

export default function Home() {
  return (
    <main>
      <Hero />
      <About />
      <Projects />
      <Skills />
      <Contact />
      <footer className="py-8 px-4 border-t-2 border-border text-center">
        <p className="text-foreground/60 text-sm">
          &copy; {new Date().getFullYear()} Mark Bennett N. Pineda. All rights reserved.
        </p>
      </footer>
    </main>
  );
}
