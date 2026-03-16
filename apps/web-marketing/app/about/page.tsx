import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "About",
  description: "Learn about NexusBridge Lending, Capital Edge Management, and the corporate structure behind the platform.",
};

const entities = [
  {
    name: "Capital Edge Management",
    abbr: "CEM",
    role: "Asset Management Company",
    description:
      "Capital Edge Management serves as the asset management company overseeing the NexusBridge platform. CEM sets investment policy, manages underwriting standards, and oversees fund operations.",
  },
  {
    name: "Obsidian & Co. Holdings, LLC",
    abbr: "OCH",
    role: "Holding Company",
    description:
      "Obsidian & Co. Holdings, LLC is the holding entity managed by Capital Edge Management. OCH holds the interests in NexusBridge Capital LP and NexusBridge Lending.",
  },
  {
    name: "NexusBridge Capital LP",
    abbr: "NBC",
    role: "Investment Fund",
    description:
      "NexusBridge Capital LP is the Regulation D investment vehicle through which accredited investors participate in the platform's lending portfolio.",
  },
  {
    name: "NexusBridge Lending",
    abbr: "NBL",
    role: "Lending Platform",
    description:
      "NexusBridge Lending is the origination and servicing platform responsible for borrower onboarding, underwriting, loan funding, and portfolio management.",
  },
];

const compliance = [
  {
    title: "Regulation D / Rule 506(c)",
    body: "NexusBridge Capital LP is offered under Regulation D, Rule 506(c). Investor offerings are available to verified accredited investors only. General solicitation is permitted under 506(c) when all investors are accredited.",
  },
  {
    title: "KYC & AML",
    body: "All borrowers and investors undergo identity verification and anti-money laundering screening as part of the onboarding process, in compliance with applicable FinCEN requirements.",
  },
  {
    title: "Data Security",
    body: "The platform is built on institutional-grade cloud infrastructure with encryption at rest and in transit, role-based access controls, and audit logging for all sensitive operations.",
  },
  {
    title: "SOC 2 Alignment",
    body: "Platform controls are designed to align with SOC 2 Type II requirements covering security, availability, and confidentiality of borrower and investor data.",
  },
];

export default function AboutPage() {
  return (
    <>
      {/* Header */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <p className="text-xs tracking-widest uppercase text-primary mb-3">About Us</p>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            Built for Private Credit
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            NexusBridge Lending is part of a structured financial infrastructure designed
            to connect real estate borrowers with institutional private capital — efficiently,
            transparently, and compliantly.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
          <div>
            <p className="text-xs tracking-widest uppercase text-primary mb-3">Our Mission</p>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-6">
              Closing the Gap in Private Credit Markets
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-5">
              Traditional financial institutions often cannot move at the speed that real
              estate investors require. Meanwhile, private capital is frequently fragmented
              and difficult to access. NexusBridge was built to solve this inefficiency.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-5">
              By combining institutional underwriting discipline with a modern digital
              platform, we provide borrowers with fast, reliable capital and investors
              with structured, transparent credit exposure.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Our long-term vision includes a hybrid "HyFi" layer that introduces
              blockchain-based transparency and programmable settlement to the private
              credit ecosystem — without compromising regulatory compliance.
            </p>
          </div>
          <div>
            <p className="text-xs tracking-widest uppercase text-primary mb-3">Corporate Structure</p>
            <div className="flex flex-col gap-4">
              {entities.map((entity) => (
                <Card key={entity.abbr} className="bg-card border-border">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-primary">{entity.abbr}</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{entity.name}</p>
                        <p className="text-xs text-primary tracking-wide mb-2">{entity.role}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{entity.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Compliance */}
      <section id="compliance" className="bg-card border-y border-border">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <div className="mb-14">
            <p className="text-xs tracking-widest uppercase text-primary mb-3">Compliance & Regulatory</p>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">
              Built With Compliance By Design
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {compliance.map((item) => (
              <div key={item.title}>
                <h3 className="text-sm font-semibold text-foreground mb-3">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-6 py-20 text-center">
        <h2 className="text-2xl font-bold text-foreground mb-4">Ready to Work With Us?</h2>
        <p className="text-muted-foreground mb-8 max-w-md mx-auto">
          Whether you&apos;re a borrower looking for capital or an investor seeking private
          credit exposure, we&apos;d like to hear from you.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button render={<Link href="/apply" />} className="bg-primary hover:bg-primary/90 text-primary-foreground tracking-wide">
            Apply for a Loan <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button render={<Link href="/contact" />} variant="outline" className="border-border hover:bg-secondary tracking-wide">
            Contact Our Team
          </Button>
        </div>
      </section>
    </>
  );
}
