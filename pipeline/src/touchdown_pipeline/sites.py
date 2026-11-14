from dataclasses import dataclass

NASA_ARTEMIS_III_2022 = "https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-Moon/"
NASA_ARTEMIS_III_2024 = "https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/"


@dataclass(frozen=True)
class LunarSite:
    id: str
    name: str
    program: str
    region: str
    lat: float
    lon: float
    has_terrain: bool
    coord_source: str
    approx: bool
    notes: str


CURATED_SITES: tuple[LunarSite, ...] = (
    LunarSite(
        id="malapert-a",
        name="Malapert A (IM-1 Odysseus)",
        program="CLPS",
        region="south-pole",
        lat=-80.13,
        lon=1.44,
        has_terrain=True,
        coord_source="https://www.nasa.gov/missions/lro/nasas-lro-images-intuitive-machines-odysseus-lander/",
        approx=False,
        notes="Intuitive Machines IM-1 lander Odysseus touched down on 22 February 2024 near Malapert A crater.",
    ),
    LunarSite(
        id="mons-mouton",
        name="Mons Mouton (IM-2 Athena)",
        program="CLPS / Artemis",
        region="south-pole",
        lat=-84.7906,
        lon=29.1957,
        has_terrain=True,
        coord_source="https://lroc.im-ldi.com/images/1408",
        approx=False,
        notes="Intuitive Machines IM-2 lander Athena reached the surface on 6 March 2025. Mons Mouton is also on NASA's 2024 list of Artemis III candidate landing regions.",
    ),
    LunarSite(
        id="malapert-massif",
        name="Malapert Massif",
        program="Artemis III",
        region="south-pole",
        lat=-85.97,
        lon=-2.50,
        has_terrain=True,
        coord_source=NASA_ARTEMIS_III_2024,
        approx=True,
        notes="Artemis III candidate landing region on NASA's 2022 and 2024 lists, about 15 by 15 km. NASA does not publish a centre coordinate for it.",
    ),
    LunarSite(
        id="shackleton-ridge",
        name="Shackleton Connecting Ridge",
        program="Artemis III",
        region="south-pole",
        lat=-89.45,
        lon=-137.40,
        has_terrain=True,
        coord_source=NASA_ARTEMIS_III_2022,
        approx=True,
        notes="Connecting Ridge, an Artemis III candidate landing region on NASA's 2022 list of 13 and absent from the 2024 list of nine. NASA does not publish a centre coordinate for it.",
    ),
    LunarSite(
        id="nobile-rim-1",
        name="Nobile Rim 1",
        program="Artemis III",
        region="south-pole",
        lat=-85.30,
        lon=36.92,
        has_terrain=True,
        coord_source=NASA_ARTEMIS_III_2024,
        approx=True,
        notes="Artemis III candidate landing region on NASA's 2022 and 2024 lists, about 15 by 15 km. NASA does not publish a centre coordinate for it.",
    ),
    LunarSite(
        id="nobile-rim-2",
        name="Nobile Rim 2",
        program="Artemis III",
        region="south-pole",
        lat=-84.20,
        lon=60.70,
        has_terrain=True,
        coord_source=NASA_ARTEMIS_III_2024,
        approx=True,
        notes="Artemis III candidate landing region on NASA's 2022 and 2024 lists, about 15 by 15 km. NASA does not publish a centre coordinate for it.",
    ),
    LunarSite(
        id="chandrayaan-3",
        name="Statio Shiv Shakti (Chandrayaan-3)",
        program="ISRO",
        region="mid-latitude",
        lat=-69.37,
        lon=32.32,
        has_terrain=False,
        coord_source="https://planetarynames.wr.usgs.gov/Feature/16272",
        approx=False,
        notes="Landing site of the Chandrayaan-3 Vikram lander. The IAU approved the name Statio Shiv Shakti on 19 March 2024.",
    ),
    LunarSite(
        id="change-4",
        name="Von Karman Crater (Chang'e 4)",
        program="CNSA",
        region="far-side",
        lat=-45.457,
        lon=177.589,
        has_terrain=False,
        coord_source="https://lroc.im-ldi.com/images/1087",
        approx=False,
        notes="Chang'e 4 landed on 3 January 2019 inside Von Karman crater, in the South Pole-Aitken basin on the far side.",
    ),
    LunarSite(
        id="apollo-11",
        name="Mare Tranquillitatis (Apollo 11)",
        program="Apollo",
        region="equatorial",
        lat=0.67416,
        lon=23.47314,
        has_terrain=False,
        coord_source="https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html",
        approx=False,
        notes="Apollo 11 Lunar Module landed on 20 July 1969 in Mare Tranquillitatis.",
    ),
    LunarSite(
        id="apollo-17",
        name="Taurus-Littrow (Apollo 17)",
        program="Apollo",
        region="equatorial",
        lat=20.1911,
        lon=30.7723,
        has_terrain=False,
        coord_source="https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html",
        approx=False,
        notes="Apollo 17 Lunar Module landed on 11 December 1972 in the Taurus-Littrow valley.",
    ),
)
