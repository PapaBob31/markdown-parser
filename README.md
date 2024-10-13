# Markdown Parser 

_work in progress_

Markdown parsing library for javascript that follows the 
[Github Flavored Markdown Spec](https://github.github.com/gfm/ "gfm spec")

## Using the library
```typescript
parse(text: string, escapeDangerousHtml=true):string
```
Dangerous HTML Tags, namely `title`, `textarea`, `style`, `xmp`, `iframe`, `noembed`, `noframes`, `script`, `plaintext`
are filtered by default. Filtering is done by replacing the leading < with the entity &amp;lt; 

Pass `false` as the second parameter to parse to override this behaviour.

## Unsupported GFM features
- Setext headers. Only Atx Headers will be parsed
- '&' for invalid html entities aren't escaped. It will be parsed like normal text so far it conforms to the html entity syntax
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
