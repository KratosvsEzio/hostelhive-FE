import { Bounds, framesPlace } from './search-framing';

interface Point {
  lat: number;
  lng: number;
}

const LAHORE: Point = { lat: 31.5204, lng: 74.3587 };
const UET_LAHORE: Point = { lat: 31.5786, lng: 74.3566 };

const CITY_ZOOM = 11;
const CAMPUS_ZOOM = 13;

const FAR: Bounds = { north: 20, east: 100, south: 10, west: 90 };
const FRAMING: Bounds = { north: 31.75, east: 74.7, south: 31.3, west: 74 };
const EDGE: Bounds = { north: 31.8, east: 74.4, south: 31.2, west: 73.6 };
const WIDE: Bounds = { north: 37.1, east: 77.8, south: 23.6, west: 60.9 };
const PANNED_EAST: Bounds = { north: 32, east: 97.5, south: 31, west: 96.5 };

const viewAround = (mid: Point, width: number, height: number): Bounds => ({
  north: mid.lat + height / 2,
  south: mid.lat - height / 2,
  east: mid.lng + width / 2,
  west: mid.lng - width / 2,
});

// A 0.2° square wholly to one side of the place, so only the view's centre can keep it framed.
const viewEastOf = (place: Point, degrees: number): Bounds =>
  viewAround({ lat: place.lat, lng: place.lng + degrees }, 0.2, 0.2);

const viewNorthOf = (place: Point, degrees: number): Bounds =>
  viewAround({ lat: place.lat + degrees, lng: place.lng }, 0.2, 0.2);

describe('framesPlace', () => {
  describe('when the view cannot be judged', () => {
    it('counts a view with no settled bounds as framing the place', () => {
      expect(framesPlace(null, LAHORE, CITY_ZOOM)).toBe(true);
    });

    it('counts a place with no known centre as framed', () => {
      expect(framesPlace(FRAMING, null, CITY_ZOOM)).toBe(true);
    });
  });

  describe('when the place has no zoom', () => {
    it('keeps a place that is on screen', () => {
      expect(framesPlace(FRAMING, LAHORE, null)).toBe(true);
    });

    it('drops a place that is off screen', () => {
      expect(framesPlace(PANNED_EAST, LAHORE, null)).toBe(false);
    });

    it('applies no width cap to a view that still holds the place', () => {
      expect(framesPlace(WIDE, LAHORE, null)).toBe(true);
    });
  });

  describe('for a city', () => {
    it('keeps a view around the place', () => {
      expect(framesPlace(FRAMING, LAHORE, CITY_ZOOM)).toBe(true);
    });

    it('keeps a place near the edge of a view whose centre is out of reach', () => {
      expect(framesPlace(EDGE, LAHORE, CITY_ZOOM)).toBe(true);
    });

    it('drops the place when the view is panned out to longitude 97', () => {
      expect(framesPlace(PANNED_EAST, LAHORE, CITY_ZOOM)).toBe(false);
    });

    it('drops the place when the view is somewhere far away', () => {
      expect(framesPlace(FAR, LAHORE, CITY_ZOOM)).toBe(false);
    });

    it('drops the place from a region view even though it is inside it', () => {
      expect(framesPlace(WIDE, LAHORE, CITY_ZOOM)).toBe(false);
    });

    it('keeps the opening view of a 3844 px pane', () => {
      // 2.64° wide: 2.985° under the cap.
      expect(framesPlace(viewAround(LAHORE, 2.64, 0.632), LAHORE, CITY_ZOOM)).toBe(true);
    });
  });

  describe('the width cap', () => {
    it('keeps a view centred on the place just under it', () => {
      // 5.6° wide, 0.025° under the 5.625° cap.
      expect(framesPlace(viewAround(LAHORE, 5.6, 0.4), LAHORE, CITY_ZOOM)).toBe(true);
    });

    it('drops a view centred on the place just over it', () => {
      // 5.7° wide, 0.075° over the 5.625° cap.
      expect(framesPlace(viewAround(LAHORE, 5.7, 0.4), LAHORE, CITY_ZOOM)).toBe(false);
    });

    it('does not count the height of the view', () => {
      expect(framesPlace(viewAround(LAHORE, 1, 40), LAHORE, CITY_ZOOM)).toBe(true);
    });
  });

  describe('how far the centre of the view may sit from the place', () => {
    it('keeps a view centred just within reach to the east', () => {
      // 0.3498° east, 0.0018° inside the 0.3516° reach.
      expect(framesPlace(viewEastOf(LAHORE, 0.3498), LAHORE, CITY_ZOOM)).toBe(true);
    });

    it('drops a view centred just out of reach to the east', () => {
      // 0.3533° east, 0.0017° past the 0.3516° reach.
      expect(framesPlace(viewEastOf(LAHORE, 0.3533), LAHORE, CITY_ZOOM)).toBe(false);
    });

    it('keeps a view centred just within reach to the north', () => {
      // 0.2982° north, 0.0015° inside the 0.2997° reach, shorter than the 0.3516° east reach.
      expect(framesPlace(viewNorthOf(LAHORE, 0.2982), LAHORE, CITY_ZOOM)).toBe(true);
    });

    it('drops a view centred out of reach to the north that equal degrees would keep', () => {
      // 0.33° north is past the 0.2997° reach, but inside the 0.3516° that equal degrees allow.
      expect(framesPlace(viewNorthOf(LAHORE, 0.33), LAHORE, CITY_ZOOM)).toBe(false);
    });
  });

  describe('a view a world away', () => {
    it('keeps a view one world to the east that frames the place', () => {
      const shifted: Bounds = { north: 31.75, east: 434.7, south: 31.3, west: 434 };
      expect(framesPlace(shifted, LAHORE, CITY_ZOOM)).toBe(true);
    });

    it('keeps a view one world to the west that frames the place', () => {
      const shifted: Bounds = { north: 31.75, east: -285.3, south: 31.3, west: -286 };
      expect(framesPlace(shifted, LAHORE, CITY_ZOOM)).toBe(true);
    });
  });

  describe('for a campus', () => {
    it('keeps a whole-city view, which is narrower than its cap', () => {
      // 0.7° wide, 0.706° under the 1.406° cap.
      expect(framesPlace(FRAMING, UET_LAHORE, CAMPUS_ZOOM)).toBe(true);
    });

    it('drops a small view centred a neighbourhood away', () => {
      // Centre 0.105° (~10 km) east, 0.0171° past the 0.0879° reach, with the campus off screen.
      const view = viewAround({ lat: UET_LAHORE.lat, lng: UET_LAHORE.lng + 0.105 }, 0.06, 0.06);
      expect(framesPlace(view, UET_LAHORE, CAMPUS_ZOOM)).toBe(false);
    });
  });
});
