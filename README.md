# Markdown Parser 

_work in progress_

Markdown parsing library for javascript that follows the 
[Common Mark Spec](https://spec.commonmark.org/0.31.2/ "gfm spec")

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