import { Button } from "./button";
import { Github, Linkedin, Twitter, Mail } from "lucide-react";
import type { SocialLink } from "@/lib/types";

export function SocialLinks({
  links,
  variant = "ghost",
  size = "icon",
  className,
}: {
  links: readonly SocialLink[];
  variant?: "ghost" | "outline";
  size?: "icon" | "default";
  className?: string;
}) {
  const getIcon = (platform: SocialLink["platform"]) => {
    switch (platform) {
      case "github":
        return Github;
      case "linkedin":
        return Linkedin;
      case "twitter":
        return Twitter;
      case "email":
        return Mail;
    }
  };

  return (
    <div className={className}>
      {links.map((link) => {
        const Icon = getIcon(link.platform);
        return (
          <Button
            key={link.platform}
            variant={variant}
            size={size}
            asChild={link.platform !== "email" || link.href.startsWith("mailto")}
          >
            {link.href ? (
              <a
                href={link.href}
                target={link.href.startsWith("http") ? "_blank" : undefined}
                rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined}
                aria-label={link.ariaLabel}
              >
                <Icon className="h-5 w-5" />
              </a>
            ) : (
              <button aria-label={link.ariaLabel}>
                <Icon className="h-5 w-5" />
              </button>
            )}
          </Button>
        );
      })}
    </div>
  );
}
