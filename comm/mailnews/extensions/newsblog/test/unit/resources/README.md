Data files for unit testing the feeds code.

- `rss_7_1.rdf`        - Simple RSS1.0 feed example, from:
                         https://www.w3.org/2000/10/rdf-tests/RSS_1.0/rss_7_1.rdf
- `rss_7_1_BORKED.rdf` - Sabotaged version of `rss_7_1.rdf` with a bad
                         <items> list, pointing to all sorts of URLs not
                         represented as <item>s in the feed (see Bug 476641).
- `rss2_example.xml`   - RSS2.0 example from wikipedia, but with
                         Japanese text in the title, with leading/trailing
                         whitespace.

