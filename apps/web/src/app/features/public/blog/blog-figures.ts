import { BlogBlock } from './blog-post.model';

/**
 * The photographs, and where each one sits.
 *
 * Kept beside the prose rather than inside it. An article body is written and edited as
 * sentences; a picture belongs to a section, not to a position in an array, and threading
 * a hundred image blocks through hand-written prose would make every future edit to that
 * prose a chance to strand one. `at` names the heading a figure opens, so the placement
 * survives the paragraphs around it moving.
 *
 * Every figure carries a caption. An uncaptioned photograph in a piece of practical writing
 * is decoration — the caption is where the picture earns the space it takes, by saying
 * something the prose has not already said.
 *
 * All photographs are from Pexels, used under the Pexels licence, which permits commercial
 * use without attribution. `public/blog/CREDITS.json` records which photograph each file came
 * from and what the photographer said it was, so both the licence and every location claim
 * are auditable from the repository.
 */
export interface BlogFigure {
  src: string;
  alt: string;
  caption?: string;
  /** The h2 this figure opens, or 'end' to close the article. */
  at: string;
}

export const BLOG_FIGURES: Record<string, BlogFigure[]> = {
  'what-a-hostel-agent-actually-costs-you': [
    {
      src: '/blog/what-a-hostel-agent-actually-costs-you/residential-blocks.webp',
      alt: 'Residential buildings seen from above in a Pakistani city',
      caption: 'Four or five buildings chosen by what is free that morning, rather than by what you asked for.',
      at: 'What the commission actually is',
    },
    {
      src: '/blog/what-a-hostel-agent-actually-costs-you/flyover-traffic.webp',
      alt: 'Cars and scooters crossing a flyover in heavy city traffic',
      caption: 'The hours between viewings are the real cost, and nobody puts them on the invoice.',
      at: 'When an agent is genuinely worth it',
    },
    {
      src: '/blog/what-a-hostel-agent-actually-costs-you/papers-with-client.webp',
      alt: 'An agent going through property papers with a client',
      caption: 'Worth it for a whole flat with an owner and a written agreement. Rarely worth it for one bed.',
      at: 'What you can do in an evening instead',
    },
    {
      src: '/blog/what-a-hostel-agent-actually-costs-you/signing.webp',
      alt: 'Hands signing a document across a meeting table',
      caption: 'Agree the fee in a message you can scroll back to — not at the end of the day, standing in a room you like.',
      at: 'If you do use an agent, do this',
    },
    {
      src: '/blog/what-a-hostel-agent-actually-costs-you/front-desk.webp',
      alt: 'Travellers checking in directly at a hostel front desk',
      caption: 'Three places you chose, seen in one morning, is a better search than five somebody else chose.',
      at: 'end',
    },
    {
      src: '/blog/what-a-hostel-agent-actually-costs-you/keys-and-papers.webp',
      alt: 'Keys and paperwork laid out on a desk',
      caption: 'The paperwork is the part worth slowing down for, whoever introduced you to the room.',
      at: 'end',
    },
    {
      src: '/blog/what-a-hostel-agent-actually-costs-you/agent-keyring.webp',
      alt: 'An agent holding a keyring and a clipboard',
      caption: 'A dealer is one option among several. The question is what he is being paid, and by whom.',
      at: 'end',
    },
  ],
  'what-a-hostel-room-actually-costs-in-pakistan': [
    {
      src: '/blog/what-a-hostel-room-actually-costs-in-pakistan/dorm-bunks.webp',
      alt: 'A hostel dorm room with metal bunk beds, each made up with white bedding',
      caption: 'A bed in a 6-seater is closer to half the price of a bed in a 4-seater, not two-thirds.',
      at: 'The five numbers that make up your monthly cost',
    },
    {
      src: '/blog/what-a-hostel-room-actually-costs-in-pakistan/room-door.webp',
      alt: 'A hostel room door fitted with an electronic lock',
      caption: 'Photograph the room on day one — walls, mattress, fittings, window catch. It settles every later argument.',
      at: 'The charges that appear later',
    },
    {
      src: '/blog/what-a-hostel-room-actually-costs-in-pakistan/modern-dorm.webp',
      alt: 'A resident checking a phone on the lower bunk of a dorm bed',
      caption: 'Ask which way the window faces, and which floor. Both cost you money you will not see on the poster.',
      at: 'What the deposit actually secures',
    },
    {
      src: '/blog/what-a-hostel-room-actually-costs-in-pakistan/packing-in-dorm.webp',
      alt: 'Two travellers by the window of a dorm room, one climbing to an upper bunk',
      caption: 'Pay monthly until you are sure the place suits you, then convert to quarterly for the discount.',
      at: 'Monthly, quarterly, or the whole year',
    },
    {
      src: '/blog/what-a-hostel-room-actually-costs-in-pakistan/lahore-plaza.webp',
      alt: 'A commercial plaza in Lahore photographed in late afternoon light',
      caption: 'Commercial Lahore. Most of the city’s student hostels sit a street or two behind frontages like this one.',
      at: 'How to compare two hostels honestly',
    },
    {
      src: '/blog/what-a-hostel-room-actually-costs-in-pakistan/karachi-rooftops.webp',
      alt: 'Rows of residential rooftops in Karachi with the city skyline behind them',
      caption: 'Write both options down as a twelve-month total. Deposits and admission fees only show up at that scale.',
      at: 'end',
    },
  ],
  'student-hostels-in-lahore-a-practical-guide': [
    {
      src: '/blog/student-hostels-in-lahore-a-practical-guide/railway-station.webp',
      alt: 'The clock towers of Lahore Railway Station against a clear sky',
      caption: 'Lahore Railway Station. Most students arriving for the autumn intake come through here.',
      at: 'Johar Town',
    },
    {
      src: '/blog/student-hostels-in-lahore-a-practical-guide/busy-street.webp',
      alt: 'A minaret rising above a busy street lined with scaffolding',
      caption: 'What you buy in the dense student belts is walkability. What you trade is quiet.',
      at: 'Gulberg',
    },
    {
      src: '/blog/student-hostels-in-lahore-a-practical-guide/delhi-gate.webp',
      alt: 'Delhi Gate in the walled city of Lahore',
      caption: 'The walled city. Rents here are the lowest in Lahore, and the stock varies more than anywhere else.',
      at: 'Iqbal Town and Samanabad',
    },
    {
      src: '/blog/student-hostels-in-lahore-a-practical-guide/arfa-tower-night.webp',
      alt: 'Arfa Software Technology Park in Lahore at night, with traffic trails below',
      caption: 'The commercial belt: central, well connected, and priced for it.',
      at: 'What each area actually costs',
    },
    {
      src: '/blog/student-hostels-in-lahore-a-practical-guide/badshahi.webp',
      alt: 'Badshahi Mosque in Lahore with birds crossing a clear blue sky',
      caption: 'Distance is not the number that matters. Make the trip once, at the hour you will actually make it.',
      at: 'The commute is the real price',
    },
    {
      src: '/blog/student-hostels-in-lahore-a-practical-guide/minar-e-pakistan.webp',
      alt: 'Minar-e-Pakistan seen across the green park that surrounds it',
      caption: 'Looking in the quieter part of summer buys a better choice and a better negotiating position at once.',
      at: 'When to look',
    },
    {
      src: '/blog/student-hostels-in-lahore-a-practical-guide/lahore-fort.webp',
      alt: 'The gardens and walls of Lahore Fort on a bright day',
      caption: 'Mid-semester is the other quiet window — a hostel with an empty bed in October would rather fill it now.',
      at: 'end',
    },
  ],
  'student-hostels-in-islamabad-sector-by-sector': [
    {
      src: '/blog/student-hostels-in-islamabad-sector-by-sector/islamabad-aerial.webp',
      alt: 'Islamabad from the air at dusk, its grid of roads running towards the hills',
      caption: 'The grid that makes Islamabad easy to navigate — and its sectors anything but interchangeable.',
      at: 'G-11 and G-10',
    },
    {
      src: '/blog/student-hostels-in-islamabad-sector-by-sector/expressway.webp',
      alt: 'The Islamabad Expressway from above, cutting through the city',
      caption: 'Some sectors sit on the right side of the city for both halves of the twin cities. That is their whole argument.',
      at: 'I-8, I-9 and I-10',
    },
    {
      src: '/blog/student-hostels-in-islamabad-sector-by-sector/sector-street.webp',
      alt: 'Blossom on a tree in a residential Islamabad sector',
      caption: 'Cheaper and further. Fine with your own transport, a poor idea on public transport in a wet January.',
      at: 'Bani Gala and the outskirts',
    },
    {
      src: '/blog/student-hostels-in-islamabad-sector-by-sector/road-to-tower.webp',
      alt: 'A tree-lined road leading towards a modern tower block',
      caption: 'Purpose-built student blocks tend to beat a converted house on the basics: bathrooms, desks, room sizes.',
      at: 'The sectors side by side',
    },
    {
      src: '/blog/student-hostels-in-islamabad-sector-by-sector/interchange.webp',
      alt: 'An interchange in Islamabad surrounded by green space, seen from the air',
      caption: 'Ask whether the hostel is registered. It is the one question here that can cost you your room.',
      at: 'Islamabad-specific things worth asking',
    },
    {
      src: '/blog/student-hostels-in-islamabad-sector-by-sector/faisal-mosque.webp',
      alt: 'Faisal Mosque in Islamabad under a bright, cloudy sky',
      caption: 'Almost everything in this city is twenty minutes from the G sectors. That is what the rent buys.',
      at: 'Winter is the season to plan for',
    },
    {
      src: '/blog/student-hostels-in-islamabad-sector-by-sector/hills-sunset.webp',
      alt: 'A dramatic sunset over the hills beyond Islamabad',
      caption: 'Most students look for a room in August. Ask the January questions anyway — heating, gas, hot water.',
      at: 'end',
    },
  ],
  'student-hostels-in-karachi-where-students-live': [
    {
      src: '/blog/student-hostels-in-karachi-where-students-live/empress-market.webp',
      alt: 'Empress Market in Karachi at sunrise, its colonial clock tower above the street',
      caption: 'Empress Market. Karachi’s student housing spreads north and east of here.',
      at: 'Gulshan-e-Iqbal',
    },
    {
      src: '/blog/student-hostels-in-karachi-where-students-live/street-traffic.webp',
      alt: 'High-rise apartment blocks above a busy street at sunset',
      caption: 'The student centre of gravity has enough supply that you can afford to be fussy. See four places before you choose.',
      at: 'Gulistan-e-Johar',
    },
    {
      src: '/blog/student-hostels-in-karachi-where-students-live/density-aerial.webp',
      alt: 'A dense Karachi neighbourhood from the air, built around a circular park',
      caption: 'Karachi’s density is the reason a cheap room in the wrong area is not a saving.',
      at: 'DHA and Clifton',
    },
    {
      src: '/blog/student-hostels-in-karachi-where-students-live/skyline.webp',
      alt: 'The Karachi skyline of high-rise towers under a clear sky',
      caption: 'The southern districts are quieter, dearer and short of shared rooms, because the stock was never built for it.',
      at: 'Commute as a cost, not a detail',
    },
    {
      src: '/blog/student-hostels-in-karachi-where-students-live/kmc-building.webp',
      alt: 'The KMC Building in Karachi at twilight',
      caption: 'The older northern neighbourhoods are cheaper and well connected that way, less so towards the industrial east.',
      at: 'Before you pay',
    },
    {
      src: '/blog/student-hostels-in-karachi-where-students-live/decorated-bus.webp',
      alt: 'A decorated Pakistani bus on a busy Karachi street',
      caption: 'Two rickshaw legs a day is most of the gap between a cheap bed far out and a dearer one close in.',
      at: 'end',
    },
    {
      src: '/blog/student-hostels-in-karachi-where-students-live/street-food.webp',
      alt: 'Two men at a street food stall in Karachi',
      caption: 'Visit in the evening as well as the day. Lighting and who is around are evening facts.',
      at: 'end',
    },
  ],
  'rawalpindi-or-islamabad-for-students': [
    {
      src: '/blog/rawalpindi-or-islamabad-for-students/highway-sunset.webp',
      alt: 'Sunset over a busy Rawalpindi highway',
      caption: 'Rawalpindi at sunset. The rent gap is real; what decides it is the commute.',
      at: 'The gap, in numbers',
    },
    {
      src: '/blog/rawalpindi-or-islamabad-for-students/decorated-truck.webp',
      alt: 'A decorated truck parked on a busy Rawalpindi street',
      caption: 'Most of the student supply on this side sits along the main corridor, which is what makes the trade viable.',
      at: 'When Rawalpindi wins',
    },
    {
      src: '/blog/rawalpindi-or-islamabad-for-students/food-stall.webp',
      alt: 'Vendors cooking at an outdoor food stall with customers waiting',
      caption: 'The saving is roughly a month of rent a year — not abstract when it is your own money.',
      at: 'When it quietly does not',
    },
    {
      src: '/blog/rawalpindi-or-islamabad-for-students/motorbike.webp',
      alt: 'A man riding a motorbike through a busy Pakistani street',
      caption: 'The bus is fast. The last two kilometres at either end are the part people underestimate.',
      at: 'The arithmetic, done once',
    },
    {
      src: '/blog/rawalpindi-or-islamabad-for-students/pindi-mosque.webp',
      alt: 'The dome and minarets of a mosque in Rawalpindi',
      caption: 'Evening labs and late societies are what turn a comfortable commute into a difficult one.',
      at: 'end',
    },
    {
      src: '/blog/rawalpindi-or-islamabad-for-students/street-festival.webp',
      alt: 'A decorated procession float on a narrow Rawalpindi street',
      caption: 'Travel the route once, on a weekday, at the hour your first class starts. One trip settles it.',
      at: 'end',
    },
  ],
  'hostels-near-punjab-university-lahore': [
    {
      src: '/blog/hostels-near-punjab-university-lahore/lecture-hall.webp',
      alt: 'Students seated through a university lecture, photographed in black and white',
      caption: 'Ask a senior in your own department where their classes actually are before you choose an area.',
      at: 'For New Campus (Quaid-e-Azam Campus)',
    },
    {
      src: '/blog/hostels-near-punjab-university-lahore/jamia-mosque.webp',
      alt: 'The Grand Jamia Mosque in Lahore under a clear sky',
      caption: 'The New Campus belt is among the better value in the city for the proximity it gives you.',
      at: 'What each side costs',
    },
    {
      src: '/blog/hostels-near-punjab-university-lahore/studying-outside.webp',
      alt: 'A student sitting cross-legged to write, books open beside him',
      caption: 'University hostels are far cheaper than anything private. Apply, keep applying, and rent monthly meanwhile.',
      at: 'University hostels first',
    },
    {
      src: '/blog/hostels-near-punjab-university-lahore/minarets-fog.webp',
      alt: 'Minarets and trees silhouetted in fog at sunset',
      caption: 'Old Campus sits in the old city, where photographs flatter the stock more than anywhere else.',
      at: 'Practical notes',
    },
    {
      src: '/blog/hostels-near-punjab-university-lahore/old-lahore.webp',
      alt: 'The tiled facade and arched entrance of an old building in Lahore',
      caption: 'Everything within walking distance, and some of the cheapest food in the city. View it in person.',
      at: 'end',
    },
    {
      src: '/blog/hostels-near-punjab-university-lahore/reception-map.webp',
      alt: 'Backpackers consulting a map at a hostel reception desk',
      caption: 'Canal Road traffic is predictable in the wrong way. Add fifteen minutes to any morning estimate.',
      at: 'end',
    },
  ],
  'hostels-near-nust-islamabad': [
    {
      src: '/blog/hostels-near-nust-islamabad/electronics-lab.webp',
      alt: 'Students working on electronics projects at a lab bench',
      caption: 'The advantage of H-13 is not only distance — everything around you is priced for students.',
      at: 'H-13, the default',
    },
    {
      src: '/blog/hostels-near-nust-islamabad/reception.webp',
      alt: 'Travellers checking in at a hostel reception area',
      caption: 'Ask residents what the internet is like at eleven at night, when a submission is due. Not the manager.',
      at: 'What to compare once you are in H-13',
    },
    {
      src: '/blog/hostels-near-nust-islamabad/faisal-aerial.webp',
      alt: 'Faisal Mosque silhouetted against a sunset sky, seen from above',
      caption: 'G-13 and G-14 are a short ride away and more residential, if you want distance between study and sleep.',
      at: 'On-campus first',
    },
    {
      src: '/blog/hostels-near-nust-islamabad/city-from-above.webp',
      alt: 'A city surrounded by green space seen from above under a clear sky',
      caption: 'Ten minutes from the main gate is not ten minutes from your department. Ask which gate, then measure.',
      at: 'end',
    },
    {
      src: '/blog/hostels-near-nust-islamabad/office-street.webp',
      alt: 'A tree-lined city street with modern office buildings on a sunny day',
      caption: 'A desk per person and a quiet common room are worth more here than in most cities.',
      at: 'end',
    },
    {
      src: '/blog/hostels-near-nust-islamabad/shared-room.webp',
      alt: 'Two residents talking on bunk beds in a shared room',
      caption: 'Take a room on terms you can leave. A campus allocation in the spring should be good news, not a forfeit.',
      at: 'end',
    },
  ],
  'hostels-near-umt-and-johar-town-lahore': [
    {
      src: '/blog/hostels-near-umt-and-johar-town-lahore/minar-vertical.webp',
      alt: 'Minar-e-Pakistan against a clear blue sky',
      caption: 'Forty options inside a twenty-minute walk, so the deciding factor stops being location.',
      at: 'What you should be paying',
    },
    {
      src: '/blog/hostels-near-umt-and-johar-town-lahore/construction.webp',
      alt: 'Traffic passing office buildings and construction on an urban street',
      caption: 'Anything well below the usual range is worth understanding rather than celebrating.',
      at: 'The questions that save money later',
    },
    {
      src: '/blog/hostels-near-umt-and-johar-town-lahore/night-market.webp',
      alt: 'A night market lit by streetlights, with vendor stalls along the road',
      caption: 'Ask to see the kitchen, not the dining room. It tells you how the place is actually run.',
      at: 'Getting to campus',
    },
    {
      src: '/blog/hostels-near-umt-and-johar-town-lahore/handcart.webp',
      alt: 'A vendor at a busy market stall',
      caption: 'Is electricity split per head or metered per room? Per head quietly subsidises whoever runs the AC longest.',
      at: 'end',
    },
    {
      src: '/blog/hostels-near-umt-and-johar-town-lahore/check-in.webp',
      alt: 'Two travellers checking in at a hostel reception desk',
      caption: 'Two minutes with a resident at the gate is the most reliable research available, and it is free.',
      at: 'end',
    },
    {
      src: '/blog/hostels-near-umt-and-johar-town-lahore/room-talk.webp',
      alt: 'Two residents talking in a room with bunk beds',
      caption: 'Change university, internship or plans entirely, and from here you probably need not change address.',
      at: 'end',
    },
  ],
  'backpacker-hostels-in-hunza-valley': [
    {
      src: '/blog/backpacker-hostels-in-hunza-valley/altit-fort.webp',
      alt: 'Snow peaks above the floor of the Hunza valley',
      caption: 'The Hunza valley floor, with the mountains standing over it.',
      at: 'When to go',
    },
    {
      src: '/blog/backpacker-hostels-in-hunza-valley/karimabad-night.webp',
      alt: 'A starry night over the lit houses of Karimabad',
      caption: 'Karimabad after dark. Most of the valley’s hostels are within a few minutes of this ridge.',
      at: 'What a dorm bed includes',
    },
    {
      src: '/blog/backpacker-hostels-in-hunza-valley/autumn-road.webp',
      alt: 'A road winding through autumn trees in Hunza, Gilgit-Baltistan',
      caption: 'Late September into early October: better light, emptier than August, and everything still open.',
      at: 'Getting there',
    },
    {
      src: '/blog/backpacker-hostels-in-hunza-valley/passu-autumn.webp',
      alt: 'The jagged peaks above Passu in autumn',
      caption: 'Passu in autumn, north up the valley.',
      at: 'What it costs for a week',
    },
    {
      src: '/blog/backpacker-hostels-in-hunza-valley/valley-aerial.webp',
      alt: 'Hunza Valley from the air in autumn, the river winding through it',
      caption: 'Three nights down in the main village to meet people, then two further up, is a week that works.',
      at: 'end',
    },
    {
      src: '/blog/backpacker-hostels-in-hunza-valley/karimabad-view.webp',
      alt: 'Hazy ridgelines receding into the distance above Karimabad',
      caption: 'A dorm bed here is a bed, blankets, hot water at some hours, and a kitchen. Rarely heating.',
      at: 'end',
    },
    {
      src: '/blog/backpacker-hostels-in-hunza-valley/town-in-mountains.webp',
      alt: 'A small settlement dwarfed by the mountains around it',
      caption: 'Carry more cash than you think you need. The machines are not reliable this far up.',
      at: 'end',
    },
  ],
  'skardu-hostels-and-when-to-visit': [
    {
      src: '/blog/skardu-hostels-and-when-to-visit/shangrila.webp',
      alt: 'Shangrila Resort beside its lake in Skardu, ringed by mountains',
      caption: 'Most people staying here are on their way somewhere. The town is where you sleep and wait for weather.',
      at: 'The season',
    },
    {
      src: '/blog/skardu-hostels-and-when-to-visit/shigar-lake.webp',
      alt: 'Steep mountainsides above the treeline near Shigar',
      caption: 'Fewer true backpacker hostels here than in the northern valleys, and more small family-run guesthouses — often better, not worse.',
      at: 'Choosing where to stay',
    },
    {
      src: '/blog/skardu-hostels-and-when-to-visit/cold-desert.webp',
      alt: 'The sand dunes of Skardu\'s cold desert with snowy peaks behind',
      caption: 'Skardu’s cold desert, with snow on the mountains behind it.',
      at: 'What a jeep day actually involves',
    },
    {
      src: '/blog/skardu-hostels-and-when-to-visit/autumn-lake.webp',
      alt: 'A Skardu lake in autumn, mountains and foliage reflected in still water',
      caption: 'May to September is the working window. The high plateau usually opens from late June, once the snow clears.',
      at: 'Altitude, briefly',
    },
    {
      src: '/blog/skardu-hostels-and-when-to-visit/peaks.webp',
      alt: 'Snow and cloud on the peaks above Skardu',
      caption: 'Give yourself a day before anything strenuous, and do not treat a first-evening headache as nothing.',
      at: 'end',
    },
    {
      src: '/blog/skardu-hostels-and-when-to-visit/lone-tree.webp',
      alt: 'A lone tree against the sky in Skardu Valley',
      caption: 'Ask whether the hostel can arrange a jeep. It is the difference between a plan and a wasted morning.',
      at: 'end',
    },
  ],
  'naran-kaghan-budget-stays': [
    {
      src: '/blog/naran-kaghan-budget-stays/boat-on-lake.webp',
      alt: 'A boat crossing a mountain lake',
      caption: 'Agree the jeep fare — and whether it covers waiting time — before you get in.',
      at: 'The season, in one paragraph',
    },
    {
      src: '/blog/naran-kaghan-budget-stays/saif-ul-malook.webp',
      alt: 'Lake Saif-ul-Malook below snow-capped mountains',
      caption: 'The road up is generally open May to October. By November the top of the valley closes for winter.',
      at: 'What PKR 2,000–3,000 gets you',
    },
    {
      src: '/blog/naran-kaghan-budget-stays/boats.webp',
      alt: 'Wooden boats moored on a mountain lake',
      caption: 'One street back from the river frontage is consistently cheaper for the same room.',
      at: 'Getting there',
    },
    {
      src: '/blog/naran-kaghan-budget-stays/mountain-reflection.webp',
      alt: 'Snowy mountains reflected in a still mountain lake',
      caption: 'Off season the same money gets a far better room — the alternative for the owner is an empty one.',
      at: 'Practicalities',
    },
    {
      src: '/blog/naran-kaghan-budget-stays/tent-by-river.webp',
      alt: 'A tent pitched beside a river running through the mountains',
      caption: 'Eid and August holidays can triple rates. Moving your dates by three days beats any negotiating.',
      at: 'end',
    },
    {
      src: '/blog/naran-kaghan-budget-stays/green-valley.webp',
      alt: 'A green mountainside above water under a blue sky',
      caption: 'Nights are cold even in July. A fleece is not optional at this altitude, whatever the afternoon feels like.',
      at: 'end',
    },
  ],
  'murree-and-galiyat-weekend-hostels': [
    {
      src: '/blog/murree-and-galiyat-weekend-hostels/pine-road.webp',
      alt: 'Tall pines against the sky in the Murree hills',
      caption: 'The same room can be three times the price on a Saturday as on a Tuesday.',
      at: 'Murree, realistically',
    },
    {
      src: '/blog/murree-and-galiyat-weekend-hostels/murree-aerial.webp',
      alt: 'Murree from above, its buildings set into green hillsides',
      caption: 'Murree is a town that happens to be in a forest. Thirty minutes further on, that reverses.',
      at: 'Winter',
    },
    {
      src: '/blog/murree-and-galiyat-weekend-hostels/chairlift.webp',
      alt: 'A chairlift crossing evergreen forest in Murree on a sunny day',
      caption: 'Murree. The walking is the reason to come this far up.',
      at: 'Getting there without a car',
    },
    {
      src: '/blog/murree-and-galiyat-weekend-hostels/pine-forest.webp',
      alt: 'Pine forest and mountains on a clear day',
      caption: 'Ask for a photograph of the actual room taken this month, and ask directly whether it has heating.',
      at: 'end',
    },
    {
      src: '/blog/murree-and-galiyat-weekend-hostels/snow-peaks.webp',
      alt: 'Snow-capped mountains above the treeline near Murree',
      caption: 'Snow is exactly why half the province drives up in late December. Expect peak-season prices and a slow road.',
      at: 'end',
    },
    {
      src: '/blog/murree-and-galiyat-weekend-hostels/forest-curve.webp',
      alt: 'A curved road cutting through dense pine forest',
      caption: 'The last onward van leaves earlier than you expect. Ask the time on arrival, not at the end of the day.',
      at: 'end',
    },
  ],
  'first-time-in-a-dorm-hostel-etiquette': [
    {
      src: '/blog/first-time-in-a-dorm-hostel-etiquette/dorm-talking.webp',
      alt: 'Two residents talking in a dorm room with bunk beds',
      caption: 'Every rule here is the same rule: other people are trying to sleep, and you are not the only one who had a long day.',
      at: 'The ones that matter most',
    },
    {
      src: '/blog/first-time-in-a-dorm-hostel-etiquette/travellers-bunks.webp',
      alt: 'Two travellers sitting on bunk beds beside their backpacks',
      caption: 'Pack your bag the night before an early start. Rummaging at 5am is the single most resented thing in dorm life.',
      at: 'What to expect from the room itself',
    },
    {
      src: '/blog/first-time-in-a-dorm-hostel-etiquette/shared-downtime.webp',
      alt: 'Friends spending time together in a shared dorm room',
      caption: 'The common room is for talking. The room with six beds in it, after about eleven, is not.',
      at: 'Arriving late, leaving early',
    },
    {
      src: '/blog/first-time-in-a-dorm-hostel-etiquette/arriving.webp',
      alt: 'Two people with backpacks walking into a bright dormitory',
      caption: 'Ask for a bottom bunk when you book. It costs nothing and is allocated first come.',
      at: 'The part nobody mentions',
    },
    {
      src: '/blog/first-time-in-a-dorm-hostel-etiquette/bunk-seated.webp',
      alt: 'Two residents seated on bunk beds in a plain room',
      caption: 'A bed, a locker, bedding and a shared bathroom. Padlocks are usually not provided — bring one.',
      at: 'end',
    },
    {
      src: '/blog/first-time-in-a-dorm-hostel-etiquette/dorm-conversation.webp',
      alt: 'Travellers in conversation in a hostel dormitory',
      caption: 'Most people you meet travelling, you meet in the first hour of the evening. Almost none of them in the dark.',
      at: 'end',
    },
  ],
  'hostel-packing-list-pakistan': [
    {
      src: '/blog/hostel-packing-list-pakistan/packing-gear.webp',
      alt: 'A traveller packing gear into a bag indoors',
      caption: 'Not the obvious things. The small ones that decide how comfortable a term is.',
      at: 'Bring these whatever you are doing',
    },
    {
      src: '/blog/hostel-packing-list-pakistan/luggage-flatlay.webp',
      alt: 'Luggage and backpacks arranged on a wooden floor, seen from above',
      caption: 'If you buy nothing else: earplugs and an extension lead. Together they fix the two problems you are guaranteed.',
      at: 'For a term in a student hostel',
    },
    {
      src: '/blog/hostel-packing-list-pakistan/packs-ready.webp',
      alt: 'Backpacks and luggage packed and ready to leave',
      caption: 'A padlock, a power bank, flip-flops and a microfibre towel travel with you whatever the trip.',
      at: 'For backpacking, especially the north',
    },
    {
      src: '/blog/hostel-packing-list-pakistan/kit-laid-out.webp',
      alt: 'Camera, tripod and other kit laid out beside a backpack',
      caption: 'For a term: your own bedsheet, a desk lamp, a drying rack, and whatever medicine you actually use.',
      at: 'What to leave at home',
    },
    {
      src: '/blog/hostel-packing-list-pakistan/packs-on-peak.webp',
      alt: 'Two backpacks resting on a rocky peak under a clear sky',
      caption: 'Layers rather than one heavy coat. Valley nights are cold in every month of the year.',
      at: 'end',
    },
    {
      src: '/blog/hostel-packing-list-pakistan/winter-layers.webp',
      alt: 'A traveller in winter layers looking out over a snowy mountain landscape',
      caption: 'At altitude the air is cold and the sun is fierce at once, which is how people come back badly burnt.',
      at: 'end',
    },
    {
      src: '/blog/hostel-packing-list-pakistan/preparing.webp',
      alt: 'A traveller preparing backpacks before setting off',
      caption: 'Arrive with the bag eighty percent full. Blankets and shawls take more room than anyone plans for.',
      at: 'end',
    },
  ],
  'girls-hostel-safety-checklist': [
    {
      src: '/blog/girls-hostel-safety-checklist/entering-room.webp',
      alt: 'Two residents with backpacks entering a dorm room',
      caption: 'Every hostel will tell you it is secure. The question is what that means in practice.',
      at: 'At the gate',
    },
    {
      src: '/blog/girls-hostel-safety-checklist/reception-desk.webp',
      alt: 'A traveller being greeted at a hostel reception desk',
      caption: 'Who is on the desk at night, and whether that person is a woman, is a fair question to ask on the tour.',
      at: 'The route to the door',
    },
    {
      src: '/blog/girls-hostel-safety-checklist/night-branches.webp',
      alt: 'The moon seen through bare autumn branches at night',
      caption: 'Ask what happens if you arrive after the curfew. A locked gate and no answer is a safety problem, not a policy.',
      at: 'The answers that tell you most',
    },
    {
      src: '/blog/girls-hostel-safety-checklist/bunk-conversation.webp',
      alt: 'Two residents talking on bunk beds in a shared room',
      caption: 'Ask to speak to a current resident alone. A confident hostel says yes immediately.',
      at: 'After you move in',
    },
    {
      src: '/blog/girls-hostel-safety-checklist/back-alley.webp',
      alt: 'A narrow, empty urban alley with derelict walls',
      caption: 'Walk the last two hundred metres yourself, after dark if you can.',
      at: 'end',
    },
    {
      src: '/blog/girls-hostel-safety-checklist/doorway-light.webp',
      alt: 'An old wooden door beside a street light in a quiet alleyway',
      caption: 'Is the street lit, is it overlooked, and can a driver actually reach the gate?',
      at: 'end',
    },
  ],
};

