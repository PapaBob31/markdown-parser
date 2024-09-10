import { openSync, writeSync, closeSync } from "node:fs";

import generateBlockNodesTree from "./lib/blockNodesTreeGen"
import generateHtmlFromTree, { traverseTreeToGetLinkRefs } from "./lib/htmlGenerator"

export interface HtmlNode {
	parentNode: HtmlNode;
	nodeName: string;
	textContent?: string;
	closed: boolean;
	children: HtmlNode[];
	indentLevel?: number;
	fenceLength?: number;
	infoString?: string;
	startNo?: string;
}

export default function parse(textStream: string) {
	const root = generateBlockNodesTree(textStream);
	const linkRefs = traverseTreeToGetLinkRefs(root);
	const generatedHtml = generateHtmlFromTree(root, 0, linkRefs)
	return generatedHtml;
}


// for testing the code
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

<script>
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

<!-- this content should be ommitted -->[ty](/url)
</script>
who dey close am abeg \\<

    and now for my final trick
    I don't know the programming language but 
    this feels like a lot of syntax errors
qw
- test

- 
  foot

- 

  nah

## Reference links test
[foo]

[foo]: /firstUrl "shortcut link"

[bar]: /secondUrl "Was defined before the ref link"

[zed][bar];

[collapsedLink][]

[
collapsedLink
]: /dest "I am a collapsed link"
`;

const fd = openSync("./output.html", "w");
writeSync(fd, parse(sampleText));
closeSync(fd);
