import {test, expect} from "vitest"
import parse from "./index"

const sampleText =
`
# header 1
## header 20, 
##oops not an header but a paragraph

- List item 1
- List item 2
  *****
- List item 3 with paragraph 
embedded in a list item
  1. nested ordered list item inside the list item with a nested paragraphc
  2. I'm second sha. Incoming _Blockquote_
  
_Blockquote_
>>Blockquote of gfm markdown spec Which says 
>This line is part of the preceeding blockquote by virtue of the start symbol
And so is this line but by virtue of paragraph continuation
>> - Nested unordered list item
>   *****
<div>
# blah

<nothing>
\`\`\`js
let fencedCode = true
console.log("Inside a fenced code block")
\`\`\`
</nothing>
\`\`\`js
let fencedCode = true
console.log("Inside a fenced code block")
\`\`\`

\`\`\`js
let fencedCode = true
console.log("Inside a fenced code block")
\`\`\`

And I'm just a stand alone paragraph 
that ends here

*****
- up
  - test
I'm also test
- down
  > I'm a quote nested inside a list item
  > oejejb
> We are not related!

>>For testing nested blockquotes
ookfoer

\` normal code span na \`344 \`test\` shi

Hey man, all I'm saying is \` console.log &copy; \` is a better name than \`print\`. Template literals in js start with \`\` \` \`\`

this is bad syntax \`\`
1 + 2 === 
3
\`\`

They ought to be on the same line [link text](google.com "google's website")(blah)

\`yes code\`


- first step
  - nested under first step

  - so is this guy
    1. How far can you even nest lists

           > This blockquote will not work

<![CDATA[
<div>
html block without an actual delimiter
*which is why u can't be empahasized text*


*emphasized text*
me too [easy oh](threadgently.com 'tdg')

[**strong text**](damn.com)
***This* text is for testing *em* and __strong__ ***_elements_*** generation. 
They are indicated by surrounding the target string with _*_ and *_* respectively**

*(**foo**)* **foo "*bar*" foo** __foo bar __ __(__foo)

__foo, __bar__, baz__ 5__6__78

foo- __a __(bar)__

**foo, **bar**, baz**

**Gomphocarpus (*Gomphocarpus physocarpus*, syn.
*Asclepias physocarpa*)** a**"foo"**

+ 6
  45
\\+ ir4

.>wrong na

]]>

<!-- this content should be ommitted -->[ty](/url)
<Script>
	2*3*4
	alert("weak ass site")</SCRIPT>
who dey close am abeg \\<

    <!--
    and now for my final trick
    I don't know the programming language but 
    this feels like a lot of syntax errors
qw
- test<p class="duh"> *rtr</p>* 

- 
  foot <https://www.google.com>

- 

  nah

<a href="test.com">test</a>
### first test
- hrhr
- rijri


+ => <img src=n'ull />

+ => <img src=null/>
+ => <img src=null />  [linktext](/url title)
+ => <img src="null" /> <div> test *</div>*

## Reference links test [linktext](/url 'title')
[foo]

[foo]: /firstUrl "shortcut link"

[bar]: /secondUrl "Was defined before the ref link"

[zed][bar];

[collapsedLink][]

[
collapsedLink
]: /dest "I am a collapsed link"

3*heyyo*

* one
* two

- three
- four
- five


### test line breaks
foo\\
bar

damn  
boy  
yeah\\

*<b>damola*</b>


| *abc* | def |
| --- | --- |
| bar | baz |
| bot |


*emphasized text*
me too [easy oh](threadgently.com 'tdg')

[**strong text**](damn.com)
***This* text is for testing *em* and __strong__ ***_elements_*** generation. 
They are indicated by surrounding the target string with _*_ and *_* respectively**

*(**foo**)* **foo "*bar*" foo** __foo bar __ __(__foo)

__foo, __bar__, baz__ 5__6__78

foo- __a __(bar)__

**foo, **bar**, baz**

**Gomphocarpus (*Gomphocarpus physocarpus*, syn.
*Asclepias physocarpa*)** a**"foo"**

`;

