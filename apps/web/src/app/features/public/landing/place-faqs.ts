/**
 * The questions a hostel seeker in Pakistan actually asks, as `FAQPage` structured data.
 *
 * This is the rich result no international travel site competes for, because none of them
 * models what these questions are about: a mess, a warden, a security deposit in months of
 * rent, gender-segregated buildings. Answering them in markup is what puts the answers
 * directly in the result, above ten links that do not.
 *
 * The answers are deliberately general and true of the platform rather than of any one
 * hostel — a per-listing claim we cannot verify would be worse than no markup. Google
 * requires the answer text to also be visible on the page, so these render in an FAQ
 * section on the landing page itself; markup alone would be a violation.
 */
export interface Faq {
  q: string;
  a: string;
}

export function placeFaqs(placeName: string, what: string): Faq[] {
  return [
    {
      q: `Do hostels in ${placeName} include a mess?`,
      a:
        `Many do. Where a hostel provides meals, the listing shows a mess or meals ` +
        `amenity, and the host can tell you which meals are covered and whether the ` +
        `charge is included in the rent or billed separately. Filter by the mess ` +
        `amenity to see only hostels that feed their residents.`,
    },
    {
      q: `How much do ${what} cost in ${placeName}?`,
      a:
        `Rent is quoted per bed per month, and depends on the area, how many people ` +
        `share a room and what the hostel provides. Each listing shows its starting ` +
        `price, and you can filter by budget to see only what you can afford. ` +
        `Backpacker beds are the exception — those are priced per night.`,
    },
    {
      q: `What deposit will I be asked for?`,
      a:
        `Most hostels ask for an advance or security deposit, commonly one or two ` +
        `months' rent, refundable when you leave if there is no damage or unpaid ` +
        `balance. The amount is set by the hostel, not by HostelHive — confirm it with ` +
        `the host before you pay anything.`,
    },
    {
      q: `Are there separate hostels for girls and boys in ${placeName}?`,
      a:
        `Yes. Every listing states whether it is a girls' hostel, a boys' hostel or ` +
        `co-living, and you can filter by that before you browse. Girls' hostels ` +
        `usually have a resident warden and stated entry timings; ask the host for the ` +
        `specifics of any hostel you are considering.`,
    },
    {
      q: `Does HostelHive charge commission?`,
      a:
        `No. You contact the hostel directly and pay the hostel, with no broker in ` +
        `between and no commission to us. Listings marked verified have had their ` +
        `details checked before being published.`,
    },
  ];
}

/** Renders the questions as schema.org `FAQPage` structured data. */
export function faqJsonLd(faqs: Faq[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}
