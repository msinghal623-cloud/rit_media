import { RssItemParser } from "./rss-item-parser.js";
import { HindustanTimesParser } from "./hindustan-times-parser.js";
import { MintParser } from "./mint-parser.js";

const PARSERS = {
  "hindustan-times": HindustanTimesParser,
  mint: MintParser
};

export function getParserForSource(source = {}) {
  const ParserClass = PARSERS[source.parser || source.id] || RssItemParser;
  return new ParserClass(source);
}