const generatedHTML = `<h1>header 1</h1>
<h2>header 20, </h2>
<p>##oops not an header but a paragraph</p>
<ul>
  <li>
    List item 1
  </li>
  <li>
    List item 2
    <hr/>
  </li>
  <li>
    List item 3 with paragraph 
embedded in a list item
    <ol start="1">
      <li>
        nested ordered list item inside the list item with a nested paragraphc
      </li>
      <li>
        I'm second sha. Incoming <em>Blockquote</em>
      </li>
    </ol>
  </li>
</ul>
<p><em>Blockquote</em></p>
<blockquote>
  <blockquote>
    <p>Blockquote of gfm markdown spec Which says 
This line is part of the preceeding blockquote by virtue of the start symbol
And so is this line but by virtue of paragraph continuation
 - Nested unordered list item</p>
    <hr/>
  </blockquote>
</blockquote>
<div>
# blah
<nothing>
\`\`\`js
let fencedCode = true
console.log("Inside a fenced code block")
\`\`\`
</nothing>
\`\`\`js
let fencedCode = true
console.log("Inside a fenced code block")
\`\`\`
<pre class="js">
  <code>
let fencedCode = true
console.log&lpar;&quot;Inside a fenced code block&quot;&rpar;
  </code>
</pre>
<p>And I'm just a stand alone paragraph 
that ends here</p>
<hr/>
<ul>
  <li>
    up
    <ul>
      <li>
        test
I'm also test
      </li>
    </ul>
  </li>
  <li>
    down
    <blockquote>
      <p> I'm a quote nested inside a list item
 oejejb</p>
    </blockquote>
  </li>
</ul>
<blockquote>
  <p> We are not related!</p>
</blockquote>
<blockquote>
  <blockquote>
    <p>For testing nested blockquotes
ookfoer</p>
  </blockquote>
</blockquote>
<p><code>normal code span na</code>344 <code>test</code> shi</p>
<p>Hey man, all I'm saying is <code>console.log &copy;</code> is a better name than <code>print</code>. Template literals in js start with <code>\`</code></p>
<p>this is bad syntax <code>1 + 2 ===  3</code></p>
<p>They ought to be on the same line <a href="google.com" title="google&apos;s website">link text</a>(blah)</p>
<p><code>yes code</code></p>
<ul>
  <li>
    first step
    <ul>
      <li>
        <p>nested under first step</p>
      </li>
      <li>
        <p>so is this guy</p>
        <ol start="1">
          <li>
            <p>How far can you even nest lists</p>
            <pre class="">
              <code>   &gt; This blockquote will not work
              </code>
            </pre>
          </li>
        </ol>
      </li>
    </ul>
  </li>
</ul>
<![CDATA[
<div>
html block without an actual delimiter
*which is why u can't be empahasized text*


*emphasized text*
me too [easy oh](threadgently.com 'tdg')

[**strong text**](damn.com)
***This* text is for testing *em* and __strong__ ***_elements_*** generation. 
They are indicated by surrounding the target string with _*_ and *_* respectively**

*(**foo**)* **foo "*bar*" foo** __foo bar __ __(__foo)

__foo, __bar__, baz__ 5__6__78

foo- __a __(bar)__

**foo, **bar**, baz**

**Gomphocarpus (*Gomphocarpus physocarpus*, syn.
*Asclepias physocarpa*)** a**"foo"**

+ 6
  45
\\+ ir4

.>wrong na

]]>
<!-- this content should be ommitted -->[ty](/url)
<p>&lt;Script&gt;
    2<em>3</em>4
    alert("weak ass site")&lt;/SCRIPT&gt;
who dey close am abeg &lt;</p>
<pre class="">
  <code>   &lt;!--
   and now for my final trick
   I don&apos;t know the programming language but 
   this feels like a lot of syntax errors
qw
  </code>
</pre>
<ul>
  <li>
    <p>test<p class="duh"> <em>rtr</p></em> </p>
  </li>
  <li>
    <p>  foot <a href="https://www.google.com">https://www.google.com</a></p>
  </li>
  <li>
  </li>
</ul>
<p>  nah</p>
<a href="test.com">test</a>
### first test
- hrhr
- rijri
<ul>
  <li>
    <p>=&gt; &lt;img src=n'ull /&gt;</p>
  </li>
  <li>
    <p>=&gt; <img src=null/></p>
  </li>
  <li>
    <p>=&gt; <img src=null />  [linktext](/url title)</p>
  </li>
  <li>
    <p>=&gt; <img src="null" /> <div> test <em></div></em></p>
  </li>
</ul>
<h2>Reference links test <a href="/url" title="title">linktext</a></h2>
<p><a href="/firstUrl" title="shortcut link">foo</a></p>
<p><a href="/secondUrl" title="Was defined before the ref link">zed</a>;</p>
<p><a href="/dest" title="I am a collapsed link">collapsedLink</a></p>
<p>3<em>heyyo</em></p>
<ul>
  <li>
    one
  </li>
  <li>
    two
  </li>
</ul>
<ul>
  <li>
    three
  </li>
  <li>
    four
  </li>
  <li>
    five
  </li>
</ul>
<h3>test line breaks</h3>
<p>foo<br/>bar</p>
<p>damn<br/>boy<br/>yeah\\</p>
<p><em><b>damola</em></b></p>
<table>
  <thead>
    <tr>
      <th><em>abc</em></th>
      <th>def</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>bar</td>
      <td>baz</td>
    </tr>
    <tr>
      <td>bot</td>
      <td></td>
    </tr>
  </tbody>
</table>
<p><em>emphasized text</em>
me too <a href="threadgently.com" title="tdg">easy oh</a></p>
<p><a href="damn.com"><strong>strong text</strong></a>
<strong><em>This</em> text is for testing <em>em</em> and <strong>strong</strong> <em><strong><em>elements</em></strong></em> generation. 
They are indicated by surrounding the target string with <em>*</em> and <em>_</em> respectively</strong></p>
<p><em>(<strong>foo</strong>)</em> <strong>foo "<em>bar</em>" foo</strong> __foo bar __ __(__foo)</p>
<p><strong>foo, <strong>bar</strong>, baz</strong> 5__6__78</p>
<p>foo- __a <strong>(bar)</strong></p>
<p><strong>foo, <strong>bar</strong>, baz</strong></p>
<p><strong>Gomphocarpus (<em>Gomphocarpus physocarpus</em>, syn.
<em>Asclepias physocarpa</em>)</strong> a**"foo"**</p>
`

