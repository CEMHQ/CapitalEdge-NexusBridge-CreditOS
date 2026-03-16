import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Shield, Clock, TrendingUp, CheckCircle, Building2, BarChart3 } from "lucide-react";
import { FaqAccordion } from "@/components/home/faq-accordion";

const stats = [
  { label: "Loan Terms", value: "6–12 Mo", sub: "Short-duration" },
  { label: "Max LTV", value: "75%", sub: "Conservative underwriting" },
  { label: "Funding Speed", value: "7–14 Days", sub: "From approval to close" },
  { label: "Asset Types", value: "Real Estate", sub: "Residential & commercial" },
];

const steps = [
  {
    number: "01",
    title: "Apply",
    description: "Complete our streamlined application with property details, loan request, and financial documentation.",
  },
  {
    number: "02",
    title: "Underwrite",
    description: "Our team reviews collateral, borrower profile, and loan structure. Decision in days, not weeks.",
  },
  {
    number: "03",
    title: "Fund",
    description: "Close with confidence. Capital is deployed directly to your transaction on an institutional schedule.",
  },
];

const programs = [
  {
    title: "Bridge Loans",
    badge: "Most Popular",
    description: "Short-term financing for acquisitions, refinances, or time-sensitive closings where traditional lenders can't move fast enough.",
    features: ["6–12 month terms", "Up to 75% LTV", "$250K – $5M loan size", "Interest-only available"],
    href: "/loan-programs#bridge",
  },
  {
    title: "Renovation Financing",
    badge: "Fix & Flip",
    description: "Combined acquisition and renovation capital for residential value-add projects with structured draw schedules.",
    features: ["Up to 90% of cost", "Draw-based disbursement", "Experienced investors preferred", "Single-close simplicity"],
    href: "/loan-programs#renovation",
  },
];

const investorPoints = [
  { icon: Shield, text: "Asset-backed collateral on every loan" },
  { icon: Clock, text: "Short duration — 6 to 12 month exposure" },
  { icon: TrendingUp, text: "Structured returns with predictable income" },
  { icon: BarChart3, text: "Portfolio diversification across loan types" },
];

