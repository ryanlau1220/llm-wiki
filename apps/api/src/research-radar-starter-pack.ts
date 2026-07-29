/**
 * A deliberately small, high-signal subset of the OPML list shared by the
 * project owner. Keeping this bounded makes a local Radar responsive while
 * leaving the larger OPML import available for people who want it.
 */
export const RESEARCH_RADAR_STARTER_SOURCES = [
  { name: "Simon Willison", feedUrl: "https://simonwillison.net/atom/everything/" },
  { name: "Jeff Geerling", feedUrl: "https://www.jeffgeerling.com/blog.xml" },
  { name: "Krebs on Security", feedUrl: "https://krebsonsecurity.com/feed/" },
  { name: "The Old New Thing", feedUrl: "https://devblogs.microsoft.com/oldnewthing/feed" },
  { name: "matklad", feedUrl: "https://matklad.github.io/feed.xml" },
  { name: "Hillel Wayne", feedUrl: "https://buttondown.com/hillelwayne/rss" },
  { name: "Dwarkesh Podcast", feedUrl: "https://www.dwarkeshpatel.com/feed" },
  { name: "minimaxir", feedUrl: "https://minimaxir.com/index.xml" },
] as const;