test("May the good lord forgive me", ()=>{
	expect(parse(sampleText, true)).toBe(generatedHTML);
})

test("Image Links", ()=>{
	expect(parse("![alt_text](/src 'title')", true)).toBe('<p><img src="/src" alt="alt_text" title="title"></p>\n')
})

test("Special Character Issue", ()=>{
	expect(parse(`![alt_text](/src 'ti"tle')`, true)).toBe('<p><img src="/src" alt="alt_text" title="ti&quot;tle"></p>\n')
})

test("chracter Reference", ()=>{
	expect(parse("&copy", true)).toBe('<p>&amp;copy</p>\n')
})

test("thematic breaks", ()=>{
  expect(parse("** ** *    *", true)).toBe('<hr/>\n')
  expect(parse("--", true)).toBe('<p>--</p>\n')
  expect(parse("_________", true)).toBe('<hr/>\n')
  expect(parse("---*__", true)).toBe('<p>---*__</p>\n')
})

test("Hard Line Break", () => {
  expect(parse("This won't form hard line break\\\n", true)).toBe("<p>This won't form hard line break\\</p>\n")
  expect(parse("But This\\\nwould!", true)).toBe("<p>But This<br/>would!</p>\n")
  expect(parse("Now this is an hard line break  \nBoom", true)).toBe("<p>Now this is an hard line break<br/>Boom</p>\n")
})

