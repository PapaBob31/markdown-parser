# Markdown Parser 

_work in progress_

Markdown parsing library for javascript that follows the 
[Github Flavored Markdown Spec](https://github.github.com/gfm/ "gfm spec")

The library provides one default exported function
```
parse(textStream [, escapeDangerousHtml])
```
`textStream`: The string to be parsed/transformed from markdown to html

`escapeDangerousHtml`: Boolean value indicating if [Dangerous HTML tags]("#dangerous-html") should be filtered.
Default value is `true`  which means dangerous html tags are filtered by default.

**Return value**: A `string` representing the html output.

## Using the library
```js
// node js
const parse_md = require("markdown-to-html").default;
text = "# Bonjour le monde"
parse_md(text) // <h1>Bonjour le monde</h1>
```
<h2 id="dangerous-html">Dangerous HTML Tags</h2>

namely `title`, `textarea`, `style`, `xmp`, `iframe`, `noembed`, `noframes`, `script`, `plaintext`
will be filtered if the `escapeDangerousHtml` parameter of the `parse_md` function is set to `true`. 
Filtering is done by replacing the leading < with the entity &amp;lt; 

## Unsupported GFM features
- [Setext headers](https://github.github.com/gfm/#setext-headings). Only Atx Headers will be parsed
- [Task list items (extension)](https://github.github.com/gfm/#setext-headings)
- [Autolinks (extension)](https://github.github.com/gfm/#autolinks-extension-)
- [Strikethrough (extension)](https://github.github.com/gfm/#strikethrough-extension-)

## Supported GFM features
1. **Leaf blocks**
   - [Thematic breaks](https://github.github.com/gfm/#thematic-breaks)
   - [ATX headings](https://github.github.com/gfm/#atx-headings)
   - [Indented code blocks](https://github.github.com/gfm/#indented-code-blocks)
   - [Fenced code blocks](https://github.github.com/gfm/#fenced-code-blocks)
   - [HTML blocks](https://github.github.com/gfm/#html-blocks)
   - [Link reference definitions](https://github.github.com/gfm/#link-reference-definitions)
   - [Paragraphs](https://github.github.com/gfm/#paragraphs)
   - [Blank lines](https://github.github.com/gfm/#blank-lines)
   - [Tables (extension)](https://github.github.com/gfm/#tables-extension-)

2. **Container blocks**
   - [Block quotes](https://github.github.com/gfm/#block-quotes)
   - [List items](https://github.github.com/gfm/#list-items)
   - [Lists](https://github.github.com/gfm/#lists)

3. **Inlines**
   - [Backslash escapes](https://github.github.com/gfm/#backslash-escapes)
   - [Entity and numeric character references](https://github.github.com/gfm/#entity-and-numeric-character-references)
   - [Code spans](https://github.github.com/gfm/#code-spans)
   - [Emphasis and strong emphasis](https://github.github.com/gfm/#emphasis-and-strong-emphasis)
   - [Links](https://github.github.com/gfm/#links)
   - [Images](https://github.github.com/gfm/#images)
   - [Autolinks](https://github.github.com/gfm/#autolinks)
   - [Raw HTML](https://github.github.com/gfm/#raw-html)
   - [Hard line breaks](https://github.github.com/gfm/#hard-line-breaks)
   - [Soft line breaks](https://github.github.com/gfm/#soft-line-breaks)
   - [Textual content](https://github.github.com/gfm/#textual-content)


## Some Notes on Tables
Rows must be delimited by pipe characters (&verbar;).

Any unescaped '&vert;' in a table row would be parsed as a table cell delimiter

As a result, '&#124;' characters can't be used inside inlines (i.e code spans, html tags) present inside a table row.
If you must use pipes in such contexts, replace pipes with any of the appropriate html entities such as `&VerticalLine`, `&verbar`, `&vert`, `&#124;`, `&x007C`

It follows evry other rule of the GFM spec