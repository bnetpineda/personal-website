"use client";

import { useState, type FormEvent, type ChangeEvent } from "react";
import { Send, Loader2, Check, MapPin } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { SectionHead } from "@/components/ui/section-head";
import { SOCIAL_ICONS, EmailIcon } from "@/components/ui/brand-icons";
import { CONTACT_FORM_ENDPOINT, SITE, SOCIAL_LINKS } from "@/lib/constants";

interface FormData {
  name: string;
  email: string;
  message: string;
}

interface FormErrors {
  name?: string;
  email?: string;
  message?: string;
}

type FormStatus = "idle" | "submitting" | "success" | "error";

function validate(d: FormData): FormErrors {
  const e: FormErrors = {};
  if (!d.name.trim()) e.name = "Name is required";
  else if (d.name.trim().length < 2) e.name = "At least 2 characters";
  if (!d.email.trim()) e.email = "Email is required";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) e.email = "Enter a valid email";
  if (!d.message.trim()) e.message = "Message is required";
  else if (d.message.trim().length < 10) e.message = "At least 10 characters";
  return e;
}

export function Contact() {
  const [d, setD] = useState<FormData>({ name: "", email: "", message: "" });
  const [err, setErr] = useState<FormErrors>({});
  const [status, setStatus] = useState<FormStatus>("idle");

  const ch = (k: keyof FormData) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setD((p) => ({ ...p, [k]: e.target.value }));
    if (err[k]) setErr((p) => ({ ...p, [k]: undefined }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = validate(d);
    if (Object.keys(v).length) {
      setErr(v);
      return;
    }
    setStatus("submitting");
    try {
      const res = await fetch(CONTACT_FORM_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(d),
      });
      if (res.ok) {
        setStatus("success");
        setD({ name: "", email: "", message: "" });
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  const isSubmitting = status === "submitting";

  return (
    <section className="section bg-pat" id="contact">
      <div className="wrap">
        <SectionHead
          idx="04"
          kicker="Let's build something"
          title="Get in touch"
          lead="Open to full-time roles, freelance builds and good conversations. Drop a line — I reply fast."
        />
        <div className="contact-grid">
          <Reveal className="cardx contact-card">
            {status === "success" ? (
              <div className="form-success">
                <span className="iconbtn" style={{ background: "var(--accent)", width: 60, height: 60 }}>
                  <Check size={34} />
                </span>
                <div className="big">Message sent</div>
                <p style={{ color: "var(--ink-soft)", maxWidth: "32ch" }}>
                  Thanks for reaching out — I&apos;ll get back to you soon.
                </p>
                <button className="btn btn--sm" onClick={() => setStatus("idle")}>
                  Send another
                </button>
              </div>
            ) : (
              <form onSubmit={submit} noValidate>
                <div className={`field ${err.name ? "err" : ""}`}>
                  <label htmlFor="c-name">Name</label>
                  <input
                    id="c-name"
                    value={d.name}
                    onChange={ch("name")}
                    placeholder="Juan Dela Cruz"
                    disabled={isSubmitting}
                    aria-invalid={!!err.name}
                  />
                  {err.name && <div className="msg">{err.name}</div>}
                </div>
                <div className={`field ${err.email ? "err" : ""}`}>
                  <label htmlFor="c-email">Email</label>
                  <input
                    id="c-email"
                    type="email"
                    value={d.email}
                    onChange={ch("email")}
                    placeholder="you@example.com"
                    disabled={isSubmitting}
                    aria-invalid={!!err.email}
                  />
                  {err.email && <div className="msg">{err.email}</div>}
                </div>
                <div className={`field ${err.message ? "err" : ""}`}>
                  <label htmlFor="c-msg">Message</label>
                  <textarea
                    id="c-msg"
                    value={d.message}
                    onChange={ch("message")}
                    placeholder="Tell me about the project…"
                    disabled={isSubmitting}
                    aria-invalid={!!err.message}
                  />
                  {err.message && <div className="msg">{err.message}</div>}
                </div>
                <button
                  className="btn btn--accent btn--lg"
                  type="submit"
                  disabled={isSubmitting}
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={18} className="animate-spin" /> Sending…
                    </>
                  ) : (
                    <>
                      <Send size={18} /> Send message
                    </>
                  )}
                </button>
                {status === "error" && (
                  <p className="msg" style={{ textAlign: "center", marginTop: 12 }}>
                    Something went wrong. Please try again.
                  </p>
                )}
              </form>
            )}
          </Reveal>

          <Reveal className="cardx contact-side" delay={80}>
            <h3>Direct lines</h3>
            <a className="info" href={`mailto:${SITE.email}`}>
              <span className="ic">
                <EmailIcon />
              </span>
              <span>
                <span className="k">Email</span>
                <div className="val">{SITE.email}</div>
              </span>
            </a>
            <div className="info">
              <span className="ic">
                <MapPin size={20} />
              </span>
              <span>
                <span className="k">Based in</span>
                <div className="val">Angeles City, Pampanga</div>
              </span>
            </div>
            <div className="divider" />
            <div>
              <span
                className="k mono"
                style={{ opacity: 0.6, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase" }}
              >
                Find me online
              </span>
              <div className="socrow" style={{ marginTop: 12 }}>
                {SOCIAL_LINKS.map((s) => {
                  const Icon = SOCIAL_ICONS[s.platform];
                  const ext = s.href.startsWith("http");
                  return (
                    <a
                      key={s.platform}
                      href={s.href}
                      aria-label={s.ariaLabel}
                      target={ext ? "_blank" : undefined}
                      rel={ext ? "noopener noreferrer" : undefined}
                    >
                      <Icon />
                    </a>
                  );
                })}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
