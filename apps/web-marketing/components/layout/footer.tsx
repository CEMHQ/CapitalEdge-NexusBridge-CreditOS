import Link from "next/link";
import { Separator } from "@/components/ui/separator";

const footerLinks = {
  Borrowers: [
    { href: "/loan-programs", label: "Loan Programs" },
    { href: "/how-it-works", label: "How It Works" },
    { href: "/apply", label: "Apply Now" },
  ],
  Investors: [
    { href: "/investors", label: "Investor Overview" },
    { href: "/investors#structure", label: "Fund Structure" },
    { href: "/investors#portal", label: "Investor Portal" },
  ],
  Company: [
    { href: "/about", label: "About Us" },
    { href: "/about#compliance", label: "Compliance" },
    { href: "/contact", label: "Contact" },
  ],
};

export function Footer() {
  return (
    <footer className="border-t border-border bg-card mt-auto">
      <div className="mx-auto max-w-7xl px-6 py-16">
        {/* Top row */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-12 mb-12">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex flex-col mb-4">
              <span className="text-foreground font-bold tracking-widest text-sm uppercase">
                NexusBridge
              </span>
              <span className="text-muted-foreground tracking-widest text-[10px] uppercase">
                Lending
              </span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              Short-term asset-backed bridge financing connecting real estate
              borrowers with institutional-grade private capital.
            </p>
            <p className="text-xs text-muted-foreground mt-4">
              Managed by{" "}
              <a
                href="https://www.capitaledgeinvest.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground/60 hover:text-foreground transition-colors"
              >
                Capital Edge Management
              </a>
              {" "}through{" "}
              <span className="text-foreground/60">Obsidian & Co. Holdings, LLC</span>
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([group, links]) => (
            <div key={group}>
              <h3 className="text-xs font-semibold tracking-widest uppercase text-foreground mb-4">
                {group}
              </h3>
              <ul className="flex flex-col gap-3">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <Separator className="bg-border mb-8" />

        {/* Bottom row */}
        <div className="flex flex-col md:flex-row justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} NexusBridge Lending. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
            NexusBridge Capital LP is offered under Regulation D, Rule 506(c). Securities
            offerings are available to accredited investors only. Past performance is not
            indicative of future results. This is not an offer to sell securities in any
            jurisdiction where such offer is unlawful.
          </p>
        </div>
      </div>
    </footer>
  );
}
