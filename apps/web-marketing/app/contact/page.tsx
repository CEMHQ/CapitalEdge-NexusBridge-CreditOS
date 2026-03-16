"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Mail, Phone, MapPin } from "lucide-react";

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // TODO: wire to notification service in Phase 2
    setSubmitted(true);
  }

  return (
    <>
      {/* Header */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <p className="text-xs tracking-widest uppercase text-primary mb-3">Get In Touch</p>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">Contact Us</h1>
          <p className="text-muted-foreground text-lg max-w-xl">
            Have a question about a loan, an investment, or the platform? We&apos;d like to hear from you.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">

          {/* Form */}
          <div className="lg:col-span-2">
            {submitted ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <CheckCircle className="h-12 w-12 text-primary mb-4" />
                <h2 className="text-2xl font-bold text-foreground mb-3">Message Sent</h2>
                <p className="text-muted-foreground max-w-sm">
                  Thanks for reaching out. A member of our team will respond within 1–2 business days.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="flex flex-col gap-2">
                    <label htmlFor="name" className="text-sm text-foreground">
                      Full Name <span className="text-primary">*</span>
                    </label>
                    <input
                      id="name"
                      name="name"
                      type="text"
                      required
                      className="bg-input border border-border rounded-md px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="Jane Smith"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label htmlFor="email" className="text-sm text-foreground">
                      Email <span className="text-primary">*</span>
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      className="bg-input border border-border rounded-md px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="jane@example.com"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="subject" className="text-sm text-foreground">
                    Subject <span className="text-primary">*</span>
                  </label>
                  <select
                    id="subject"
                    name="subject"
                    required
                    className="bg-input border border-border rounded-md px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Select a topic</option>
                    <option value="loan-inquiry">Loan Inquiry</option>
                    <option value="investor-inquiry">Investor / Fund Inquiry</option>
                    <option value="general">General Question</option>
                    <option value="compliance">Compliance / Legal</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="message" className="text-sm text-foreground">
                    Message <span className="text-primary">*</span>
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    rows={6}
                    required
                    className="bg-input border border-border rounded-md px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    placeholder="Tell us how we can help..."
                  />
                </div>
                <Button
                  type="submit"
                  size="lg"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground tracking-wide w-full md:w-auto"
                >
                  Send Message
                </Button>
                <p className="text-xs text-muted-foreground">
                  We typically respond within 1–2 business days.
                </p>
              </form>
            )}
          </div>

          {/* Contact info */}
          <aside className="flex flex-col gap-6">
            <Card className="bg-card border-border">
              <CardContent className="p-6 flex flex-col gap-5">
                <h3 className="text-sm font-semibold text-foreground">Contact Information</h3>
                <div className="flex items-start gap-3 text-sm text-muted-foreground">
                  <Mail className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>info@nexusbridgelending.com</span>
                </div>
                <div className="flex items-start gap-3 text-sm text-muted-foreground">
                  <Phone className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>Contact via form or email</span>
                </div>
                <div className="flex items-start gap-3 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>United States</span>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="p-6">
                <h3 className="text-sm font-semibold text-foreground mb-3">Response Time</h3>
                <p className="text-sm text-muted-foreground">
                  Loan inquiries are reviewed within <strong className="text-foreground">1–2 business days</strong>.
                  Investor inquiries are typically responded to within <strong className="text-foreground">2–3 business days</strong>.
                </p>
              </CardContent>
            </Card>
          </aside>
        </div>
      </section>
    </>
  );
}