export default function HomePage() {
  return (
    <>
      {/* ── Hero ───────────────────────────────── */}
      <section className="relative overflow-hidden bg-background">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent pointer-events-none" />
        <div className="mx-auto max-w-7xl px-6 py-28 md:py-36">
          <div className="max-w-3xl">
            <Badge
              variant="outline"
              className="mb-6 border-primary/40 text-primary text-xs tracking-widest uppercase"
            >
              Private Credit Platform
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground leading-[1.1] mb-6">
              Bridge the Gap Between{" "}
              <span className="text-primary">Capital</span>{" "}
              and Opportunity
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed mb-10 max-w-2xl">
              NexusBridge provides short-term asset-backed financing for real estate
              investors who need fast, reliable capital — and structured credit
              exposure for investors seeking yield.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                render={<Link href="/apply" />}
                size="lg"
                className="bg-primary hover:bg-primary/90 text-primary-foreground tracking-wide text-sm"
              >
                Apply for a Loan <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                render={<Link href="/investors" />}
                size="lg"
                variant="outline"
                className="border-border text-foreground hover:bg-secondary tracking-wide text-sm"
              >
                Explore Investor Access
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ──────────────────────────── */}
      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-2xl md:text-3xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs tracking-widest uppercase text-primary mt-1">{stat.label}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why NexusBridge (light section) ────── */}
      <section className="bg-[#F8FAFC] border-b border-slate-200">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <div className="text-center mb-16">
            <p className="text-xs tracking-widest uppercase text-[#4A90D9] mb-3">Why Choose Us</p>
            <h2 className="text-3xl md:text-4xl font-bold text-[#0D1117]">
              Built for Real Estate Investors
            </h2>
            <p className="text-[#4A6070] mt-4 max-w-xl mx-auto text-sm leading-relaxed">
              We move at the speed of deals — with the discipline and structure of an institutional lender.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                title: "Fast Execution",
                body: "Term sheets in 24–48 hours. Capital deployed in 7–14 days from approval to close.",
              },
              {
                title: "Asset-Backed Security",
                body: "Every loan is secured by a first-lien position on real property collateral — no unsecured exposure.",
              },
              {
                title: "Flexible Structures",
                body: "Bridge loans, renovation financing, and custom deal structures designed around your transaction.",
              },
              {
                title: "Institutional Underwriting",
                body: "Conservative LTV thresholds and rigorous due diligence on every deal — protecting borrowers and investors alike.",
              },
              {
                title: "Transparent Pricing",
                body: "Clear terms with no hidden fees. You know the full cost of capital before you sign.",
              },
              {
                title: "Accredited Investor Access",
                body: "Structured yield-generating credit exposure for qualified capital allocators under Reg D.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-9 h-9 rounded-full bg-[#4A90D9] flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="h-4 w-4 text-white" />
                </div>
                <h3 className="text-base font-bold text-[#0D1117]">{item.title}</h3>
                <p className="text-sm text-[#4A6070] leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="text-center mb-16">
          <p className="text-xs tracking-widest uppercase text-primary mb-3">The Process</p>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground">
            Simple. Fast. Institutional.
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {steps.map((step) => (
            <div key={step.number} className="relative">
              <p className="text-6xl font-bold text-border mb-4 leading-none">{step.number}</p>
              <h3 className="text-xl font-semibold text-foreground mb-3">{step.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 text-center">
          <Link
            href="/how-it-works"
            className="text-sm text-primary hover:text-primary/80 transition-colors inline-flex items-center gap-1"
          >
            See the full process <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </section>

      {/* ── Loan programs ──────────────────────── */}
      <section className="bg-card border-y border-border">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <div className="text-center mb-16">
            <p className="text-xs tracking-widest uppercase text-primary mb-3">Loan Programs</p>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">
              Capital Structured for Your Deal
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {programs.map((program) => (
              <Card key={program.title} className="bg-secondary border-border hover:border-primary/40 transition-colors duration-300">
                <CardContent className="p-8">
                  <div className="flex items-start justify-between mb-4">
                    <h3 className="text-xl font-bold text-foreground">{program.title}</h3>
                    <Badge variant="outline" className="border-primary/30 text-primary text-xs">
                      {program.badge}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                    {program.description}
                  </p>
                  <ul className="flex flex-col gap-2 mb-8">
                    {program.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm text-foreground/80">
                        <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={program.href}
                    className="text-sm text-primary hover:text-primary/80 transition-colors inline-flex items-center gap-1"
                  >
                    Learn more <ArrowRight className="h-3 w-3" />
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Investor section ───────────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          <div>
            <p className="text-xs tracking-widest uppercase text-primary mb-3">For Investors</p>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
              Structured Exposure to Private Credit
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-8">
              NexusBridge Capital LP provides accredited investors with diversified
              exposure to short-duration, asset-backed loans originated and managed
              by our team under institutional underwriting standards.
            </p>
            <ul className="flex flex-col gap-4 mb-10">
              {investorPoints.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-sm text-foreground/80">
                  <Icon className="h-5 w-5 text-primary flex-shrink-0" />
                  {text}
                </li>
              ))}
            </ul>
            <Button
              render={<Link href="/investors" />}
              variant="outline"
              className="border-border hover:bg-secondary tracking-wide text-sm"
            >
              Investor Overview <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Investment Structure", value: "Reg D / 506(c)" },
              { label: "Investor Type", value: "Accredited Only" },
              { label: "Loan Duration", value: "6–12 Months" },
              { label: "Collateral", value: "Real Property" },
            ].map((item) => (
              <Card key={item.label} className="bg-card border-border">
                <CardContent className="p-6">
                  <p className="text-xs tracking-widest uppercase text-muted-foreground mb-2">
                    {item.label}
                  </p>
                  <p className="text-lg font-semibold text-foreground">{item.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────── */}
      <section className="bg-[#F8FAFC] border-y border-slate-200">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            <div>
              <p className="text-xs tracking-widest uppercase text-[#4A90D9] mb-3">FAQ</p>
              <h2 className="text-3xl font-bold text-[#0D1117] mb-4">
                Commonly Asked Questions
              </h2>
              <p className="text-sm text-[#4A6070] leading-relaxed mb-6">
                Have a question that isn&apos;t answered here? Reach out directly.
              </p>
              <Link
                href="/contact"
                className="inline-flex items-center gap-1 text-sm text-[#4A90D9] hover:text-[#2563EB] transition-colors font-medium"
              >
                Contact Us <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="lg:col-span-2">
              <FaqAccordion />
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────── */}
      <section className="bg-secondary border-t border-border">
        <div className="mx-auto max-w-7xl px-6 py-24 text-center">
          <Building2 className="h-10 w-10 text-primary mx-auto mb-6" />
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Ready to Move Forward?
          </h2>
          <p className="text-muted-foreground mb-10 max-w-xl mx-auto">
            Whether you need capital for your next deal or are looking for
            yield-generating credit exposure, NexusBridge is built for you.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              render={<Link href="/apply" />}
              size="lg"
              className="bg-primary hover:bg-primary/90 text-primary-foreground tracking-wide"
            >
              Apply for Financing
            </Button>
            <Button
              render={<Link href="/contact" />}
              size="lg"
              variant="outline"
              className="border-border hover:bg-card tracking-wide"
            >
              Speak with Our Team
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
