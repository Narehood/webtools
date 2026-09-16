export type ConvertKind =
  | "length"
  | "area"
  | "volume"
  | "mass"
  | "temperature"
  | "speed"
  | "time"
  | "data"
  | "energy"
  | "pressure"
  | "angle";

export type ConvertUnit = {
  id: string;
  name: string;
  toBase: (value: number) => number;
  fromBase: (value: number) => number;
};

export type ConvertGroup = {
  id: ConvertKind;
  label: string;
  note?: string;
  units: ConvertUnit[];
};

function linear(factor: number): Pick<ConvertUnit, "toBase" | "fromBase"> {
  return {
    toBase: (value) => value * factor,
    fromBase: (value) => value / factor,
  };
}

function unit(id: string, name: string, factor: number): ConvertUnit {
  return { id, name, ...linear(factor) };
}

export const convertGroups: ConvertGroup[] = [
  {
    id: "length",
    label: "Length",
    units: [
      unit("m", "Meter (m)", 1),
      unit("km", "Kilometer (km)", 1_000),
      unit("cm", "Centimeter (cm)", 0.01),
      unit("mm", "Millimeter (mm)", 0.001),
      unit("um", "Micrometer (µm)", 1e-6),
      unit("nm", "Nanometer (nm)", 1e-9),
      unit("in", "Inch (in)", 0.0254),
      unit("ft", "Foot (ft)", 0.3048),
      unit("yd", "Yard (yd)", 0.9144),
      unit("mi", "Mile (mi)", 1609.344),
      unit("nmi", "Nautical mile (nmi)", 1852),
    ],
  },
  {
    id: "area",
    label: "Area",
    units: [
      unit("m2", "Square meter (m²)", 1),
      unit("km2", "Square kilometer (km²)", 1_000_000),
      unit("cm2", "Square centimeter (cm²)", 0.0001),
      unit("mm2", "Square millimeter (mm²)", 1e-6),
      unit("ha", "Hectare (ha)", 10_000),
      unit("acre", "Acre", 4046.8564224),
      unit("ft2", "Square foot (ft²)", 0.09290304),
      unit("in2", "Square inch (in²)", 0.00064516),
      unit("yd2", "Square yard (yd²)", 0.83612736),
      unit("mi2", "Square mile (mi²)", 2_589_988.110336),
    ],
  },
  {
    id: "volume",
    label: "Volume",
    units: [
      unit("l", "Liter (L)", 1),
      unit("ml", "Milliliter (mL)", 0.001),
      unit("m3", "Cubic meter (m³)", 1_000),
      unit("cm3", "Cubic centimeter (cm³)", 0.001),
      unit("gal-us", "US gallon (gal)", 3.785411784),
      unit("gal-uk", "Imperial gallon (gal)", 4.54609),
      unit("qt-us", "US quart (qt)", 0.946352946),
      unit("pt-us", "US pint (pt)", 0.473176473),
      unit("cup-us", "US cup", 0.2365882365),
      unit("floz-us", "US fluid ounce (fl oz)", 0.0295735295625),
      unit("tbsp", "Tablespoon (tbsp)", 0.01478676478125),
      unit("tsp", "Teaspoon (tsp)", 0.00492892159375),
    ],
  },
  {
    id: "mass",
    label: "Mass",
    units: [
      unit("kg", "Kilogram (kg)", 1),
      unit("g", "Gram (g)", 0.001),
      unit("mg", "Milligram (mg)", 1e-6),
      unit("ug", "Microgram (µg)", 1e-9),
      unit("t", "Metric ton (t)", 1_000),
      unit("lb", "Pound (lb)", 0.45359237),
      unit("oz", "Ounce (oz)", 0.028349523125),
      unit("st", "Stone (st)", 6.35029318),
      unit("ton-us", "US ton (short)", 907.18474),
      unit("ton-uk", "UK ton (long)", 1016.0469088),
    ],
  },
  {
    id: "temperature",
    label: "Temperature",
    units: [
      {
        id: "c",
        name: "Celsius (°C)",
        toBase: (value) => value + 273.15,
        fromBase: (value) => value - 273.15,
      },
      {
        id: "f",
        name: "Fahrenheit (°F)",
        toBase: (value) => (value + 459.67) * (5 / 9),
        fromBase: (value) => value * (9 / 5) - 459.67,
      },
      {
        id: "k",
        name: "Kelvin (K)",
        toBase: (value) => value,
        fromBase: (value) => value,
      },
      {
        id: "r",
        name: "Rankine (°R)",
        toBase: (value) => value * (5 / 9),
        fromBase: (value) => value * (9 / 5),
      },
    ],
  },
  {
    id: "speed",
    label: "Speed",
    units: [
      unit("mps", "Meters per second (m/s)", 1),
      unit("kph", "Kilometers per hour (km/h)", 1 / 3.6),
      unit("mph", "Miles per hour (mph)", 0.44704),
      unit("knot", "Knot (kn)", 0.514444444),
      unit("fps", "Feet per second (ft/s)", 0.3048),
    ],
  },
  {
    id: "time",
    label: "Time",
    units: [
      unit("ns", "Nanosecond (ns)", 1e-9),
      unit("us", "Microsecond (µs)", 1e-6),
      unit("ms", "Millisecond (ms)", 0.001),
      unit("s", "Second (s)", 1),
      unit("min", "Minute (min)", 60),
      unit("h", "Hour (h)", 3_600),
      unit("d", "Day", 86_400),
      unit("wk", "Week", 604_800),
      unit("yr", "Year (365.25 d)", 31_557_600),
    ],
  },
  {
    id: "data",
    label: "Digital storage",
    note: "SI units (kB, MB, GB) use 1000. Binary units (KiB, MiB, GiB) use 1024. Bits are lowercase b.",
    units: [
      unit("bit", "Bit (b)", 1),
      unit("nibble", "Nibble (4 bits)", 4),
      unit("byte", "Byte (B)", 8),
      unit("kbit", "Kilobit (kb)", 1_000),
      unit("mbit", "Megabit (Mb)", 1_000_000),
      unit("gbit", "Gigabit (Gb)", 1_000_000_000),
      unit("tbit", "Terabit (Tb)", 1e12),
      unit("kibit", "Kibibit (Kibit)", 1024),
      unit("mibit", "Mebibit (Mibit)", 1024 ** 2),
      unit("kb", "Kilobyte (kB)", 8_000),
      unit("mb", "Megabyte (MB)", 8_000_000),
      unit("gb", "Gigabyte (GB)", 8e9),
      unit("tb", "Terabyte (TB)", 8e12),
      unit("pb", "Petabyte (PB)", 8e15),
      unit("kib", "Kibibyte (KiB)", 8 * 1024),
      unit("mib", "Mebibyte (MiB)", 8 * 1024 ** 2),
      unit("gib", "Gibibyte (GiB)", 8 * 1024 ** 3),
      unit("tib", "Tebibyte (TiB)", 8 * 1024 ** 4),
      unit("pib", "Pebibyte (PiB)", 8 * 1024 ** 5),
    ],
  },
  {
    id: "energy",
    label: "Energy",
    units: [
      unit("j", "Joule (J)", 1),
      unit("kj", "Kilojoule (kJ)", 1_000),
      unit("cal", "Calorie (cal)", 4.184),
      unit("kcal", "Kilocalorie (kcal)", 4_184),
      unit("wh", "Watt-hour (Wh)", 3_600),
      unit("kwh", "Kilowatt-hour (kWh)", 3_600_000),
      unit("btu", "British thermal unit (BTU)", 1055.05585262),
    ],
  },
  {
    id: "pressure",
    label: "Pressure",
    units: [
      unit("pa", "Pascal (Pa)", 1),
      unit("kpa", "Kilopascal (kPa)", 1_000),
      unit("bar", "Bar", 100_000),
      unit("psi", "Pound per square inch (psi)", 6894.757293168),
      unit("atm", "Atmosphere (atm)", 101_325),
      unit("torr", "Torr", 133.322368421),
      unit("mmhg", "Millimeter of mercury (mmHg)", 133.322387415),
      unit("inhg", "Inch of mercury (inHg)", 3386.389),
    ],
  },
  {
    id: "angle",
    label: "Angle",
    units: [
      unit("deg", "Degree (°)", 1),
      unit("rad", "Radian (rad)", 180 / Math.PI),
      unit("grad", "Gradian (gon)", 0.9),
      unit("arcmin", "Arcminute (′)", 1 / 60),
      unit("arcsec", "Arcsecond (″)", 1 / 3600),
      unit("turn", "Turn", 360),
    ],
  },
];

export function formatConverted(value: number) {
  if (!Number.isFinite(value)) return "—";
  if (Object.is(value, -0) || Math.abs(value) < 1e-12) return "0";
  const abs = Math.abs(value);
  if (abs >= 1e15 || abs < 1e-9) return value.toExponential(6);
  const text = abs >= 1e6 ? value.toPrecision(8) : value.toPrecision(10);
  return String(Number(text));
}

export function convertAll(kind: ConvertKind, fromId: string, raw: string) {
  const group = convertGroups.find((item) => item.id === kind);
  if (!group) throw new Error("Unknown category");
  const from = group.units.find((item) => item.id === fromId) ?? group.units[0];
  const trimmed = raw.trim();
  if (!trimmed) return group.units.map((unitItem) => ({ ...unitItem, value: "" }));
  const amount = Number(trimmed);
  if (!Number.isFinite(amount)) throw new Error("Enter a number");
  const base = from.toBase(amount);
  return group.units.map((unitItem) => ({
    ...unitItem,
    value: formatConverted(unitItem.fromBase(base)),
  }));
}
