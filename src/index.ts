
import { openSync, writeSync, closeSync } from "node:fs";
import parse from "./parser"
import { generateHtml, traverseTreeToGetLinkRefs } from "./parserHelper"


export interface HtmlNode {
	parentNode: HtmlNode;
	nodeName: string;
	textContent?: string;
	closed?: boolean;
	children: HtmlNode[];
	indentLevel?: number;
	fenceLength?: number;
	infoString?: string;
	startNo?: string;
}


function main() {
	// reference links aren't supported
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
  1. nested ordered list item inside the list item with a nested paragraph
  2. I'm second sha. Incoming Blockquote

>>Blockquote of gfm markdown spec Which says 
>This line is part of the preceeding blockquote by virtue of the start symbol
And so is this line but by virtue of paragraph continuation
> - Nested unordered list item
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
> We are not related!
		
\` normal code span na \`344 \`test\` shi

Hey man, all I'm saying is \` console.log &copy; \` is a better name than \`print\`. Template literals in js start with \`\` \` \`\`

this is bad syntax \`\`
1 + 2 === 
3
\`\`

They ought to be on the same line [link text](google.com "google's website")(blah)

\`yes code\`

<div>
html block without an actual delimiter
*which is why u can't be empahasized text*


*emphasized text*
me too [easy oh](threadgently.com 'tdg')

[**strong text**](damn.com)

<!-- this content should be ommitted -->

who dey close am abeg \\<

    and now for my final trick
    I don't know the programming language but 
    this feels like a lot of syntax errors

- 

  45
`;

	const root:HtmlNode = {parentNode: null as any, nodeName: "main", indentLevel: 0, closed: false, children: []}
	// I don't really know why I was able to cast null to any so check typescript docs later
	let lastOpenedNode: HtmlNode = root; 
	parse(sampleText, root);
	const linkRefs = traverseTreeToGetLinkRefs(root);

	return generateHtml(root, 0, linkRefs)
}

const fd = openSync("./output.html", "w");
writeSync(fd, main());
closeSync(fd);
