"use client";

import { useState, type FormEvent, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FadeIn, StaggerContainer, StaggerItem } from "@/components/ui/motion";
import { Send, Loader2, CheckCircle } from "lucide-react";
import { CONTACT_FORM_ENDPOINT, CONTACT_INFO, SOCIAL_LINKS } from "@/lib/constants";
import { ContactInfoItem } from "@/components/ui/contact-info-item";
import { SocialLinks } from "@/components/ui/social-links";
import { DecorativeBackground } from "@/components/ui/decorative-background";

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

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateForm(data: FormData): FormErrors {
  const errors: FormErrors = {};

  if (!data.name.trim()) {
    errors.name = "Name is required";
  } else if (data.name.trim().length < 2) {
    errors.name = "Name must be at least 2 characters";
  }

  if (!data.email.trim()) {
    errors.email = "Email is required";
  } else if (!validateEmail(data.email)) {
    errors.email = "Please enter a valid email";
  }

  if (!data.message.trim()) {
    errors.message = "Message is required";
  } else if (data.message.trim().length < 10) {
    errors.message = "Message must be at least 10 characters";
  }

  return errors;
}

interface FormFieldProps {
  label: string;
  name: string;
  error?: string;
  children: React.ReactNode;
}

function FormField({ label, name, error, children }: FormFieldProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={name} className="block text-sm font-heading">
        {label}
      </label>
      {children}
      {error && <p className="text-red-500 text-sm">{error}</p>}
    </div>
  );
}

export function Contact() {
  const [formData, setFormData] = useState<FormData>({
    name: "",
    email: "",
    message: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState<FormStatus>("idle");

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const validationErrors = validateForm(formData);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setStatus("submitting");

    try {
      const response = await fetch(CONTACT_FORM_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setStatus("success");
        setFormData({ name: "", email: "", message: "" });
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  const isSubmitting = status === "submitting";

  return (
    <section id="contact" className="min-h-screen py-24 px-4 bg-pattern border-y-4 border-border relative overflow-hidden flex flex-col justify-center">
      <DecorativeBackground />

      <div className="max-w-4xl mx-auto relative z-10">
        <FadeIn className="text-center mb-16">
          <div className="inline-block rotate-[1deg] bg-main px-8 py-4 border-4 border-border shadow-[6px_6px_0px_0px_var(--border)] mb-6">
            <h2 className="text-3xl md:text-5xl font-heading font-black uppercase tracking-tight text-main-foreground">
              Get In Touch
            </h2>
          </div>
          <p className="text-foreground/80 max-w-xl mx-auto text-lg">
            I&apos;m currently open to new opportunities. Whether you have a question
            or just want to say hi, feel free to reach out!
          </p>
        </FadeIn>

        <div className="grid md:grid-cols-2 gap-8">
          <FadeIn variant="fadeInLeft" delay={0.2}>
            <Card className="border-4 border-border shadow-[6px_6px_0px_0px_var(--border)]">
              <CardContent className="p-6">
                {status === "success" ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <CheckCircle className="h-12 w-12 text-main mb-4" />
                    <h3 className="font-heading text-xl mb-2">Message Sent!</h3>
                    <p className="text-foreground/70 mb-4">
                      Thanks for reaching out. I&apos;ll get back to you soon.
                    </p>
                    <Button onClick={() => setStatus("idle")}>Send Another</Button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <FormField label="Name" name="name" error={errors.name}>
                      <Input
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        placeholder="Mark Bennett Pineda"
                        disabled={isSubmitting}
                        aria-invalid={!!errors.name}
                        className="h-11"
                      />
                    </FormField>

                    <FormField label="Email" name="email" error={errors.email}>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="mark@example.com"
                        disabled={isSubmitting}
                        aria-invalid={!!errors.email}
                        className="h-11"
                      />
                    </FormField>

                    <FormField label="Message" name="message" error={errors.message}>
                      <Textarea
                        id="message"
                        name="message"
                        value={formData.message}
                        onChange={handleChange}
                        placeholder="Your message..."
                        disabled={isSubmitting}
                        aria-invalid={!!errors.message}
                        rows={5}
                      />
                    </FormField>

                    <Button
                      type="submit"
                      size="lg"
                      className="w-full"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Send Message
                        </>
                      )}
                    </Button>
                    {status === "error" && (
                      <p className="text-red-500 text-sm text-center">
                        Something went wrong. Please try again.
                      </p>
                    )}
                  </form>
                )}
              </CardContent>
            </Card>
          </FadeIn>

          <FadeIn variant="fadeInRight" delay={0.3}>
            <Card className="h-full border-4 border-border shadow-[6px_6px_0px_0px_var(--border)]">
              <CardContent className="p-6 h-full flex flex-col justify-center">
                <StaggerContainer className="space-y-6">
                  {CONTACT_INFO.map((info) => (
                    <StaggerItem key={info.label}>
                      <ContactInfoItem info={info} />
                    </StaggerItem>
                  ))}

                  <StaggerItem>
                    <div className="border-t border-border my-4"></div>
                  </StaggerItem>

                  <StaggerItem>
                    <p className="text-sm text-foreground/60 mb-3">Follow me</p>
                    <SocialLinks
                      links={SOCIAL_LINKS}
                      variant="outline"
                      className="flex gap-3"
                    />
                  </StaggerItem>
                </StaggerContainer>
              </CardContent>
            </Card>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
