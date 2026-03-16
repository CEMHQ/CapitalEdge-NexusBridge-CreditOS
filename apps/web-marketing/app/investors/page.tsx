import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Clock, BarChart3, FileText, ArrowRight, CheckCircle } from "lucide-react";

export const metadata: Metadata = {
  title: "Investors",
  description: "Accredited investor access to NexusBridge Capital LP — short-duration, asset-backed private credit managed by Capital Edge Management.",
};

const characteristics = [
  {
    icon: Shield,
    title: "Asset-Backed Security",
    description: "Every loan in the portfolio is secured by a first lien on real property. Collateral is independently appraised before funding.",
  },
  {
    icon: Clock,
    title: "Short Duration",
    description: "Loans are structured for 6 to 12 month terms, providing capital recycling and reduced duration risk compared to long-term credit.",
  },
  {
    icon: BarChart3,
    title: "Diversified Exposure",
    description: "Capital is deployed across multiple loans and property types, reducing concentration risk within the portfolio.",
  },
  {
    icon: FileText,
    title: "Transparent Reporting",
    description: "Investors receive regular capital account statements, distribution notices, and full portfolio reporting through the investor portal.",
  },
];

const structure = [
  { label: "Vehicle", value: "NexusBridge Capital LP" },
  { label: "Offering Type", value: "Regulation D, Rule 506(c)" },
  { label: "Eligible Investors", value: "Accredited Investors Only" },
  { label: "Manager", value: "Capital Edge Management" },
  { label: "Holding Company", value: "Obsidian & Co. Holdings, LLC" },
  { label: "Loan Collateral", value: "First Lien Real Property" },
  { label: "Target Duration", value: "6 – 12 Months Per Loan" },
  { label: "Distribution Frequency", value: "Periodic (per fund documents)" },
];

const portalFeatures = [
  "Capital commitment and account balance tracking",
  "Funded loan exposure and loan-level detail",
  "Distribution history and pending payments",
  "K-1 and tax document access",
  "Subscription and legal document library",
  "Capital call and notice center",
];

