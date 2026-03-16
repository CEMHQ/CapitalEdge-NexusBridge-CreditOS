"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle } from "lucide-react";

const propertyTypes = [
  "Single-Family Residential",
  "Multi-Family (2-4 Units)",
  "Multi-Family (5+ Units)",
  "Commercial",
  "Mixed-Use",
  "Land",
];

const loanPurposes = [
  "Acquisition",
  "Cash-Out Refinance",
  "Rate & Term Refinance",
  "Construction / Renovation",
  "Bridge to Permanent",
];

export default function ApplyPage() {
  const [submitted, setSubmitted] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = e.currentTarget;
    const data = {
      firstName: (form.elements.namedItem("firstName") as HTMLInputElement).value,
      lastName: (form.elements.namedItem("lastName") as HTMLInputElement).value,
      email: (form.elements.namedItem("email") as HTMLInputElement).value,
      phone: (form.elements.namedItem("phone") as HTMLInputElement).value,
      loanAmount: (form.elements.namedItem("loanAmount") as HTMLInputElement).value,
      propertyValue: (form.elements.namedItem("propertyValue") as HTMLInputElement).value,
      loanPurpose: (form.elements.namedItem("loanPurpose") as HTMLSelectElement).value,
      propertyType: (form.elements.namedItem("propertyType") as HTMLSelectElement).value,
      propertyAddress: (form.elements.namedItem("propertyAddress") as HTMLInputElement).value,
      exitStrategy: (form.elements.namedItem("exitStrategy") as HTMLTextAreaElement).value,
    };
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Submission failed");
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again or email us directly.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <section className="mx-auto max-w-7xl px-6 py-32 flex flex-col items-center text-center">
        <CheckCircle className="h-14 w-14 text-primary mb-6" />
        <h1 className="text-3xl font-bold text-foreground mb-4">Application Received</h1>
        <p className="text-muted-foreground max-w-md">
          Thank you for submitting your loan inquiry. A member of our team will review
          your request and reach out within 1–2 business days.
        </p>
      </section>
    );
  }

  return (
    <>
      {/* Header */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <p className="text-xs tracking-widest uppercase text-primary mb-3">Get Financing</p>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">Apply for a Loan</h1>
          <p className="text-muted-foreground text-lg max-w-xl">
            Tell us about your deal. No upfront fees. We&apos;ll review your inquiry and follow
            up within 1–2 business days.
          </p>
        </div>
      </section>

      {/* Form */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          <div className="lg:col-span-2">
            <form onSubmit={handleSubmit} className="flex flex-col gap-8" noValidate>

              {/* Borrower info */}
              <Card className="bg-card border-border">
                <CardContent className="p-8">
                  <h2 className="text-sm font-semibold tracking-widest uppercase text-muted-foreground mb-6">
                    Your Information
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="flex flex-col gap-2">
                      <label htmlFor="firstName" className="text-sm text-foreground">
                        First Name <span className="text-primary">*</span>
                      </label>
                      <input
                        id="firstName"
                        name="firstName"
                        type="text"
                        required
                        className="bg-input border border-border rounded-md px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder="John"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label htmlFor="lastName" className="text-sm text-foreground">
                        Last Name <span className="text-primary">*</span>
                      </label>
                      <input
                        id="lastName"
                        name="lastName"
                        type="text"
                        required
                        className="bg-input border border-border rounded-md px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder="Smith"
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
                        placeholder="john@example.com"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label htmlFor="phone" className="text-sm text-foreground">
                        Phone <span className="text-primary">*</span>
                      </label>
                      <input
                        id="phone"
                        name="phone"
                        type="tel"
                        required
                        className="bg-input border border-border rounded-md px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder="(555) 000-0000"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Loan details */}
              <Card className="bg-card border-border">
                <CardContent className="p-8">
                  <h2 className="text-sm font-semibold tracking-widest uppercase text-muted-foreground mb-6">
                    Loan Request
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="flex flex-col gap-2">
                      <label htmlFor="loanAmount" className="text-sm text-foreground">
                        Loan Amount Requested <span className="text-primary">*</span>
                      </label>
                      <input
                        id="loanAmount"
                        name="loanAmount"
                        type="text"
                        required
                        className="bg-input border border-border rounded-md px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder="$500,000"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label htmlFor="propertyValue" className="text-sm text-foreground">
                        Estimated Property Value <span className="text-primary">*</span>
                      </label>
                      <input
                        id="propertyValue"
                        name="propertyValue"
                        type="text"
                        required
                        className="bg-input border border-border rounded-md px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder="$700,000"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label htmlFor="loanPurpose" className="text-sm text-foreground">
                        Loan Purpose <span className="text-primary">*</span>
                      </label>
                      <select
                        id="loanPurpose"
                        name="loanPurpose"
                        required
                        className="bg-input border border-border rounded-md px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="">Select purpose</option>
                        {loanPurposes.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label htmlFor="propertyType" className="text-sm text-foreground">
                        Property Type <span className="text-primary">*</span>
                      </label>
                      <select
                        id="propertyType"
                        name="propertyType"
                        required
                        className="bg-input border border-border rounded-md px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="">Select type</option>
                        {propertyTypes.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-2 md:col-span-2">
                      <label htmlFor="propertyAddress" className="text-sm text-foreground">
                        Property Address
                      </label>
                      <input
                        id="propertyAddress"
                        name="propertyAddress"
                        type="text"
                        className="bg-input border border-border rounded-md px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder="123 Main St, City, State, ZIP"
                      />
                    </div>
                    <div className="flex flex-col gap-2 md:col-span-2">
                      <label htmlFor="exitStrategy" className="text-sm text-foreground">
                        Exit Strategy
                      </label>
                      <textarea
                        id="exitStrategy"
                        name="exitStrategy"
                        rows={3}
                        className="bg-input border border-border rounded-md px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                        placeholder="Describe your plan to repay the loan (e.g., sale of property, permanent refinance, etc.)"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <Button
                type="submit"
                size="lg"
                disabled={loading}
                className="bg-primary hover:bg-primary/90 text-primary-foreground tracking-wide w-full md:w-auto disabled:opacity-60"
              >
                {loading ? "Submitting..." : "Submit Loan Inquiry"}
              </Button>

              <p className="text-xs text-muted-foreground">
                By submitting, you agree that NexusBridge Lending may contact you regarding your inquiry.
                This form does not constitute a loan application or commitment to lend.
              </p>
            </form>
          </div>

          {/* Sidebar */}
          <aside className="flex flex-col gap-6">
            <Card className="bg-card border-border">
              <CardContent className="p-6">
                <h3 className="text-sm font-semibold text-foreground mb-4">What Happens Next</h3>
                <ol className="flex flex-col gap-4">
                  {[
                    "We review your inquiry within 1–2 business days",
                    "A team member reaches out to discuss your deal",
                    "We issue a term sheet if the deal fits our criteria",
                    "Underwriting and due diligence begins",
                    "Close and fund",
                  ].map((step, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                      <span className="w-5 h-5 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="p-6">
                <h3 className="text-sm font-semibold text-foreground mb-3">Have Questions?</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Prefer to speak with someone first?
                </p>
                <Button render={<Link href="/contact" />} variant="outline" size="sm" className="w-full border-border hover:bg-secondary">
                  Contact Us
                </Button>
              </CardContent>
            </Card>
          </aside>
        </div>
      </section>
    </>
  );
}
