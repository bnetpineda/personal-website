import { Mail, MapPin } from "lucide-react";
import type { ContactInfo } from "@/lib/types";

export function ContactInfoItem({ info }: { info: ContactInfo }) {
  const Icon = info.type === "email" ? Mail : MapPin;

  return (
    <div className="flex items-center gap-4">
      <div className="bg-main p-3 border-4 border-border">
        <Icon className="h-5 w-5 text-main-foreground" />
      </div>
      <div>
        <p className="text-sm text-foreground/60">{info.label}</p>
        {info.href ? (
          <a
            href={info.href}
            className="font-heading hover:text-main transition-colors"
          >
            {info.value}
          </a>
        ) : (
          <p className="font-heading">{info.value}</p>
        )}
      </div>
    </div>
  );
}