test("Emphasis", ()=>{
  expect(parse("__foo__bar__baz__", true)).toBe("<p><strong>foo__bar__baz</strong></p>\n")
  expect(parse("_пристаням_стремятся", true)).toBe("<p>_пристаням_стремятся</p>\n")
  expect(parse('a**"foo"**', true)).toBe(`<p>a**"foo"**</p>\n`)
  expect(parse("foo******bar*********baz", true)).toBe("<p>foo<strong><strong><strong>bar</strong></strong></strong>***baz</p>\n")
  expect(parse("_*_", true)).toBe("<p><em>*</em></p>\n")
  expect(parse("*<div class=* >*", true)).toBe("<p><em><div class=* ></em></p>\n")
  expect(parse("*<div class=* >", true)).toBe("<p>*<div class=* ></p>\n")
})

test("paragraph", ()=>{
  expect(parse("   <!-- uhuhg -->", true)).toBe("   <!-- uhuhg -->\n")
  expect(parse("[link](<urla>)", true)).toBe(`<p><a href="urla">link</a></p>\n`)
})

const tableTextBad = `
| *abc* | def |
| -1-- | --5- |
| bar | baz |
| bot |
`

const tableHTMLBad = `<p>| <em>abc</em> | def |
| -1-- | --5- |
| bar | baz |
| bot |</p>
`

const tableText2 = `
clap | abc ||
| ---- | ---- | ---- |
| bar | baz |
| bot |
| 1   | 2   | 3| 4 |
nodelimiter
`

const tableHTML2 = `<table>
  <thead>
    <tr>
      <th>clap</th>
      <th>abc</th>
      <th></th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>bar</td>
      <td>baz</td>
      <td></td>
    </tr>
    <tr>
      <td>bot</td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td>1</td>
      <td>2</td>
      <td>3</td>
    </tr>
    <tr>
      <td>nodelimiter</td>
      <td></td>
      <td></td>
    </tr>
  </tbody>
</table>
`

const noDelimiterRowTable = `
| fruit | number |
| Apple | 2 |
| Oranges | 15 |
| Bananas | 345|
`

const noDelimiterTableOutput = `<p>| fruit | number |
| Apple | 2 |
| Oranges | 15 |
| Bananas | 345|</p>
`

const properTable = `
| ab\\|c | def |
| --- | --- |
| bar | baz |
| bot | cab |
`

const properTableHtml = `<table>
  <thead>
    <tr>
      <th>ab|c</th>
      <th>def</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>bar</td>
      <td>baz</td>
    </tr>
    <tr>
      <td>bot</td>
      <td>cab</td>
    </tr>
  </tbody>
</table>
`

test("Table", ()=>{
  expect(parse(tableTextBad, true)).toBe(tableHTMLBad);
  expect(parse(tableText2, true)).toBe(tableHTML2);
  expect(parse(noDelimiterRowTable, true)).toBe(noDelimiterTableOutput);
  expect(parse(properTable, true)).toBe(properTableHtml)
})

const linkTest = `
[test]: /test "test"
[test2]: /test-2 "okay"
residual

[test]
[test2]
`
const linkOutput = `<p>residual</p>
<p><a href="/test" title="test">test</a>\n<a href="/test-2" title="okay">test2</a></p>
`

const linkTestWithUriBounds = `
[tes\\]t]: </ tb \\>est> "te4st\\""

[tes\\]t]
`

const linkOutputWithUriBounds = `<p><a href="/%20tb%20>est" title="te4st&quot;">tes]t</a></p>
`

test("Link Reference Definitions", ()=>{
  expect(parse(linkTest, true)).toBe(linkOutput)
  expect(parse(linkTestWithUriBounds, true)).toBe(linkOutputWithUriBounds)
})