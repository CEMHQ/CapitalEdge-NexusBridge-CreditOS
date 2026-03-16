import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Loan Programs",
  description: "Bridge loans, renovation financing, asset-backed lending, GAP funding, and micro-lending for real estate investors. Fast closings, competitive terms, institutional underwriting.",
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
            Focused programs for real estate investors who need speed and certainty — plus Credit Fund strategies that deploy capital across asset-backed, GAP, and micro-lending.
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

      {/* ── Credit Fund Strategies (light section) ── */}
      <section id="credit-fund" className="bg-[#F8FAFC] border-y border-slate-200">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <div className="text-center mb-6">
            <p className="text-xs tracking-widest uppercase text-[#4A90D9] mb-3">NexusBridge Capital LP</p>
            <h2 className="text-3xl md:text-4xl font-bold text-[#0D1117]">
              What Our Credit Fund Offers
            </h2>
          </div>
          <p className="text-center text-sm text-[#4A6070] leading-relaxed max-w-2xl mx-auto mb-16">
            NexusBridge Capital LP pools accredited investor capital to deploy across three complementary credit strategies — targeting diversified, asset-backed yield within a balanced risk profile.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {[
              {
                title: "Asset-Backed Lending",
                body: "Secured loans backed by tangible assets such as real estate, equipment, or receivables. Collateral reduces risk while providing investors a steady income stream with lower volatility.",
                who: "Businesses and investors seeking secured short-term credit against hard assets.",
              },
              {
                title: "GAP Funding",
                body: "Short-term capital that bridges financial gaps in real estate and other projects — securing the investment with tangible assets. Ideal for investors and borrowers seeking quicker returns with asset-backed security.",
                who: "Real estate developers and investors with equity gaps in their deal capital stack.",
              },
              {
                title: "Micro-Lending",
                body: "Small loans to individuals and small businesses fostering economic growth and financial inclusion. Competitive returns that align with socially responsible investing principles.",
                who: "Small business owners and entrepreneurs who need accessible capital to grow.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="bg-white rounded-xl border border-slate-200 p-8 flex flex-col gap-5 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-10 h-10 rounded-full bg-[#4A90D9] flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#0D1117] mb-3">{item.title}</h3>
                  <p className="text-sm text-[#4A6070] leading-relaxed mb-4">{item.body}</p>
                  <p className="text-xs text-[#4A90D9] font-medium tracking-wide uppercase">
                    Best for: <span className="normal-case font-normal text-[#4A6070]">{item.who}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center">
            <p className="text-sm text-[#4A6070] mb-6">
              Interested in investing in the fund? NexusBridge Capital LP is available to accredited investors only.
            </p>
            <Button render={<Link href="/investors" />} className="bg-[#4A90D9] hover:bg-[#3A7BC8] text-white tracking-wide">
              Explore Investor Access <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
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
