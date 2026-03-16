import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Disclosures | NexusBridge Lending",
  description: "Legal disclosures, regulatory notices, and terms governing NexusBridge Lending and NexusBridge Capital LP.",
};

const disclosures = [
  {
    title: "Regulation D / Rule 506(c) Disclosure",
    lastUpdated: "March 2025",
    body: `NexusBridge Capital LP is offered as a private placement under Regulation D, Rule 506(c) of the Securities Act of 1933, as amended. Securities offered through NexusBridge Capital LP have not been registered under the Securities Act or the securities laws of any state and are being offered and sold in reliance on exemptions from the registration requirements. These securities may only be offered and sold to verified accredited investors as defined under Rule 501(a) of Regulation D. This is not an offer to sell, or a solicitation of an offer to buy, securities in any state or jurisdiction where such offer or sale is not permitted.`,
  },
  {
    title: "Investment Risk Disclosure",
    lastUpdated: "March 2025",
    body: `Investment opportunities available through NexusBridge Lending LLC and NexusBridge Capital LP involve substantial risk and are speculative in nature. These investments are suitable only for investors who can sustain the risk of loss of capital, including the potential for total loss. Diversification does not guarantee investment returns and does not eliminate the risk of loss. Private placements are illiquid and cannot be easily sold or exchanged for cash. They are intended for investors who do not need a liquid investment. Performance information, if any, has not been audited or verified by an independent third party. Past performance is not indicative of future results. Investors should carefully consider their individual financial circumstances in consultation with a qualified financial or legal advisor before investing.`,
  },
  {
    title: "No Loan Commitment",
    lastUpdated: "March 2025",
    body: `Submission of a loan inquiry through nexusbridgelending.com does not constitute a loan application, a commitment to lend, or a guarantee of financing. All loan requests are subject to underwriting review, credit approval, property appraisal, and execution of formal loan documentation. NexusBridge Lending LLC reserves the right to decline any loan request at its sole discretion. Terms and conditions of any financing offered are subject to change until a binding loan agreement has been fully executed by all parties.`,
  },
  {
    title: "Accredited Investor Verification",
    lastUpdated: "March 2025",
    body: `In accordance with Rule 506(c), NexusBridge Capital LP takes reasonable steps to verify that all investors are accredited investors as defined under Rule 501(a) of Regulation D. Acceptable verification methods include review of tax returns, W-2 statements, bank or brokerage statements, CPA letters, attorney letters, or third-party verification services. Investors who cannot be verified as accredited will not be permitted to participate in any securities offering.`,
  },
  {
    title: "Terms of Use",
    lastUpdated: "March 2025",
    body: `By accessing nexusbridgelending.com and any associated platforms, you agree to be bound by these Terms of Use and all applicable laws and regulations. The information on this website is provided for general informational purposes only and does not constitute legal, financial, tax, or investment advice. NexusBridge Lending LLC and Capital Edge Management, Inc. make no representations or warranties, express or implied, regarding the accuracy, completeness, or suitability of any information on this site. Unauthorized use of this website may give rise to a claim for damages and may be a criminal offense. NexusBridge Lending LLC reserves the right to modify these terms at any time without prior notice.`,
  },
  {
    title: "Privacy Policy",
    lastUpdated: "March 2025",
    body: `NexusBridge Lending LLC collects personal information submitted through forms on this website solely for the purpose of processing loan inquiries, investor inquiries, and general communications. We do not sell, rent, or share personal information with third parties except as required to process transactions, comply with applicable law, or as otherwise described herein. Information submitted may be shared with Capital Edge Management, Inc. and Obsidian & Co. Holdings, LLC as necessary for business operations. We employ reasonable security measures to protect information submitted through this site, but cannot guarantee absolute security of data transmitted over the internet.`,
  },
];

export default function DisclosuresPage() {
  return (
    <>
      {/* Header */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <p className="text-xs tracking-widest uppercase text-primary mb-3">Legal</p>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">Disclosures</h1>
          <p className="text-muted-foreground text-lg max-w-xl">
            Legal notices, regulatory disclosures, and terms governing NexusBridge Lending and NexusBridge Capital LP.
          </p>
        </div>
      </section>

      {/* Disclosures list */}
      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="flex flex-col gap-6">
          {disclosures.map((d) => (
            <div
              key={d.title}
              className="bg-card border border-border rounded-xl p-8"
            >
              <div className="flex items-start justify-between gap-4 mb-4">
                <h2 className="text-lg font-bold text-foreground">{d.title}</h2>
                <span className="text-xs text-muted-foreground whitespace-nowrap mt-1">
                  Last Updated: {d.lastUpdated}
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{d.body}</p>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground mt-12 leading-relaxed border-t border-border pt-8">
          These disclosures are provided for informational purposes. NexusBridge Lending LLC is managed by Capital Edge Management, Inc. through Obsidian & Co. Holdings, LLC. NexusBridge Capital LP is a separate legal entity. This website does not constitute an offer to sell or solicitation of an offer to buy any security. All securities offerings are made only pursuant to formal offering documents.
        </p>
      </section>
    </>
  );
}