export default function InvestorsPage() {
  return (
    <>
      {/* Header */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="flex items-center gap-3 mb-3">
            <p className="text-xs tracking-widest uppercase text-primary">For Investors</p>
            <Badge variant="outline" className="border-primary/30 text-primary text-xs">
              Accredited Only
            </Badge>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            Private Credit. Institutional Process.
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            NexusBridge Capital LP offers accredited investors structured exposure to
            short-duration, asset-backed real estate loans managed under institutional
            underwriting standards.
          </p>
        </div>
      </section>

      {/* Investment characteristics */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="mb-14">
          <p className="text-xs tracking-widest uppercase text-primary mb-3">Investment Profile</p>
          <h2 className="text-2xl md:text-3xl font-bold text-foreground">
            What You&apos;re Investing In
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {characteristics.map(({ icon: Icon, title, description }) => (
            <Card key={title} className="bg-card border-border">
              <CardContent className="p-8">
                <Icon className="h-6 w-6 text-primary mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-3">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Credit Fund Strategies */}
      <section id="strategies" className="bg-[#F8FAFC] border-y border-slate-200">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <div className="text-center mb-6">
            <p className="text-xs tracking-widest uppercase text-[#4A90D9] mb-3">Deployment Strategies</p>
            <h2 className="text-3xl md:text-4xl font-bold text-[#0D1117]">
              What Our Credit Fund Offers
            </h2>
          </div>
          <p className="text-center text-sm text-[#4A6070] leading-relaxed max-w-2xl mx-auto mb-16">
            NexusBridge Capital LP deploys investor capital across three complementary credit strategies — each targeting diversified, asset-backed yield within a balanced risk profile.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {[
              {
                title: "Asset-Backed Lending",
                body: "Secured loans backed by tangible assets such as real estate, equipment, or receivables. Collateral reduces volatility and provides investors a steady, predictable income stream.",
                highlight: "Lower volatility through hard-asset collateral",
              },
              {
                title: "GAP Funding",
                body: "Short-term capital that bridges financial gaps in real estate and other projects — secured by tangible assets. Ideal for investors seeking quicker return cycles with asset-backed security.",
                highlight: "Faster capital recycling on bridge positions",
              },
              {
                title: "Micro-Lending",
                body: "Small loans to individuals and small businesses that foster economic growth and financial inclusion. Competitive returns aligned with socially responsible investing principles.",
                highlight: "Diversified exposure across borrower segments",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="bg-white rounded-xl border border-slate-200 p-8 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-10 h-10 rounded-full bg-[#4A90D9] flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-lg font-bold text-[#0D1117]">{item.title}</h3>
                <p className="text-sm text-[#4A6070] leading-relaxed flex-1">{item.body}</p>
                <p className="text-xs font-medium text-[#4A90D9] pt-2 border-t border-slate-100">
                  {item.highlight}
                </p>
              </div>
            ))}
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-3xl mx-auto text-center shadow-sm">
            <p className="text-sm font-semibold text-[#0D1117] mb-2">About The Fund</p>
            <p className="text-sm text-[#4A6070] leading-relaxed">
              NexusBridge Capital LP pools accredited investor capital to offer various forms of credit, targeting
              higher-return opportunities within a disciplined risk framework. Whether you are an experienced
              allocator or new to private credit, the fund provides a structured, well-managed path to
              yield-generating exposure.
            </p>
          </div>
        </div>
      </section>

      {/* Fund structure */}
      <section id="structure" className="bg-card border-y border-border">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
            <div>
              <p className="text-xs tracking-widest uppercase text-primary mb-3">Fund Structure</p>
              <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-6">
                NexusBridge Capital LP
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                NexusBridge Capital LP is the investment vehicle through which accredited
                investors participate in the platform&apos;s lending activities. The fund is
                structured as a private offering under Regulation D, Rule 506(c) and is
                managed by Capital Edge Management through Obsidian &amp; Co. Holdings, LLC.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Investors receive exposure to a diversified pool of short-term, first-lien
                real estate loans with conservative underwriting standards and structured
                distribution mechanics.
              </p>
            </div>
            <div>
              <div className="flex flex-col divide-y divide-border">
                {structure.map((item) => (
                  <div key={item.label} className="flex justify-between items-center py-4">
                    <span className="text-sm text-muted-foreground">{item.label}</span>
                    <span className="text-sm font-medium text-foreground text-right max-w-xs">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Investor portal */}
      <section id="portal" className="mx-auto max-w-7xl px-6 py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <p className="text-xs tracking-widest uppercase text-primary mb-3">Investor Portal</p>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-6">
              Full Visibility Into Your Investment
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-8">
              Once onboarded, investors access a dedicated portal with real-time
              visibility into their capital account, funded loan exposure, distributions,
              and compliance documentation.
            </p>
            <ul className="flex flex-col gap-3 mb-10">
              {portalFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-foreground/80">
                  <CheckCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground mb-6">
              Investor portal access is available after completing accreditation verification and subscription.
            </p>
            <Button render={<Link href="/contact" />} className="bg-primary hover:bg-primary/90 text-primary-foreground tracking-wide">
              Request Access <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>

          {/* Portal preview placeholder */}
          <div className="bg-card border border-border rounded-lg p-8 flex flex-col gap-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs tracking-widest uppercase text-muted-foreground">Investor Portal Preview</span>
              <Badge variant="outline" className="text-xs border-border text-muted-foreground">
                Phase 2
              </Badge>
            </div>
            {[
              { label: "Capital Committed", value: "—" },
              { label: "Funded Exposure", value: "—" },
              { label: "Distributions YTD", value: "—" },
              { label: "Active Loans", value: "—" },
            ].map((item) => (
              <div key={item.label} className="bg-secondary rounded-md p-4 flex justify-between items-center">
                <span className="text-xs text-muted-foreground">{item.label}</span>
                <span className="text-sm font-semibold text-foreground">{item.value}</span>
              </div>
            ))}
            <p className="text-xs text-muted-foreground text-center mt-2">
              Full portal available upon investor onboarding
            </p>
          </div>
        </div>
      </section>

      {/* Disclosure */}
      <section className="bg-card border-t border-border">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <p className="text-xs text-muted-foreground leading-relaxed max-w-4xl">
            <strong className="text-foreground/60">Important Disclosures:</strong> NexusBridge Capital LP is offered under
            Regulation D, Rule 506(c) of the Securities Act of 1933. This offering is available only
            to verified accredited investors as defined under Rule 501 of Regulation D. This is not
            an offer to sell or solicitation to buy securities in any jurisdiction where such offer
            is unlawful. Past performance is not indicative of future results. Investment involves
            risk including loss of principal.
          </p>
        </div>
      </section>
    </>
  );
}
