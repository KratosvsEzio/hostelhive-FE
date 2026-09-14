import { BlogPost, readingMinutes } from './blog-post.model';
import { BLOG_FIGURES, withFigures } from './blog-figures';

/**
 * The archive.
 *
 * Written here rather than fetched: there is no CMS behind this yet, and a marketing
 * section that ships with its content is a section that renders identically on the server,
 * which is the whole point of a page meant to be found in search.
 *
 * Prices are ranges observed in listings and stated as ranges. A blog that quotes one exact
 * rupee figure for a city is wrong in two directions within a month, and a reader who
 * arrives at a viewing quoting it is worse off than one who arrived with a range.
 *
 * Prose uses the typographic apostrophe (U+2019) rather than the straight one, so a
 * single-quoted string never needs escaping mid-sentence.
 */
const POSTS: Omit<BlogPost, 'readMinutes'>[] = [
  {
    slug: 'what-a-hostel-agent-actually-costs-you',
    title: 'What a hostel agent actually costs you',
    excerpt:
      'Dealers charge a finder’s fee for rooms you can find yourself. What the commission really is, when an agent earns it, and how to shortlist without one.',
    category: 'renting-smart',
    publishedAt: '2026-09-04',
    glyph: 'ti-key',
    body: [
      {
        kind: 'p',
        text: 'Ask around for a hostel in a city you do not know and you will be handed a phone number within a day. The property dealer is the default search engine of Pakistani housing, and for a family renting a house he is often genuinely worth what he charges. For a student looking for one bed in a shared room, the arithmetic is different, and almost nobody does it.',
      },
      { kind: 'h2', text: 'What the commission actually is' },
      {
        kind: 'p',
        text: 'There is no single rate, and that is the first thing worth knowing. What you are quoted depends on the city, on whether the hostel already pays the dealer, and on how much of a hurry you appear to be in.',
      },
      {
        kind: 'table',
        head: ['Arrangement', 'What is usually charged', 'Who pays'],
        rows: [
          ['Annual house or flat rent', 'One month’s rent, sometimes split', 'Tenant and owner, one half each'],
          ['Hostel bed, dealer-introduced', 'Half to one month of the bed rate', 'Usually the student'],
          ['Hostel bed, hostel-paid', 'Nothing visible to you', 'The hostel, out of your rent'],
          ['Viewing charge', 'PKR 500 – 2,000 a day', 'The student, whether or not you take a room'],
        ],
      },
      {
        kind: 'p',
        text: 'The third row is the one people miss. A hostel that pays a dealer for every bed filled has to recover that money, and it recovers it from the rent. You do not see a commission line; you see a slightly higher monthly figure than the hostel two streets over that does not use dealers.',
      },
      {
        kind: 'note',
        tone: 'watch',
        title: 'Ask who the agent works for',
        text: 'It is a fair question and the answer changes what the advice is worth. Someone paid by the hostel is not searching on your behalf — he is filling rooms, in an order that has nothing to do with which one suits you. Someone paid by you should be willing to show you places that pay him nothing.',
      },
      { kind: 'h2', text: 'The part that costs more than the commission' },
      {
        kind: 'p',
        text: 'A viewing day works like this. You meet at a point convenient to the agent, not to you. You see four or five places, chosen by what is free that morning rather than by what you asked for. Between them you sit in traffic. By the fourth you have stopped comparing carefully, because you are tired and they have started to blur.',
      },
      {
        kind: 'p',
        text: 'Price that day honestly: a day of your time, PKR 1,000 or so in fares, and a decision made at four in the afternoon when your judgement is at its worst. Repeat it twice, because one day is rarely enough, and the search has cost you more in time than the commission costs in rupees — before you have paid the commission.',
      },
      {
        kind: 'quote',
        text: 'The expensive part of a dealer is not his fee. It is that you see five rooms chosen by someone else instead of fifteen chosen by you.',
      },
      { kind: 'h2', text: 'When an agent is genuinely worth it' },
      {
        kind: 'p',
        text: 'This is not an argument that dealers are useless. There are situations where a good one earns every rupee, and pretending otherwise would be dishonest.',
      },
      {
        kind: 'ul',
        items: [
          [
            { b: 'You have three days and no contacts.' },
            ' Arriving mid-semester into a city where everything is full is exactly the problem a dealer solves. He knows which places have a bed free this week, and no listing updates that fast.',
          ],
          [
            { b: 'You need a whole flat, not a bed.' },
            ' Group rentals involve an owner, a written agreement and a deposit worth arguing about. An agent who does this every week is useful.',
          ],
          [
            { b: 'The area has no online presence at all.' },
            ' Some streets simply are not listed anywhere, and local knowledge is the only way in.',
          ],
        ],
      },
      { kind: 'h2', text: 'What you can do in an evening instead' },
      {
        kind: 'p',
        text: 'For the ordinary case — you know roughly where you need to be, and you are looking for a bed — most of the viewing day is spent gathering information you could have had before leaving the house.',
      },
      {
        kind: 'ol',
        items: [
          'Filter by area and by what you can actually pay, and look at the rent per bed rather than per room, so two hostels are comparable in the first place.',
          'Read what is included. Mess, electricity, and whether the bathroom is attached are the three that move the monthly total most.',
          'Look at the photographs and the room types before you travel, so a place that was never going to suit you costs you thirty seconds instead of an afternoon.',
          'Shortlist three. Then spend one morning seeing three places you chose, rather than a day seeing five somebody else chose.',
        ],
      },
      {
        kind: 'p',
        text: [
          'That is the whole of what this site is for. ',
          { to: '/search', text: 'Browsing listings costs nothing' },
          ', there is no fee for making contact, and the rent shown is the rent the hostel is asking — so the shortlist you arrive with is a real one.',
        ],
      },
      { kind: 'h2', text: 'If you do use an agent, do this' },
      {
        kind: 'ol',
        items: [
          'Agree the fee before the first viewing, in a message you can scroll back to. Not at the end of the day, standing in a room you like.',
          'Ask whether any of the places you are being shown pay him. The answer is informative either way.',
          'Give him your actual requirements in writing — budget, area, occupancy, gender — so that a place outside them is a wasted trip for him too.',
          'See at least one place you found yourself. It is the only way to know whether what you were shown was good.',
        ],
      },
      {
        kind: 'p',
        text: 'None of this makes a dealer the enemy. It makes him one option among several, priced honestly against the others — which is all any of the advice on this site is trying to do.',
      },
    ],
  },

  {
    slug: 'what-a-hostel-room-actually-costs-in-pakistan',
    title: 'What a hostel room actually costs in Pakistan',
    excerpt:
      'The advertised rent is rarely the number you pay. Here is the full monthly cost of a student hostel — mess, utilities, deposit and the charges nobody lists.',
    category: 'renting-smart',
    publishedAt: '2026-08-28',
    featured: true,
    glyph: 'ti-receipt-2',
    body: [
      {
        kind: 'p',
        text: 'Ask three students in the same hostel what they pay and you will get three answers. Not because anyone is lying, but because rent in Pakistani student housing is a headline number that several other charges sit behind. Before you compare two hostels, you need to be comparing the same thing.',
      },
      { kind: 'h2', text: 'The five numbers that make up your monthly cost' },
      {
        kind: 'p',
        text: 'Whatever the poster on the gate says, your real outgoing is the sum of these. Get all five before you decide anything.',
      },
      {
        kind: 'table',
        head: ['What it is', 'Typical range', 'Watch for'],
        rows: [
          ['Rent (per bed, shared room)', 'PKR 8,000 – 18,000', 'Per bed or per room? A 3-seater quoted per room is a different deal.'],
          ['Rent (private room)', 'PKR 22,000 – 45,000', 'Attached bath and AC are what move this range, not location.'],
          ['Mess / food', 'PKR 7,000 – 14,000', 'Optional or compulsory. Compulsory mess you never eat is dead money.'],
          ['Electricity', 'PKR 1,500 – 6,000', 'Split per head or metered per room. AC months change this completely.'],
          ['Security deposit', 'One to two months', 'Refundable — in writing, or treat it as a fee.'],
        ],
      },
      {
        kind: 'note',
        tone: 'tip',
        title: 'Ask for a summer bill',
        text: 'Anyone can quote you a February electricity share. Ask to see a June or July bill for the same room. In an AC hostel that single question can change your annual cost by PKR 20,000 or more.',
      },
      { kind: 'h2', text: 'Why the same room costs different amounts' },
      {
        kind: 'p',
        text: 'Three things move the price far more than the address does, and only one of them is obvious.',
      },
      {
        kind: 'ul',
        items: [
          [{ b: 'Occupancy.' }, ' A bed in a 6-seater is not two-thirds the price of a bed in a 4-seater — it is usually closer to half. The steepest saving in student housing is agreeing to share with more people.'],
          [{ b: 'Attached bathroom.' }, ' In most of Lahore and Islamabad this is the single biggest jump on the sheet, often PKR 4,000–6,000 a month per bed.'],
          [{ b: 'How you pay.' }, ' Quarterly or annual payment is frequently discounted, sometimes by a full month. It is rarely advertised and almost always available if you ask.'],
        ],
      },
      {
        kind: 'p',
        text: 'Floor level matters more than anyone tells you, and in both directions. A top-floor room under an uninsulated roof runs several degrees hotter through June and July, which you pay for in electricity rather than in rent. A ground-floor room beside the common area is cheaper for a reason you will discover at eleven at night.',
      },
      { kind: 'h2', text: 'The charges that appear later' },
      {
        kind: 'p',
        text: 'These are not scams and most hostels will tell you if asked. The problem is that almost nobody asks, and they are never on the poster.',
      },
      {
        kind: 'ul',
        items: [
          'Generator or UPS share during load-shedding, billed separately from electricity.',
          'A one-time admission or registration charge, typically PKR 2,000–5,000.',
          'Laundry, if it is not included — per item or a monthly flat rate.',
          'Guest charges for a friend or sibling staying the night.',
          'Notice period. Leaving without the agreed notice, usually one month, normally costs the deposit.',
        ],
      },
      { kind: 'h2', text: 'What the deposit actually secures' },
      {
        kind: 'p',
        text: 'A security deposit is meant to cover damage and unpaid dues, and to come back to you when you leave in good order. In practice it is the most disputed number in student housing, because it is handed over in cash at a moment when you are keen to move in, and returned at a moment when you have already gone.',
      },
      {
        kind: 'p',
        text: 'You do not need a lawyer to protect it. You need three things written down, and any hostel worth living in will give you all three without a fuss: the amount, the conditions under which it can be withheld, and the number of days within which it is returned after you vacate.',
      },
      {
        kind: 'note',
        tone: 'watch',
        title: 'Photograph the room on day one',
        text: 'Walls, mattress, cupboard, bathroom fittings, window catch. Ten photographs cost you two minutes and settle every later argument about a pre-existing crack or stain. Send them to yourself on WhatsApp, so the timestamp is not one you could have edited.',
      },
      { kind: 'h2', text: 'Monthly, quarterly, or the whole year' },
      {
        kind: 'p',
        text: 'Most hostels quote monthly, because it is the smallest number they can put on the board. Ask what changes if you pay for three months, or for a full academic year, and you will often find a discount that was never advertised — commonly five to ten percent, sometimes a free month against a twelve-month commitment.',
      },
      {
        kind: 'p',
        text: 'That discount is real money, but you buy it with flexibility, and flexibility is worth a great deal in your first semester somewhere new. A reasonable middle path: pay monthly until you are sure the place suits you, including one summer month if the timing allows, then convert to quarterly for the saving.',
      },
      {
        kind: 'quote',
        text: 'A hostel that answers every cost question in one sitting is telling you something about how it will handle the next twelve months.',
      },
      { kind: 'h2', text: 'How to compare two hostels honestly' },
      {
        kind: 'ol',
        items: [
          'Write both down as a twelve-month total, not a monthly one. Deposits and admission fees only show up properly at that scale.',
          'Add your commute. A hostel PKR 3,000 cheaper that costs PKR 200 a day in vans and rickshaws is the more expensive hostel.',
          'Price the mess separately. If it is compulsory, count it as rent, because that is what it is.',
          'Count two summer months of electricity at the peak figure rather than the average. The average is what you are quoted; the peak is what you pay in July.',
          'Ask what is refundable, and get that sentence in writing before you pay anything at all.',
        ],
      },
      {
        kind: 'p',
        text: [
          { to: '/search', text: 'Every listing on HostelHive' },
          ' shows rent per bed or per room with the occupancy stated, so the first of those five steps is already done for you. The others are still yours — and they are the ones that save the money.',
        ],
      },
    ],
  },

  {
    slug: 'student-hostels-in-lahore-a-practical-guide',
    spotlight: true,
    title: 'Student hostels in Lahore: a practical area-by-area guide',
    excerpt:
      'Johar Town, Township, Gulberg or Iqbal Town — what each area costs, who it suits, and how long the commute to campus really takes.',
    category: 'city-guides',
    publishedAt: '2026-08-20',
    glyph: 'ti-building-arch',
    body: [
      {
        kind: 'p',
        text: 'Lahore does not have one student housing market. It has four or five, they price differently, and which one you belong in is decided almost entirely by where you have to be at 8am.',
      },
      {
        kind: 'p',
        text: 'The city rewards students who work this out early. Move for the rent alone and you can spend the saving twice over on vans, rickshaws and the hours they take. What follows is each area as students actually use it, rather than as the property boards describe it.',
      },
      { kind: 'h2', text: 'Johar Town' },
      {
        kind: 'p',
        text: 'The densest concentration of purpose-built student hostels in the city, and the default for anyone at UMT, UCP or the Doctors Hospital side of town. Expect PKR 10,000–16,000 for a bed in a shared room, more for attached bath.',
      },
      {
        kind: 'p',
        text: 'What you are buying here is walkability. Groceries, printing shops, tuition centres and food are all within a few blocks, which matters more than it sounds when you do not have a bike. It is also the easiest area in Lahore to find a room mid-semester, because turnover is constant.',
      },
      {
        kind: 'p',
        text: 'The trade is noise and sameness. Blocks of converted houses sit wall to wall, the streets stay busy late, and a room facing the road is a different proposition from one facing the back. Ask which way the window points before you agree to anything.',
      },
      { kind: 'h2', text: 'Township and College Road' },
      {
        kind: 'p',
        text: 'Cheaper than Johar Town by a few thousand rupees a month for a comparable bed, and the usual answer for students who want to be near the Johar Town institutions without paying Johar Town prices. The buildings are more often ordinary houses converted room by room.',
      },
      {
        kind: 'p',
        text: 'Quality varies more here than anywhere else in the city, which is exactly why the saving exists. Two hostels on one street can be a well-run twelve-room house and a badly partitioned one with a single bathroom for nine people, and the rent will be within a thousand rupees of each other. This is an area to inspect in person, not to book from photographs.',
      },
      { kind: 'h2', text: 'Gulberg' },
      {
        kind: 'p',
        text: 'Central, well connected, and priced accordingly. A shared bed runs PKR 14,000–22,000 and private rooms move well past PKR 35,000. You are paying for the address and for being roughly equidistant from everywhere, which is genuinely useful if your week is split between a campus, an internship and a tuition centre.',
      },
      {
        kind: 'p',
        text: 'For a first-year undergraduate on a fixed allowance it is usually the wrong call. For a final-year student doing an internship in a commercial area, the commute it removes can justify the difference on its own.',
      },
      { kind: 'h2', text: 'Iqbal Town and Samanabad' },
      {
        kind: 'p',
        text: 'The value end of the established market. Beds from around PKR 8,000, family-run hostels, quieter streets, and on average the strictest gate rules in the city. If curfews and guest policies matter to you — in either direction — this is the area where you must ask rather than assume.',
      },
      { kind: 'h2', text: 'What each area actually costs' },
      {
        kind: 'table',
        head: ['Area', 'Shared bed / month', 'Best for'],
        rows: [
          ['Johar Town', 'PKR 10,000 – 16,000', 'UMT, UCP, medical, and anyone who wants to walk everywhere'],
          ['Township / College Road', 'PKR 8,000 – 13,000', 'The same campuses on a tighter budget, if you inspect carefully'],
          ['Gulberg', 'PKR 14,000 – 22,000', 'Internships, split weeks, central everything'],
          ['Iqbal Town / Samanabad', 'PKR 8,000 – 12,000', 'Quiet, family-run, longest stays'],
          ['Model Town / canal side', 'PKR 12,000 – 18,000', 'A straight run to campus without a city-centre premium'],
        ],
      },
      {
        kind: 'note',
        tone: 'watch',
        title: 'Converted houses vary wildly',
        text: 'A great deal of Lahore student housing is a family home with beds in it. That is not a problem in itself — some of the best-run hostels in the city are exactly this — but it means the building was never designed for twelve people. Count bathrooms per resident, find out where the water tank is, and ask what happens when the motor fails.',
      },
      { kind: 'h2', text: 'The commute is the real price' },
      {
        kind: 'p',
        text: 'Lahore traffic does not scale with distance. Four kilometres across Johar Town at 8am and four kilometres down Ferozepur Road are different journeys, and only one of them is predictable. Before you sign anywhere, make the trip once at the hour you will actually make it — not on a Sunday afternoon, when it takes half as long.',
      },
      {
        kind: 'ul',
        items: [
          'Ask current residents what they spend per day on vans and rickshaws, rather than what the distance is. The number is the answer.',
          'Check whether a university shuttle passes the area, and whether its last run matches when you actually leave the library.',
          'If you ride, ask where the bike is parked overnight and who is responsible if it is not there in the morning.',
        ],
      },
      { kind: 'h2', text: 'When to look' },
      {
        kind: 'p',
        text: 'The market tightens sharply in the weeks around the start of the autumn semester, and the same room can carry a higher asking price simply because three people are looking at it that week. If your admission is confirmed early, looking in the quieter part of summer buys you a better choice and a better negotiating position at the same time.',
      },
      {
        kind: 'p',
        text: [
          'Mid-semester is the other quiet window. Students leave for all sorts of reasons, and a hostel with an empty bed in October would much rather fill it now than in February. It costs nothing to ',
          { to: '/search', text: 'look at what is listed in Lahore' },
          ' before you start walking streets.',
        ],
      },
    ],
  },

  {
    slug: 'student-hostels-in-islamabad-sector-by-sector',
    title: 'Student hostels in Islamabad, sector by sector',
    excerpt:
      'G-11, H-13, I-8 or Bani Gala — Islamabad sectors are not interchangeable. What each one costs and which campuses it actually serves.',
    category: 'city-guides',
    publishedAt: '2026-08-11',
    glyph: 'ti-mountain',
    body: [
      {
        kind: 'p',
        text: 'Islamabad is the easiest Pakistani city to navigate and one of the harder ones to find student housing in. The grid makes directions simple; it does not make sectors equivalent. Rent inside the city can be double what the same room costs across the expressway.',
      },
      {
        kind: 'p',
        text: 'Read a sector name as three facts at once: which campuses it serves, how it is connected after dark, and whether hostels there operate with the society’s blessing or in spite of it. The third one decides how long your address lasts.',
      },
      { kind: 'h2', text: 'G-11 and G-10' },
      {
        kind: 'p',
        text: 'Central, well served by transport, and the sectors most students name first. Beds in shared rooms run roughly PKR 14,000–20,000, private rooms well past PKR 30,000. You are paying for position: almost everything in Islamabad is twenty minutes away from here.',
      },
      {
        kind: 'p',
        text: 'G-11 in particular is the sector to choose if your week is unpredictable — an internship in Blue Area on some days, a campus on others, a tuition centre on the rest. Nothing is far, which means nothing about your timetable can strand you.',
      },
      { kind: 'h2', text: 'H-13 and the NUST corridor' },
      {
        kind: 'p',
        text: 'The student belt proper. Purpose-built hostels, walkable to NUST, and priced a little below the G sectors at around PKR 12,000–17,000 a bed. It is quieter than G-11 in a way that suits some people and bores others.',
      },
      {
        kind: 'p',
        text: 'Because so much of the stock here was built as student housing rather than converted into it, the basics tend to be better: more bathrooms per resident, proper study desks, and rooms sized for the number of beds in them. Compare that against a converted house in a G sector before you decide the G sector is the upgrade.',
      },
      {
        kind: 'note',
        tone: 'tip',
        title: 'Check the semester calendar',
        text: 'Hostel availability in H-13 collapses in the fortnight before a NUST semester starts and loosens again a month in. Looking in the gap between intakes gets you both better rooms and better rates.',
      },
      { kind: 'h2', text: 'I-8, I-9 and I-10' },
      {
        kind: 'p',
        text: 'The practical middle. Mixed residential and commercial, decent transport, and prices in the PKR 10,000–15,000 range for a bed. I-8 in particular works well for anyone commuting to Rawalpindi as often as into Islamabad proper, because it sits on the right side of the city for both.',
      },
      {
        kind: 'p',
        text: 'I-9 and I-10 lean industrial and commercial, which keeps rents down and makes the evening character of a particular street worth checking in person rather than on a map.',
      },
      { kind: 'h2', text: 'Bani Gala and the outskirts' },
      {
        kind: 'p',
        text: 'Noticeably cheaper and noticeably further. Worth considering if your campus is on that side or you have your own transport; a poor idea if you will be depending on public transport during a wet January.',
      },
      { kind: 'h2', text: 'The sectors side by side' },
      {
        kind: 'table',
        head: ['Sector', 'Bed, shared room', 'Serves'],
        rows: [
          ['G-10 / G-11', 'PKR 14,000 – 20,000', 'Central everything, Blue Area internships, split weeks'],
          ['H-13', 'PKR 12,000 – 17,000', 'NUST, and anyone who wants purpose-built rather than converted'],
          ['I-8', 'PKR 11,000 – 15,000', 'Both cities at once — the best base for a Pindi-facing timetable'],
          ['I-9 / I-10', 'PKR 10,000 – 14,000', 'Budget rooms, if you check the street in the evening'],
          ['Bani Gala / outskirts', 'PKR 7,000 – 11,000', 'Own transport, campuses on that side'],
        ],
      },
      { kind: 'h2', text: 'Islamabad-specific things worth asking' },
      {
        kind: 'ul',
        items: [
          'Gas and winter heating. Islamabad winters are genuinely cold and gas pressure drops when it matters most. Ask what heating is provided and what it adds to the bill.',
          'Whether the hostel is registered. Islamabad has been stricter than most cities about unregistered hostels in residential sectors, and a sudden closure is a real risk to plan around.',
          'Transport at night. Ride-hailing coverage is good in the city and thins out fast on the outskirts.',
          'Sector rules. Some housing societies restrict hostel operations entirely; a hostel operating quietly in one is not a stable place to keep your belongings.',
        ],
      },
      {
        kind: 'p',
        text: 'The registration question is worth pressing on, politely but properly. It is the one issue in this city that can cost you your room with a few days’ notice, no matter how well you have got on with everyone in the building.',
      },
      {
        kind: 'quote',
        text: 'In Islamabad the question is not which sector is best. It is which sector is on the same side of the city as the place you have to be every morning.',
      },
      { kind: 'h2', text: 'Winter is the season to plan for' },
      {
        kind: 'p',
        text: 'Most students look for a room in late summer, when a cold room is a hypothetical. Ask the January questions anyway: how the room is heated, what the gas situation is at seven in the morning, whether hot water is constant or on a timer, and what the electricity bill looked like in December.',
      },
      {
        kind: 'p',
        text: 'A hostel that answers those four clearly in August is the one you will still be glad of in January.',
      },
    ],
  },

  {
    slug: 'student-hostels-in-karachi-where-students-live',
    title: 'Student hostels in Karachi: where students actually live',
    excerpt:
      'Gulshan, Nazimabad, DHA or near the universities themselves — the trade-off in Karachi is always rent against time lost on the road.',
    category: 'city-guides',
    publishedAt: '2026-08-05',
    glyph: 'ti-building-skyscraper',
    body: [
      {
        kind: 'p',
        text: 'Karachi is large enough that a cheap hostel in the wrong place is not a saving. Distances that look trivial on a map turn into ninety-minute commutes twice a day, and that is the cost that compounds.',
      },
      {
        kind: 'p',
        text: 'The city also asks two questions no other Pakistani city asks as loudly: how water reaches the building, and what the route home looks like after dark. Get those right and the rest is ordinary house-hunting.',
      },
      { kind: 'h2', text: 'Gulshan-e-Iqbal' },
      {
        kind: 'p',
        text: 'The student centre of gravity, and reasonably so: Karachi University, NED and several private campuses are all within reach. Beds in shared rooms sit around PKR 9,000–15,000. Supply is good, which also means quality varies enormously between two hostels on the same block.',
      },
      {
        kind: 'p',
        text: 'Because there is so much of it, Gulshan is the one area in Karachi where you can afford to be fussy. See four places before you choose. The fourth is usually better than the first at the same rent, purely because you have learnt what to look at.',
      },
      { kind: 'h2', text: 'Nazimabad and North Nazimabad' },
      {
        kind: 'p',
        text: 'Older, established and generally cheaper at PKR 7,000–12,000 a bed. Well connected northwards, less convenient if your campus is out towards DHA or Korangi. A sensible choice for anyone at the nearby medical and government colleges.',
      },
      { kind: 'h2', text: 'Gulistan-e-Johar' },
      {
        kind: 'p',
        text: 'The middle option, and an underrated one. Rents run PKR 8,000–13,000, road links are decent in several directions at once, and it is close enough to the Gulshan campuses to work without paying Gulshan prices. The catch is that it is spread out, so the specific block matters more than the area name.',
      },
      { kind: 'h2', text: 'DHA and Clifton' },
      {
        kind: 'p',
        text: 'Expensive, quieter and mostly relevant to students at IBA City Campus or the private universities on that side. Private rooms start high and shared options are comparatively scarce, because the housing stock was never built for it.',
      },
      {
        kind: 'note',
        tone: 'watch',
        title: 'Water is the Karachi question',
        text: 'Ask how water reaches the building — municipal supply, a bore, or tankers — and how often tankers are needed in summer. Every other amenity is negotiable; this one decides whether the hostel is livable in May.',
      },
      { kind: 'h2', text: 'Commute as a cost, not a detail' },
      {
        kind: 'p',
        text: 'Price the journey before you price the room. A bus pass or a daily rickshaw across Karachi is a real monthly line item, and at some point it exceeds the rent difference that made you look further out in the first place.',
      },
      {
        kind: 'p',
        text: 'Do the arithmetic once, properly. Two rickshaw legs a day at PKR 150 each, six days a week, is about PKR 7,800 a month — which is most of the gap between a Nazimabad bed and a Gulshan one. If the cheaper room is an hour further away, it is not cheaper.',
      },
      {
        kind: 'table',
        head: ['Area', 'Bed, shared room', 'Best for'],
        rows: [
          ['Gulshan-e-Iqbal', 'PKR 9,000 – 15,000', 'KU, NED, nearby private campuses'],
          ['Nazimabad', 'PKR 7,000 – 12,000', 'Medical and government colleges to the north'],
          ['DHA / Clifton', 'PKR 18,000+', 'IBA City, southern private universities'],
          ['Gulistan-e-Johar', 'PKR 8,000 – 13,000', 'A middle option with decent road links'],
        ],
      },
      { kind: 'h2', text: 'Before you pay' },
      {
        kind: 'ul',
        items: [
          'Visit in the evening as well as the day. Noise, lighting on the approach road and who is actually around are all evening facts.',
          'Confirm generator hours. Karachi outages are shorter than they were and still long enough to matter in June.',
          'Ask about the route to campus after dark, particularly if you will have evening classes or a late library habit.',
          'Find out who is at the gate at night, and whether that is a person or a lock. The answer tells you what the hostel thinks security means.',
        ],
      },
      {
        kind: 'quote',
        text: 'In Karachi the rent is the easy number. Water, the road home at night, and the hour you lose each way are the ones that decide whether you stay.',
      },
    ],
  },

  {
    slug: 'rawalpindi-or-islamabad-for-students',
    title: 'Rawalpindi or Islamabad? Reading the rent-versus-commute trade',
    excerpt:
      'Rawalpindi hostels can be a third cheaper than Islamabad ones a few kilometres away. Here is when that maths works and when it quietly does not.',
    category: 'city-guides',
    publishedAt: '2026-07-16',
    glyph: 'ti-arrows-left-right',
    body: [
      {
        kind: 'p',
        text: 'The twin cities are close enough that students routinely live in one and study in the other. The rent gap is real and large. Whether it is worth taking depends on facts about your timetable that no listing can know.',
      },
      { kind: 'h2', text: 'The gap, in numbers' },
      {
        kind: 'table',
        head: ['', 'Rawalpindi', 'Islamabad'],
        rows: [
          ['Bed, shared room', 'PKR 7,000 – 12,000', 'PKR 12,000 – 20,000'],
          ['Private room', 'PKR 15,000 – 25,000', 'PKR 28,000 – 45,000'],
          ['Typical mess', 'PKR 6,000 – 10,000', 'PKR 8,000 – 14,000'],
        ],
      },
      {
        kind: 'p',
        text: 'Saddar, Satellite Town and the Murree Road corridor carry most of the student supply on the Rawalpindi side, and they are well connected by the Metro Bus — which is the single fact that makes the whole trade viable.',
      },
      { kind: 'h2', text: 'What the Metro Bus does and does not solve' },
      {
        kind: 'p',
        text: 'The corridor itself is fast, frequent and cheap, and it runs the length of Murree Road into the centre of Islamabad. If your hostel is a short walk from a station and your campus is a short walk from another, the commute is genuinely comfortable and the saving is close to free money.',
      },
      {
        kind: 'p',
        text: 'The part people underestimate is the last two kilometres at each end. A feeder route, a rickshaw or a fifteen-minute walk in July heat is the bit that turns a pleasant thirty-minute ride into an hour each way. Measure the whole door-to-door journey, not the part that happens on the bus.',
      },
      { kind: 'h2', text: 'When Rawalpindi wins' },
      {
        kind: 'ul',
        items: [
          'Your campus is near a Metro Bus station, or on the Rawalpindi side to begin with.',
          'Your classes are clustered — three long days beat five short ones when every day costs you two commutes.',
          'You are paying your own rent. The saving is roughly a month of rent a year, which is not abstract when it is your money.',
        ],
      },
      { kind: 'h2', text: 'When it quietly does not' },
      {
        kind: 'ul',
        items: [
          'Evening labs, studio work or a society that meets at night. The commute that is fine at 5pm is a different proposition at 10pm.',
          'A campus that is a long feeder ride from the nearest Metro stop. The bus is fast; the last two kilometres often are not.',
          'Winter fog season, when the Islamabad Expressway and GT Road both slow down for weeks at a time.',
        ],
      },
      { kind: 'h2', text: 'The arithmetic, done once' },
      {
        kind: 'p',
        text: 'Take a PKR 5,000 monthly saving on rent, which is a fair middle estimate of the gap. Against it put the daily fare both ways, the feeder legs at either end, and — this is the part nobody prices — about ten hours a month of your life.',
      },
      {
        kind: 'p',
        text: 'If the fares come to PKR 2,500 and the journey is comfortable, you are still PKR 30,000 a year better off and the trade is sound. If the fares come to PKR 4,000 and you arrive tired twice a day, you have sold ten hours a month for almost nothing.',
      },
      {
        kind: 'note',
        tone: 'tip',
        title: 'Do the commute before you sign',
        text: 'Travel from the hostel gate to your campus gate once, on a weekday, at the time your first class actually starts. One trip tells you more than any amount of comparing.',
      },
      {
        kind: 'quote',
        text: 'Cheaper rent buys you money. A shorter commute buys you an hour a day, every day, for a year. Only you know which one you are short of.',
      },
    ],
  },

  {
    slug: 'hostels-near-punjab-university-lahore',
    title: 'Hostels near Punjab University, Lahore',
    excerpt:
      'New Campus and Old Campus are eleven kilometres apart and need completely different housing. Where to look for each, and what it costs.',
    category: 'near-campus',
    publishedAt: '2026-07-24',
    glyph: 'ti-school',
    body: [
      {
        kind: 'p',
        text: 'The first mistake students make searching for a hostel near Punjab University is treating it as one place. New Campus is out on Canal Road; Old Campus sits near Anarkali in the old city. A hostel that is perfect for one is an hour from the other.',
      },
      {
        kind: 'p',
        text: 'So the first question is not where to live. It is where you will actually be taught — and for a surprising number of departments the honest answer is both.',
      },
      { kind: 'h2', text: 'For New Campus (Quaid-e-Azam Campus)' },
      {
        kind: 'p',
        text: 'Look at Township, Wahdat Colony, Muslim Town and the Canal Road side generally. Beds in shared rooms run about PKR 8,000–14,000, which is among the better value in Lahore for the proximity you get.',
      },
      {
        kind: 'ul',
        items: [
          'Township — the largest supply, and van routes onto campus are frequent and cheap.',
          'Muslim Town — slightly pricier, closer, and quieter at night.',
          'Wahdat Colony — well priced, dense with students, walkable to Canal Road transport.',
        ],
      },
      {
        kind: 'p',
        text: 'New Campus is large and the gates are far apart. Ten minutes from the campus boundary can be half an hour from your department, so measure from the building you will actually walk into rather than from the nearest point on the map.',
      },
      { kind: 'h2', text: 'For Old Campus' },
      {
        kind: 'p',
        text: 'Anarkali, Mozang and the Mall Road belt. Older buildings, tighter streets and a very different atmosphere. Rents are low — often PKR 7,000–11,000 a bed — but you should view in person, because photographs flatter this stock more than any other in the city.',
      },
      {
        kind: 'p',
        text: 'What the old city gives you in exchange is everything within walking distance and some of the cheapest food in Lahore. What it asks of you is tolerance for noise and a careful look at ventilation, damp and how many people share a bathroom.',
      },
      { kind: 'h2', text: 'What each side costs' },
      {
        kind: 'table',
        head: ['Area', 'Bed, shared room', 'Serves'],
        rows: [
          ['Township', 'PKR 8,000 – 12,000', 'New Campus, on the largest supply of rooms'],
          ['Muslim Town', 'PKR 10,000 – 14,000', 'New Campus, quieter and closer'],
          ['Wahdat Colony', 'PKR 8,000 – 13,000', 'New Campus, good transport links'],
          ['Anarkali / Mozang', 'PKR 7,000 – 11,000', 'Old Campus, walkable, view in person'],
        ],
      },
      {
        kind: 'note',
        tone: 'tip',
        title: 'Confirm which campus your department is on',
        text: 'Several departments teach across both. Ask a senior in your specific department where their classes actually are before you choose an area — the university website is not always current.',
      },
      { kind: 'h2', text: 'University hostels first' },
      {
        kind: 'p',
        text: 'Punjab University runs its own hostels and they are far cheaper than anything private. The waiting lists are long and largely merit-based, and a place can come free between semesters when someone graduates or moves out.',
      },
      {
        kind: 'p',
        text: 'The sensible strategy is to apply, keep applying, and take a private room for the first semester on monthly terms rather than a year’s commitment. That way an allocation in February is good news rather than a forfeited deposit.',
      },
      { kind: 'h2', text: 'Practical notes' },
      {
        kind: 'ul',
        items: [
          'Canal Road traffic is predictable in the wrong way. Add fifteen minutes to any morning estimate you are given.',
          'The area empties out over summer break, which is the best time to view rooms and negotiate.',
          'Ask about the van arrangement specifically: which route, what it costs per month, and what time the last run back is.',
          'If you will be in the library late, check that the gate is staffed at that hour rather than simply locked.',
        ],
      },
      {
        kind: 'quote',
        text: 'Pick the campus first, the area second, and the room third. Doing it in any other order is how students end up moving in October.',
      },
    ],
  },

  {
    slug: 'hostels-near-nust-islamabad',
    title: 'Hostels near NUST, Islamabad',
    excerpt:
      'H-13 is the obvious answer and not always the right one. What it costs around NUST, and the two sectors worth checking before you settle.',
    category: 'near-campus',
    publishedAt: '2026-07-09',
    glyph: 'ti-building-community',
    body: [
      {
        kind: 'p',
        text: 'NUST sits in H-12, and almost every private hostel serving it is in H-13 next door. That is convenient and it is also why H-13 prices hold firm even when the rest of Islamabad softens.',
      },
      { kind: 'h2', text: 'H-13, the default' },
      {
        kind: 'p',
        text: 'Purpose-built student blocks, ten to twenty minutes from the campus gate depending on which school you are in. Beds in shared rooms typically PKR 12,000–17,000, private rooms from around PKR 25,000.',
      },
      {
        kind: 'p',
        text: 'The advantage is not just distance. It is that everything around you is priced for students — food, printing, laundry — in a city where very little else is.',
      },
      {
        kind: 'p',
        text: 'It is also, for better and worse, a student monoculture. Almost everyone around you is at the same university on a similar timetable, which makes group work easy and makes the fortnight before finals a strange place to live.',
      },
      { kind: 'h2', text: 'Worth checking first' },
      {
        kind: 'ul',
        items: [
          'G-13 and G-14 — a short ride away, generally a little cheaper, and more residential in character. Good if you want some distance between where you study and where you sleep.',
          'Golra and the outskirts towards the motorway — noticeably cheaper, but depend on having transport or a reliable van arrangement.',
        ],
      },
      {
        kind: 'note',
        tone: 'watch',
        title: 'NUST is a big campus',
        text: 'SEECS, SMME and NBS are a genuine walk apart. Ten minutes from NUST usually means ten minutes from the main gate, which is not the same as ten minutes from your department. Ask which gate, then measure from there.',
      },
      { kind: 'h2', text: 'What to compare once you are in H-13' },
      {
        kind: 'p',
        text: 'When forty buildings are the same distance from the same gate, distance stops being a reason to choose. These are what actually differ.',
      },
      {
        kind: 'ol',
        items: [
          'Internet at eleven at night, when the whole block is online and a submission is due. Ask residents, not the manager.',
          'Study space that is not your bed. A desk per person and a quiet common room are worth more here than in most cities, because the semester is relentless.',
          'Heating in winter and what it adds to the bill. Islamabad in January is cold in a way an August viewing will not tell you.',
          'Whether the mess is compulsory, and what happens to it during exam weeks when nobody eats on schedule.',
        ],
      },
      { kind: 'h2', text: 'On-campus first' },
      {
        kind: 'p',
        text: 'NUST hostels are cheaper and closer than anything private, and allocation is competitive. Apply early and keep applying between semesters — places come free more often than most students assume, particularly after the first year.',
      },
      {
        kind: 'p',
        text: [
          'Until then, take a private room on terms you can leave. A monthly arrangement costs a little more per month and it costs a great deal less than paying a year up front and being allocated a campus room in the spring. Start from ',
          { to: '/search', text: 'what is available around H-13' },
          ' and narrow by occupancy before you visit anything.',
        ],
      },
    ],
  },

  {
    slug: 'hostels-near-umt-and-johar-town-lahore',
    title: 'Hostels near UMT and Johar Town, Lahore',
    excerpt:
      'The densest student hostel market in Lahore. What separates a good block from a bad one on the same street, and what you should be paying.',
    category: 'near-campus',
    publishedAt: '2026-06-30',
    glyph: 'ti-map-pin',
    body: [
      {
        kind: 'p',
        text: 'Johar Town has more student hostels per square kilometre than anywhere else in Lahore. That is good for choice and bad for judgement: with forty options inside a twenty-minute walk, the deciding factors stop being location and start being everything else.',
      },
      { kind: 'h2', text: 'What you should be paying' },
      {
        kind: 'table',
        head: ['Room', 'Typical range', 'Notes'],
        rows: [
          ['Bed, 4–6 seater', 'PKR 9,000 – 13,000', 'The volume market. Attached bath adds PKR 3,000–5,000.'],
          ['Bed, 2–3 seater', 'PKR 13,000 – 18,000', 'The sweet spot for most people who can afford it.'],
          ['Private room', 'PKR 25,000 – 38,000', 'Verify whether AC running cost is included or billed.'],
        ],
      },
      {
        kind: 'p',
        text: 'Anything meaningfully below those ranges on this belt is worth understanding rather than celebrating. It usually means more beds in the room than advertised, a bathroom shared by more people than you would choose, or a building where nothing has been repaired in a while.',
      },
      { kind: 'h2', text: 'How to tell two hostels apart' },
      {
        kind: 'p',
        text: 'On a street where every building advertises the same things, these are what actually differ.',
      },
      {
        kind: 'ol',
        items: [
          [{ b: 'The kitchen.' }, ' Ask to see it, not the dining room. It tells you more about how the place is run than any bedroom will.'],
          [{ b: 'The stairwell and the roof.' }, ' Maintained common areas mean a manager who spends money; a clean room with a filthy stairwell means one who spends it only where viewers look.'],
          [{ b: 'Who answers when something breaks.' }, ' Is there a resident warden, or a phone number that goes to a landlord in another city?'],
          [{ b: 'Internet under load.' }, ' Not the speed test at noon — ask residents what it is like at 11pm when everyone is online at once.'],
          [{ b: 'The water arrangement.' }, ' Where the tank is, when it fills, and what happens on a day the motor does not work.'],
        ],
      },
      {
        kind: 'note',
        tone: 'tip',
        title: 'Talk to someone already living there',
        text: 'Not the manager, and not in the manager’s office. Two minutes with a resident at the gate is the most reliable research available to you, and it is free.',
      },
      { kind: 'h2', text: 'The questions that save money later' },
      {
        kind: 'ul',
        items: [
          'Is electricity split per head or metered per room? In a block with unequal AC use, per-head splitting quietly subsidises whoever runs theirs longest.',
          'What is the notice period, and what does leaving early actually cost?',
          'Is the mess compulsory? If so, count it as rent when you compare, because that is what it is.',
          'What does the deposit cover, and how many days after leaving is it returned?',
        ],
      },
      { kind: 'h2', text: 'Getting to campus' },
      {
        kind: 'p',
        text: 'Most of Johar Town is a ten to twenty minute walk from UMT, and a short rickshaw otherwise. UCP, Superior and the Doctors Hospital area are all within a similar radius, which is why this belt suits students from several universities at once.',
      },
      {
        kind: 'p',
        text: 'That density is the real argument for paying Johar Town prices. If you change university, change internship or change plans entirely, you almost certainly do not have to change address.',
      },
    ],
  },

  {
    slug: 'backpacker-hostels-in-hunza-valley',
    spotlight: true,
    title: 'Backpacker hostels in Hunza Valley: a season-by-season guide',
    excerpt:
      'Karimabad, Aliabad or Passu — what a dorm bed costs in Hunza, when the valley is worth the journey, and what closes in winter.',
    category: 'northern-areas',
    publishedAt: '2026-06-23',
    glyph: 'ti-tent',
    body: [
      {
        kind: 'p',
        text: 'Hunza has more genuine backpacker hostels than anywhere else in Pakistan — dorm beds, shared kitchens, common rooms where people actually talk to each other. It also has a season, and arriving outside it changes the trip completely.',
      },
      { kind: 'h2', text: 'When to go' },
      {
        kind: 'table',
        head: ['Season', 'Months', 'What it is like'],
        rows: [
          ['Blossom', 'Late March – April', 'Apricot blossom, cold nights, thin crowds. Many travellers’ favourite.'],
          ['Summer', 'May – August', 'Everything open, everything busy, book ahead for Karimabad.'],
          ['Autumn', 'September – October', 'The colours people come for. Clear skies, sharp nights.'],
          ['Winter', 'November – February', 'Quiet, beautiful and cold. Much is closed; the KKH can shut.'],
        ],
      },
      {
        kind: 'p',
        text: 'If you have one week and full choice of dates, take the second half of September or the first half of October. The light is better, the valley is emptier than in August, and you can still get everywhere.',
      },
      { kind: 'h2', text: 'Where to base yourself' },
      {
        kind: 'ul',
        items: [
          [{ b: 'Karimabad' }, ' — the centre of gravity. Views over the valley, the most hostels, the most other travellers. Dorm beds roughly PKR 1,200–2,500 a night in season.'],
          [{ b: 'Aliabad' }, ' — larger, more functional, cheaper. Better for supplies and transport, less for atmosphere.'],
          [{ b: 'Gulmit and Passu' }, ' — further up, quieter, spectacular. Fewer beds, so plan ahead rather than arriving hopeful.'],
        ],
      },
      {
        kind: 'p',
        text: 'A pattern that works well on a week-long trip: three nights in Karimabad to see the valley and meet people, then two further up around Passu, where the mountains stop being scenery and start being the whole horizon.',
      },
      {
        kind: 'note',
        tone: 'watch',
        title: 'Cash and connectivity',
        text: 'ATMs exist in Aliabad and are not reliable. Carry more cash than you think you need. SCOM has the broadest mobile coverage in the valley; other networks thin out quickly past Aliabad.',
      },
      { kind: 'h2', text: 'What a dorm bed includes' },
      {
        kind: 'p',
        text: 'Usually a bed, blankets, hot water at some hours, and a kitchen you may use. Usually not heating — most rooms rely on blankets and a shared stove in the common area, which is entirely adequate in October and worth thinking about in January.',
      },
      {
        kind: 'p',
        text: 'Hot water is the detail worth pinning down. In much of the valley it runs on a solar or a timed geyser, which means there are good hours and bad ones. Ask which they are, and plan your shower rather than discovering the answer at seven in the morning.',
      },
      {
        kind: 'quote',
        text: 'The common room is the product. If a hostel in Hunza has nowhere for people to sit together in the evening, it is a guesthouse charging dorm prices.',
      },
      { kind: 'h2', text: 'Getting there' },
      {
        kind: 'p',
        text: 'Islamabad to Gilgit by air is an hour and cancels often for weather; by road it is roughly eighteen to twenty-four hours on the Karakoram Highway. Most people book the flight and plan for the bus. From Gilgit, Hunza is a further two to three hours.',
      },
      {
        kind: 'p',
        text: 'If you take the road, the overnight coaches from Rawalpindi are the standard option and better than their reputation. Sit on the left going north for the river, and accept that any schedule on this route is a hope rather than a promise — landslides and weather rewrite it regularly.',
      },
      { kind: 'h2', text: 'What it costs for a week' },
      {
        kind: 'p',
        text: 'A realistic budget outside the flight: PKR 1,500–2,500 a night for a dorm bed, PKR 1,500–2,500 a day for food if you eat locally rather than at hotel restaurants, and a jeep day to somewhere like Hoper or Khunjerab shared between four or five people. It is one of the cheapest genuinely spectacular weeks available anywhere.',
      },
    ],
  },

  {
    slug: 'skardu-hostels-and-when-to-visit',
    title: 'Skardu hostels and when it is actually worth going',
    excerpt:
      'Skardu is a base camp, not a destination in itself. What beds cost, which months work, and how to plan around the flight that may not run.',
    category: 'northern-areas',
    publishedAt: '2026-06-11',
    glyph: 'ti-mountain',
    body: [
      {
        kind: 'p',
        text: 'Most people who stay in Skardu are on their way somewhere — Deosai, Shigar, Khaplu, or a trek that starts further out. The town is where you sleep, resupply and wait for weather, and choosing where to stay is mostly about the logistics of the next leg.',
      },
      { kind: 'h2', text: 'The season' },
      {
        kind: 'ul',
        items: [
          'May to September is the working window for most trips. Deosai is typically open from late June once the snow clears.',
          'April and October are quieter and colder, with real weather risk on the road and in the air.',
          'Winter is for people who specifically want winter. Much of the tourist infrastructure closes and road access is unreliable.',
        ],
      },
      { kind: 'h2', text: 'What accommodation costs' },
      {
        kind: 'p',
        text: 'Dorm beds and basic guesthouse rooms typically run PKR 1,500–3,000 a night in season, with prices in July and August noticeably firmer. Skardu has fewer true backpacker hostels than Hunza and more small guesthouses, so a dorm here is sometimes a shared room in a family-run place — which is often better, not worse.',
      },
      {
        kind: 'p',
        text: 'What you lose in that trade is the traveller-meeting function of a proper hostel common room. If your trip depends on finding three other people to share a Deosai jeep with, stay somewhere with a common area and ask on your first evening rather than your last.',
      },
      {
        kind: 'note',
        tone: 'watch',
        title: 'Plan for the flight not flying',
        text: 'The Islamabad–Skardu flight is weather dependent and cancels regularly. Build a spare day into each end of the trip, or be ready for a twenty-hour road journey at short notice. Everyone who travels here has this story.',
      },
      { kind: 'h2', text: 'Choosing where to stay' },
      {
        kind: 'ul',
        items: [
          'Near the bazaar for transport, supplies and an early start.',
          'Out towards Sadpara or the Indus for quiet and views, if you have transport arranged.',
          'Ask whether the hostel can arrange a jeep. In Skardu this is the difference between a plan and a morning wasted negotiating.',
        ],
      },
      { kind: 'h2', text: 'What a jeep day actually involves' },
      {
        kind: 'p',
        text: 'Deosai, Shigar and Khaplu are all day trips by jeep, and the vehicle is hired whole rather than by seat. Split between four or five people it is very reasonable; taken alone it is the most expensive thing you will do here.',
      },
      {
        kind: 'p',
        text: 'Agree three things before you leave: the total fare, whether it covers waiting time at the destination, and what time you are back. All three are normal to ask and awkward to raise afterwards.',
      },
      { kind: 'h2', text: 'Altitude, briefly' },
      {
        kind: 'p',
        text: 'Skardu sits above 2,200 metres and Deosai well over 4,000. Give yourself a day before anything strenuous, drink more water than feels necessary, and do not treat a headache on your first evening as nothing.',
      },
      {
        kind: 'p',
        text: 'The practical version: arrive, walk around the town, eat, sleep. Do Deosai on day two or three rather than the morning after you land, especially if you flew in and skipped the gradual climb the road would have given you.',
      },
    ],
  },

  {
    slug: 'naran-kaghan-budget-stays',
    title: 'Naran and Kaghan on a budget: where to sleep for under PKR 3,000',
    excerpt:
      'The valley is seasonal, crowded in July and empty by November. How to find a decent cheap bed, and the weekend to avoid entirely.',
    category: 'northern-areas',
    publishedAt: '2026-06-04',
    glyph: 'ti-campfire',
    body: [
      {
        kind: 'p',
        text: 'Naran is the most accessible of the northern valleys from Lahore and Islamabad, which is exactly why it is the hardest one to do cheaply in peak season. Prices here are not fixed; they move with the weekend.',
      },
      { kind: 'h2', text: 'The season, in one paragraph' },
      {
        kind: 'p',
        text: 'The road up from Balakot is generally open from May to October. Lake Saif-ul-Malook usually becomes reachable by jeep from late June. By November the top of the valley closes and Naran itself largely shuts down for winter.',
      },
      {
        kind: 'note',
        tone: 'watch',
        title: 'Avoid the long weekends',
        text: 'Eid holidays and August public holidays can triple room rates in Naran and fill everything on the main bazaar. If your dates are flexible by three days, moving them is worth more than any negotiating.',
      },
      { kind: 'h2', text: 'Where the cheap beds are' },
      {
        kind: 'ul',
        items: [
          'Off the main bazaar. One street back from the river frontage is consistently cheaper for the same room.',
          'Kaghan and Shogran rather than Naran itself — smaller, quieter and typically PKR 1,000–2,000 less per night.',
          'Balakot as a base, if you are willing to make the valley a day trip. Substantially cheaper and open year round.',
        ],
      },
      { kind: 'h2', text: 'What PKR 2,000–3,000 gets you' },
      {
        kind: 'p',
        text: 'In season: a basic double or a bed in a shared room, blankets, hot water at set hours, and rarely any heating. Off season the same money gets a considerably better room, because the alternative for the owner is an empty one.',
      },
      {
        kind: 'p',
        text: 'Rates in this valley are negotiable to a degree that surprises people used to city hotels, particularly after about six in the evening when a room that is still empty is going to stay empty. Arriving late is bad for choice and good for price.',
      },
      { kind: 'h2', text: 'Getting there' },
      {
        kind: 'p',
        text: 'From Islamabad it is roughly six to eight hours to Naran depending on traffic through Balakot and the state of the road above it. Buses and vans run from Rawalpindi to Balakot, and onward transport from there is frequent in season and sparse outside it.',
      },
      {
        kind: 'p',
        text: 'The stretch above Kaghan is slow by design — narrow, unsealed in places, and shared with jeeps coming the other way. Plan to arrive in daylight. The valley is not a place to be finding a room at nine at night.',
      },
      { kind: 'h2', text: 'Practicalities' },
      {
        kind: 'ul',
        items: [
          'Carry cash. Card acceptance is thin and mobile signal is inconsistent above Kaghan.',
          'Agree the jeep fare to Saif-ul-Malook before you get in, and agree whether it includes waiting time.',
          'Nights are cold even in July. A fleece is not optional at this altitude, whatever the afternoon feels like.',
          'Check the forecast for rain rather than temperature. The road above Kaghan is the part that suffers, and it is the part you have to come back down.',
        ],
      },
    ],
  },

  {
    slug: 'murree-and-galiyat-weekend-hostels',
    title: 'Murree and the Galiyat: weekend hostels that are not a tourist trap',
    excerpt:
      'Two hours from Islamabad and priced like it. Where to stay in Nathia Gali and Ayubia instead, and what a fair weekend rate looks like.',
    category: 'northern-areas',
    publishedAt: '2026-05-26',
    glyph: 'ti-trees',
    body: [
      {
        kind: 'p',
        text: 'Murree is the closest hill station to Islamabad and has priced itself accordingly. It is still worth a weekend — but if you are going for the forest rather than the mall road, the Galiyat a little further on are better in almost every way that matters.',
      },
      { kind: 'h2', text: 'Murree, realistically' },
      {
        kind: 'p',
        text: 'Rooms on or near Mall Road run high on weekends and drop sharply midweek. The same room can be PKR 6,000 on a Saturday and PKR 2,500 on a Tuesday. If you can travel midweek, do; the town is also considerably more pleasant when it is not full.',
      },
      { kind: 'h2', text: 'Nathia Gali and Ayubia' },
      {
        kind: 'p',
        text: 'Thirty to fifty minutes further along the Galiyat road, cooler, greener and quieter. Guesthouses and small hostels here are typically PKR 2,500–5,000 for a double in season, and the walking is the reason to come — the Pipeline Track between Nathia Gali and Dunga Gali is one of the easiest good walks in the country.',
      },
      {
        kind: 'p',
        text: 'Nathia Gali is the one to pick if you want somewhere to eat and other people around in the evening. Ayubia and the smaller Galis are quieter still, which is either the point or a problem depending on who you are travelling with.',
      },
      {
        kind: 'table',
        head: ['Where', 'Weekend double', 'Why go'],
        rows: [
          ['Murree (Mall Road)', 'PKR 4,500 – 8,000', 'Convenience, food, and the shortest drive'],
          ['Murree (midweek)', 'PKR 2,000 – 3,500', 'The same town at half price and a third of the crowd'],
          ['Nathia Gali', 'PKR 2,500 – 5,000', 'Forest walks, cooler air, somewhere to eat'],
          ['Ayubia / smaller Galis', 'PKR 2,000 – 4,000', 'Quiet, and the Pipeline Track on your doorstep'],
        ],
      },
      {
        kind: 'note',
        tone: 'tip',
        title: 'Book the room, not the town',
        text: 'Photographs of Galiyat guesthouses are taken in June. Ask for a photograph of the actual room taken this month, and ask directly whether it has heating — nights are cold here well into May.',
      },
      { kind: 'h2', text: 'Winter' },
      {
        kind: 'p',
        text: 'Murree and the Galiyat get snow, which is precisely why half of Punjab drives up in late December. Expect the road to be slow, expect chains or a 4x4 to matter on the higher stretches, and expect prices to behave like a peak season, because it is one.',
      },
      {
        kind: 'p',
        text: 'The serious version of that warning: in heavy snow the road up has been closed with vehicles on it. If the forecast is bad, the right decision is to not drive up that evening, however far in advance the room was booked.',
      },
      { kind: 'h2', text: 'Getting there without a car' },
      {
        kind: 'ul',
        items: [
          'Vans run regularly from Pir Wadhai in Rawalpindi to Murree, and onward to the Galiyat less frequently.',
          'The last onward van from Murree towards Nathia Gali leaves earlier than you expect. Ask the time on arrival, not at the end of the day.',
          'Ride-hailing works to Murree and becomes unreliable past it.',
        ],
      },
      {
        kind: 'quote',
        text: 'Murree is a town that happens to be in a forest. The Galiyat are a forest that happens to have rooms in it. Decide which trip you are taking before you book.',
      },
    ],
  },

  {
    slug: 'first-time-in-a-dorm-hostel-etiquette',
    title: 'Your first time in a dorm: hostel etiquette that actually matters',
    excerpt:
      'Eight unwritten rules of shared rooms, and the two or three that decide whether the people around you are glad you are there.',
    category: 'backpacking',
    publishedAt: '2026-05-14',
    glyph: 'ti-bed',
    body: [
      {
        kind: 'p',
        text: 'A dorm works on a handful of conventions that nobody writes down and everybody notices. None of them are complicated. Most first-time travellers break two or three of them in the first night purely by not knowing.',
      },
      { kind: 'h2', text: 'The ones that matter most' },
      {
        kind: 'ol',
        items: [
          'Pack your bag the night before an early start. Rummaging through a rucksack at 5am is the single most resented thing in dorm life, and a headtorch does not make it quieter.',
          'The main light stays off after people are asleep. Use your phone, use a torch, use the corridor.',
          'Plastic bags are loud. Whatever is in yours, deal with it outside the room.',
          'Your bed is your space; the floor between beds is not. Keep the bag under or on the bed, not across the walkway.',
        ],
      },
      { kind: 'h2', text: 'The rest' },
      {
        kind: 'ul',
        items: [
          'Shower quickly when there is a queue, and take your things with you rather than leaving them in there.',
          'Phone calls happen in the common room. All of them, including the short one.',
          'Do not sit on someone else’s bed. It reads very differently across cultures and the safe assumption is no.',
          'If you are travelling with a friend, remember the other four people did not join your conversation.',
        ],
      },
      {
        kind: 'quote',
        text: 'Every rule of dorm etiquette is the same rule: five other people are trying to sleep, and you are not the only one who had a long day.',
      },
      { kind: 'h2', text: 'What to expect from the room itself' },
      {
        kind: 'p',
        text: 'A bed, a locker or under-bed space, bedding, and a shared bathroom. In Pakistan you will often get a blanket rather than a duvet, and a towel is usually not provided. Lockers are common but padlocks frequently are not — bring your own.',
      },
      {
        kind: 'p',
        text: 'Sockets are the other thing worth checking on arrival. A six-bed room with two working sockets is normal, and the person who brought an extension lead becomes briefly the most popular traveller in the building.',
      },
      {
        kind: 'note',
        tone: 'tip',
        title: 'Ask for a bottom bunk when you book',
        text: 'It costs nothing to ask and is allocated first come. Bottom bunks are easier for everything, and dramatically easier if you are arriving late at night into a dark room.',
      },
      { kind: 'h2', text: 'Arriving late, leaving early' },
      {
        kind: 'p',
        text: 'These are the two moments when a considerate traveller is most easily mistaken for an inconsiderate one, and both are solved the same way: do your unpacking or packing outside the room. Lay out tomorrow’s clothes on the bed before lights out. Take the bag to the common room at dawn and sort it there.',
      },
      {
        kind: 'p',
        text: 'Tell the desk your departure time when you check in. If it is before dawn, ask then how you get out and whether anything is locked — not at 4am, when the answer involves waking somebody.',
      },
      { kind: 'h2', text: 'The part nobody mentions' },
      {
        kind: 'p',
        text: 'Dorms are sociable, and they are also somewhere people sleep. Both are true at once, and reading which one the room is doing right now is the whole skill. The common room is for talking; the room with six beds in it, after about eleven, is not.',
      },
      {
        kind: 'p',
        text: 'Get that right and the rest sorts itself out. Most of the people you meet travelling, you meet in a hostel common room in the first hour of the evening — and almost none of them because someone struck up a conversation in the dark.',
      },
    ],
  },

  {
    slug: 'hostel-packing-list-pakistan',
    title: 'The hostel packing list for Pakistan that nobody gives you',
    excerpt:
      'Not the obvious things. The padlock, the extension lead, the flip-flops and the six items that quietly decide how comfortable a term is.',
    category: 'backpacking',
    publishedAt: '2026-05-06',
    glyph: 'ti-backpack',
    body: [
      {
        kind: 'p',
        text: 'You will remember clothes and a charger. This is the list of things that are cheap, small, and make a disproportionate difference — split between a term in a student hostel and a fortnight of backpacking.',
      },
      { kind: 'h2', text: 'Bring these whatever you are doing' },
      {
        kind: 'ul',
        items: [
          'A padlock. Lockers are common; locks are not provided. A combination lock beats a key you can lose.',
          'An extension lead with several sockets. Most rooms have one usable socket and four people who need it.',
          'A power bank, sized for a full day. Load-shedding is shorter than it used to be and still real.',
          'Flip-flops for the shower. Non-negotiable in a shared bathroom.',
          'A microfibre towel. Dries in hours rather than days, which matters in a room with no outdoor line.',
          'Earplugs and an eye mask. The two cheapest things on this list and the two that most reliably save a night.',
        ],
      },
      {
        kind: 'p',
        text: 'If you buy nothing else from that list, buy the earplugs and the extension lead. Together they cost less than one night in a hostel and they fix the two problems you are guaranteed to have.',
      },
      { kind: 'h2', text: 'For a term in a student hostel' },
      {
        kind: 'ul',
        items: [
          'Your own bedsheet and pillowcase, even where bedding is provided.',
          'A small desk lamp — overhead lighting is rarely good enough to work under.',
          'A kettle, if the hostel allows one. Check first; some forbid them for load reasons.',
          'A folding drying rack, or expect to hang wet clothes off furniture for four months.',
          'A basic first-aid kit and whatever medicine you actually use. The nearest pharmacy is never open at 2am.',
        ],
      },
      {
        kind: 'p',
        text: 'Two more worth the space if you have it: a door wedge, which makes any room feel more like yours, and a small lockable box or soft case for documents, passport and whatever cash you are not carrying. Neither is about distrusting your roommates; both are about not having to think about it.',
      },
      { kind: 'h2', text: 'For backpacking, especially the north' },
      {
        kind: 'ul',
        items: [
          'Layers rather than one heavy coat. Valley nights are cold in every month of the year.',
          'A sleeping bag liner. Useful when blankets are provided but you would rather not think about them.',
          'Cash in small notes. ATMs are unreliable above Gilgit and useless above Hunza.',
          'A universal sink plug, which sounds absurd until the second time you need one.',
          'Offline maps downloaded before you leave signal, which happens sooner than you expect.',
        ],
      },
      {
        kind: 'p',
        text: 'Add sun protection, and take it more seriously than the temperature suggests. At altitude the air is cold and the sun is fierce at the same time, which is how people come back from a cool day in Deosai badly burnt.',
      },
      { kind: 'h2', text: 'What to leave at home' },
      {
        kind: 'ul',
        items: [
          'A hairdryer. It will not survive the voltage, the load or the queue for the socket.',
          'More than two pairs of shoes. You will wear one pair and carry the others across the country.',
          'A full-size shampoo bottle. It is heavy, it leaks, and every bazaar sells the small ones.',
          'Anything you would be genuinely upset to lose, unless it fits in the document case.',
        ],
      },
      {
        kind: 'note',
        tone: 'tip',
        title: 'Leave room for what you buy there',
        text: 'Blankets, shawls and dried apricots take more space than anyone plans for. Arrive with the bag eighty percent full.',
      },
    ],
  },

  {
    slug: 'girls-hostel-safety-checklist',
    title: 'A safety checklist for girls’ hostels — what to ask before you pay',
    excerpt:
      'Fourteen questions that separate a hostel that takes security seriously from one that has a gate and a promise.',
    category: 'renting-smart',
    publishedAt: '2026-04-23',
    glyph: 'ti-shield-check',
    body: [
      {
        kind: 'p',
        text: 'Every hostel will tell you it is secure. The question is what that means in practice, and it is answerable in a single visit if you know what to ask. Take this list with you, and ask the questions in front of whoever is showing you the room.',
      },
      { kind: 'h2', text: 'At the gate' },
      {
        kind: 'ul',
        items: [
          'Is the gate staffed at night, or locked and unattended? Both can be fine; not knowing which is not.',
          'Who is on the desk overnight, and is that person a woman?',
          'How are visitors recorded, and where do they wait — a reception area, or inside the building?',
          'Are male staff, including maintenance and delivery, permitted upstairs? Under what notice?',
        ],
      },
      { kind: 'h2', text: 'In the building' },
      {
        kind: 'ul',
        items: [
          'Does the room door lock from the inside, and does your key work only on your own room?',
          'Are the corridors and stairwell lit through the night?',
          'Where are the cameras, and just as importantly, where are they not?',
          'Is there a fire exit that is actually usable, or a locked one with a stack of furniture in front of it?',
        ],
      },
      {
        kind: 'p',
        text: 'Ask the camera question plainly, because the wrong answer matters as much as the right one. Cameras belong at the entrance, in corridors and over common areas. A camera pointed anywhere near a bedroom door, a bathroom or a stairwell landing used for changing is a reason to leave, not a reassurance.',
      },
      {
        kind: 'note',
        tone: 'watch',
        title: 'Check the curfew both ways',
        text: 'Ask what happens if you arrive after it. A hostel where late arrival means a locked gate and no answer is a safety problem, not a discipline policy — particularly if you have evening classes or travel home at weekends.',
      },
      { kind: 'h2', text: 'The route to the door' },
      {
        kind: 'p',
        text: 'Security does not start at the gate; it starts at the point where you get out of a rickshaw. Walk the last two hundred metres yourself, after dark if you can, and look at three things: whether the street is lit, whether it is overlooked by occupied buildings, and whether a driver can actually reach the gate or drops you at the end of a lane.',
      },
      {
        kind: 'p',
        text: 'Ask how other residents get back in the evening, and what they do when they are later than planned. The answer is usually specific and practical, and it tells you how the place really operates rather than what its rules say.',
      },
      { kind: 'h2', text: 'The answers that tell you most' },
      {
        kind: 'ol',
        items: [
          'Who do residents call at 2am, and does that person live on site?',
          'How were the last two complaints handled? A hostel that cannot name one has either never had one or does not record them.',
          'Can you speak to a current resident alone, without a manager present? A confident hostel says yes immediately.',
          'Is there a written agreement covering notice, deposit and house rules — and can you take a copy away to read?',
        ],
      },
      {
        kind: 'quote',
        text: 'The most useful signal is not the answer. It is whether the person showing you round is comfortable being asked at all.',
      },
      {
        kind: 'p',
        text: [
          'Trust that reaction. A manager who is glad you asked is telling you how the place is run, and so is one who is not. When you are ready to shortlist, ',
          { to: '/search', text: 'filter listings to girls hostels' },
          ' and take this list to the three you like best.',
        ],
      },
      { kind: 'h2', text: 'After you move in' },
      {
        kind: 'ul',
        items: [
          'Save the warden’s number and one resident’s number in your phone on the first day, not the first time you need them.',
          'Tell someone at home which hostel you are in, on which floor, and how to reach the person in charge.',
          'Raise small problems early and in writing on WhatsApp. A record of a broken lock reported in September is what makes it fixed in October.',
        ],
      },
    ],
  },
];

/**
 * The archive, newest first, with the photographs woven in and reading time derived.
 *
 * Figures are merged before the count is taken, so a caption is counted as something the
 * reader reads — which it is — and the two can never drift apart.
 */
export const BLOG_POSTS: readonly BlogPost[] = POSTS.map((p) => {
  const body = withFigures(p.body, BLOG_FIGURES[p.slug]);
  return { ...p, body, readMinutes: readingMinutes(body) };
}).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

export function postBySlug(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}

/**
 * Up to three more worth reading — same category first, then whatever is newest.
 *
 * Never the post being read, and never padded with repeats: three good suggestions and two
 * blanks is better than five where two are the same article twice.
 */
export function relatedPosts(post: BlogPost, limit = 3): BlogPost[] {
  const others = BLOG_POSTS.filter((p) => p.slug !== post.slug);
  const sameCategory = others.filter((p) => p.category === post.category);
  const rest = others.filter((p) => p.category !== post.category);
  return [...sameCategory, ...rest].slice(0, limit);
}
