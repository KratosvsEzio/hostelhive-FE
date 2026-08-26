/**
 * The marketplace event vocabulary.
 *
 * Every event the seeker side sends is declared here, with its parameters typed. GA4 will
 * happily accept any string, which is exactly the problem — a taxonomy that lives only in
 * call sites drifts into `listing_view`, `viewListing` and `listing-viewed` inside a month,
 * and GA4 cannot merge them after the fact.
 *
 * Names are snake_case because that is what GA4's own events use, and mixing conventions
 * makes the reports read badly.
 *
 * **Never put personal data in a parameter.** No names, emails, phone numbers or CNICs —
 * it breaches Google's terms and can get the property terminated. Ids are fine: they mean
 * nothing without our database.
 */
export interface GoogleAnalyticsEvents {
  /** A search was run — the top of the seeker funnel. */
  search_performed: {
    /** City or free-text query, lowercased. Not a person's name — this is a place. */
    query?: string;
    accommodation_type?: string;
    property_type?: string;
    budget_min?: number;
    budget_max?: number;
    /** Rows the API reported, so zero-result searches are visible. */
    result_count: number;
  };

  /** A listing detail page was opened, from wherever. */
  listing_viewed: {
    listing_id: string;
    city?: string;
    accommodation_type?: string;
  };

  /** The sign-in wall appeared in front of a gated action. */
  lead_wall_shown: {
    /** What the seeker was trying to do when it appeared. */
    intent?: string;
  };

  /** A seeker asked to be put in touch with a hostel — the conversion that matters. */
  lead_submitted: {
    listing_id: string;
    city?: string;
  };
}

export type GoogleAnalyticsEventName = keyof GoogleAnalyticsEvents;
