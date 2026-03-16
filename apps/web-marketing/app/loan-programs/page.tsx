import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Loan Programs",
  description: "Bridge loans and renovation financing for real estate investors. Fast closings, competitive terms, institutional underwriting.",
};

const programs = [
  {
    id: "bridge",
    title: "Bridge Loans",
    badge: "Most Popular",
    tagline: "Fast capital for time-sensitive transactions",
    description:
      "Our bridge loan program provides short-term financing for acquisitions, cash-out refinances, and closings where traditional financing is too slow or unavailable. Ideal for experienced investors who need certainty of execution.",
    useCases: [
      "Property acquisitions with tight timelines",
      "Refinance prior to permanent financing",
      "Closing contingency bridge",
      "Portfolio leverage and recycling",
    ],
    terms: [
      { label: "Loan Size", value: "$250,000 – $5,000,000" },
      { label: "Loan Term", value: "6 – 12 Months" },
      { label: "Max LTV", value: "Up to 75%" },
      { label: "Interest Rate", value: "Contact for current rates" },
      { label: "Amortization", value: "Interest-only" },
      { label: "Closing Time", value: "7 – 14 Business Days" },
    ],
    requirements: [
      "First lien position on subject property",
      "Independent appraisal or BPO required",
      "Clear exit strategy (sale or refinance)",
      "Title insurance required",
      "Hazard insurance required at close",
    ],
  },
  {
    id: "renovation",
    title: "Renovation Financing",
    badge: "Fix & Flip",
    tagline: "Acquisition plus renovation in a single loan",
    description:
      "Our renovation loan combines purchase and rehab financing into a single structure with a draw schedule tied to project milestones. Designed for residential value-add investors who need capital across the full project lifecycle.",
    useCases: [
      "Single-family fix-and-flip projects",
      "BRRRR strategy acquisitions",
      "Light-to-heavy rehabilitation",
      "Value-add residential repositioning",
    ],
    terms: [
      { label: "Loan Size", value: "$150,000 – $2,500,000" },
      { label: "Loan Term", value: "6 – 12 Months" },
      { label: "Max LTC", value: "Up to 90% of Total Cost" },
      { label: "Max ARV LTV", value: "Up to 70% of ARV" },
      { label: "Draws", value: "Milestone-based disbursement" },
      { label: "Closing Time", value: "10 – 21 Business Days" },
    ],
    requirements: [
      "Detailed scope of work and budget",
      "As-is and ARV appraisal",
      "Prior renovation experience preferred",
      "General contractor information",
      "Proof of funds for reserves",
    ],
  },
];

export default function LoanProgramsPage() {
  return (
    <>
      {/* Header */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <p className="text-xs tracking-widest uppercase text-primary mb-3">Loan Programs</p>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            Capital Structured for Your Deal
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            Two focused programs designed for real estate investors who need speed, certainty, and a lender that understands the asset.
          </p>
        </div>
      </section>

      {/* Programs */}
      <section className="mx-auto max-w-7xl px-6 py-24 flex flex-col gap-20">
        {programs.map((program) => (
          <div key={program.id} id={program.id}>
            {/* Program header */}
            <div className="flex items-center gap-4 mb-6">
              <h2 className="text-2xl md:text-3xl font-bold text-foreground">{program.title}</h2>
              <Badge variant="outline" className="border-primary/30 text-primary text-xs">
                {program.badge}
              </Badge>
            </div>
            <p className="text-primary text-sm tracking-wide mb-4">{program.tagline}</p>
            <p className="text-muted-foreground leading-relaxed mb-10 max-w-2xl">
              {program.description}
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Terms */}
              <Card className="bg-card border-border lg:col-span-1">
                <CardContent className="p-6">
                  <h3 className="text-xs tracking-widest uppercase text-muted-foreground mb-5">
                    Loan Terms
                  </h3>
                  <div className="flex flex-col gap-4">
                    {program.terms.map((term) => (
                      <div key={term.label} className="flex justify-between items-start gap-4">
                        <span className="text-xs text-muted-foreground">{term.label}</span>
                        <span className="text-sm font-medium text-foreground text-right">{term.value}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Use cases + requirements */}
              <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-xs tracking-widest uppercase text-muted-foreground mb-5">
                    Use Cases
                  </h3>
                  <ul className="flex flex-col gap-3">
                    {program.useCases.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-foreground/80">
                        <CheckCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-xs tracking-widest uppercase text-muted-foreground mb-5">
                    Requirements
                  </h3>
                  <ul className="flex flex-col gap-3">
                    {program.requirements.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-foreground/80">
                        <CheckCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <Button render={<Link href="/apply" />} className="bg-primary hover:bg-primary/90 text-primary-foreground tracking-wide">
                Apply for {program.title} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </section>

      {/* Bottom CTA */}
      <section className="border-t border-border bg-card">
        <div className="mx-auto max-w-7xl px-6 py-16 text-center">
          <h2 className="text-2xl font-bold text-foreground mb-3">Not sure which program fits?</h2>
          <p className="text-muted-foreground mb-8">
            Speak with our team and we&apos;ll help you structure the right loan for your deal.
          </p>
          <Button render={<Link href="/contact" />} variant="outline" className="border-border hover:bg-secondary tracking-wide">
            Contact Us
          </Button>
        </div>
      </section>
    </>
  );
}