/** Blocks that put words between two pictures. A heading is not one of them. */
function reads(block: BlogBlock | undefined): boolean {
  return (
    block !== undefined &&
    (block.kind === 'p' ||
      block.kind === 'ul' ||
      block.kind === 'ol' ||
      block.kind === 'quote' ||
      block.kind === 'note' ||
      block.kind === 'table')
  );
}

/**
 * Weave the figures into a body.
 *
 * A figure whose `at` names no heading in the post would vanish silently, so it lands at the
 * end instead — visible, and therefore fixable.
 */
export function withFigures(body: BlogBlock[], figures: BlogFigure[] = []): BlogBlock[] {
  const toBlock = (f: BlogFigure): BlogBlock =>
    f.caption
      ? { kind: 'figure', src: f.src, alt: f.alt, caption: f.caption }
      : { kind: 'figure', src: f.src, alt: f.alt };

  const headings = new Set(body.flatMap((b) => (b.kind === 'h2' ? [b.text] : [])));
  const byHeading = new Map<string, BlogFigure[]>();
  const trailing: BlogFigure[] = [];
  for (const f of figures) {
    if (f.at !== 'end' && headings.has(f.at)) {
      byHeading.set(f.at, [...(byHeading.get(f.at) ?? []), f]);
    } else {
      trailing.push(f);
    }
  }

  const out: BlogBlock[] = [];
  for (const block of body) {
    if (block.kind === 'h2') for (const f of byHeading.get(block.text) ?? []) out.push(toBlock(f));
    out.push(block);
  }
  // Before the final block rather than after it, so an article always ends on words — and
  // stepped back until there is something to *read* on both sides, not merely something that
  // is not a figure. The first version only checked that the neighbour was not a figure,
  // which a bare heading satisfies, so two full-width photographs ended up separated by one
  // line of h2 and read as a gallery dropped into the middle of an essay.
  for (const f of trailing) {
    let i = Math.max(0, out.length - 1);
    while (i > 0 && !(reads(out[i - 1]) && reads(out[i]))) i--;
    out.splice(i, 0, toBlock(f));
  }
  return out;
}

/**
 * The photograph a card leads with.
 *
 * The post's own first figure rather than a sixteenth set of assets nobody has checked. That
 * one is already recorded in CREDITS.json, its alt text has already been through the
 * place-claim guard, and it is the picture the article itself opens on — so a card and the
 * piece it links to agree about what the piece looks like.
 */
export function heroFor(slug: string): BlogFigure | null {
  return BLOG_FIGURES[slug]?.[0] ?? null;
}

/**
 * The 480/800/1200 renditions the image pipeline wrote beside every photograph.
 *
 * Worth the two extra attributes: a grid card is about 380px wide and there are sixteen of
 * them on the index, so serving each the 1200px original is something like two megabytes of
 * pictures nobody ever sees at that size — on a page whose whole argument for generated
 * covers was that it had to load fast on mobile data.
 */
export function heroSrcset(src: string): string {
  const base = src.replace(/\.webp$/, '');
  return `${base}-480w.webp 480w, ${base}-800w.webp 800w, ${src} 1200w`;
}
