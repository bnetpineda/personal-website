"use client";

import { useState, type FormEvent, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FadeIn, StaggerContainer, StaggerItem } from "@/components/ui/motion";
import { Github, Linkedin, Mail, MapPin, Twitter, Send, Loader2, CheckCircle } from "lucide-react";

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
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setStatus("success");
      setFormData({ name: "", email: "", message: "" });
    } catch {
      setStatus("error");
    }
  };

  const isSubmitting = status === "submitting";

  return (
    <section id="contact" className="py-20 px-4 bg-secondary-background">
      <div className="max-w-4xl mx-auto">
        <FadeIn className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-heading mb-4">Get In Touch</h2>
          <div className="w-20 h-1 bg-main mx-auto mb-6"></div>
          <p className="text-foreground/80 max-w-xl mx-auto">
            I&apos;m currently open to new opportunities. Whether you have a question
            or just want to say hi, feel free to reach out!
          </p>
        </FadeIn>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Contact Form */}
          <FadeIn variant="fadeInLeft" delay={0.2}>
            <Card>
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

          {/* Contact Info */}
          <FadeIn variant="fadeInRight" delay={0.3}>
            <Card className="h-full">
              <CardContent className="p-6 h-full flex flex-col justify-center">
                <StaggerContainer className="space-y-6">
                  <StaggerItem>
                    <div className="flex items-center gap-4">
                      <div className="bg-main p-3 border-2 border-border">
                        <Mail className="h-5 w-5 text-main-foreground" />
                      </div>
                      <div>
                        <p className="text-sm text-foreground/60">Email</p>
                        <a
                          href="mailto:markbenenttpineda@gmail.com"
                          className="font-heading hover:text-main transition-colors"
                        >
                          markbennettpineda@gmail.com
                        </a>
                      </div>
                    </div>
                  </StaggerItem>

                  <StaggerItem>
                    <div className="flex items-center gap-4">
                      <div className="bg-main p-3 border-2 border-border">
                        <MapPin className="h-5 w-5 text-main-foreground" />
                      </div>
                      <div>
                        <p className="text-sm text-foreground/60">Location</p>
                        <p className="font-heading">Angeles City, Pampanga</p>
                      </div>
                    </div>
                  </StaggerItem>

                  <StaggerItem>
                    <div className="border-t border-border my-4"></div>
                  </StaggerItem>

                  <StaggerItem>
                    <p className="text-sm text-foreground/60 mb-3">Follow me</p>
                    <div className="flex gap-3">
                      <Button variant="outline" size="icon" asChild>
                        <a
                          href="https://github.com/bnetpineda"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="GitHub"
                        >
                          <Github className="h-5 w-5" />
                        </a>
                      </Button>
                      <Button variant="outline" size="icon" asChild>
                        <a
                          href="https://www.linkedin.com/in/mark-bennett-pineda-2b413927b/"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="LinkedIn"
                        >
                          <Linkedin className="h-5 w-5" />
                        </a>
                      </Button>
                      <Button variant="outline" size="icon" asChild>
                        <a
                          href="https://twitter.com/its_pandesal"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Twitter"
                        >
                          <Twitter className="h-5 w-5" />
                        </a>
                      </Button>
                    </div>
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
